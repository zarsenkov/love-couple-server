// // Хранилище комнат
const roomsAlias = {};
const aliasIntervals = {};

// // Названия команд на рандом
const TEAM_NAMES = ["Красные Драконы", "Синие Кит", "Золотые Львы", "Зеленые Змеи"];

module.exports = (io, socket) => {
    
    // // Вход в комнату
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 60,
                currentScore: 0,
                // // Сохраняем названия команд для этой комнаты
                teams: {
                    1: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], players: [] },
                    2: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], players: [] }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        // // Добавляем игрока (по умолчанию в 1 команду)
        if (!room.players.find(p => p.id === socket.id)) {
            const player = { 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                isHost: room.players.length === 0,
                team: 1 // // По умолчанию первая команда
            };
            room.players.push(player);
        }

        broadcastLobby(io, roomId);
    });

    // // Смена команды игроком в лобби
    socket.on('alias-change-team', ({ roomId, teamId }) => {
        const room = roomsAlias[roomId];
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            player.team = teamId;
            broadcastLobby(io, roomId);
        }
    });

    socket.on('alias-start', ({ roomId, words, timer }) => {
        const room = roomsAlias[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer);
            room.activeIdx = 0;
            
            // // Запускаем цикл подготовки
            sendPreparationStep(io, roomId);
        }
    });

    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            sendAliasTurn(io, roomId); // // Даем следующее слово
        }
    });
};

// // ФУНКЦИЯ: Подготовка к ходу (Экран "Объясняет Андрей")
function sendPreparationStep(io, roomId) {
    const room = roomsAlias[roomId];
    const activePlayer = room.players[room.activeIdx];
    const teamName = room.teams[activePlayer.team].name;

    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: teamName,
        teamId: activePlayer.team
    });

    // // Через 4 секунды начинаем сам раунд
    setTimeout(() => {
        startRoomTimer(io, roomId);
        sendAliasTurn(io, roomId);
    }, 4000);
}

// // ФУНКЦИЯ: Рассылка данных о ходе
function sendAliasTurn(io, roomId) {
    const room = roomsAlias[roomId];
    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop();

    // // Слово видит ВРЕМЯ КОМАНДА активного игрока
    // // Противники видят заглушку
    room.players.forEach(p => {
        const isSameTeam = p.team === activePlayer.team;
        io.to(p.id).emit('alias-new-turn', {
            activePlayerId: activePlayer.id,
            activePlayerName: activePlayer.name,
            word: isSameTeam ? word : "Угадывает команда " + room.teams[activePlayer.team].name,
            isMyTeam: isSameTeam,
            currentScore: room.currentScore
        });
    });
}

function broadcastLobby(io, roomId) {
    const room = roomsAlias[roomId];
    io.to(`alias_${roomId}`).emit('alias-update-lobby', { 
        roomId, players: room.players, teams: room.teams 
    });
}

function startRoomTimer(io, roomId) {
    const room = roomsAlias[roomId];
    let timeLeft = room.timerVal;
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        timeLeft--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft });
        if (timeLeft <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleTurnEnd(io, roomId);
        }
    }, 1000);
}

function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    room.currentScore = 0;
    sendPreparationStep(io, roomId); // // Снова экран подготовки для следующего
}
