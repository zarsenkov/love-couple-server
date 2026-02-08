// // Хранилище игровых сессий
const roomsAlias = {};
// // Хранилище интервалов таймера
const aliasIntervals = {};
// // Названия команд (можно расширять)
const TEAM_NAMES = ["Дерзкие Еноты", "Тайные Агенты", "Крутые Перцы", "Ночные Совы"];

module.exports = (io, socket) => {

    // // СОБЫТИЕ: Присоединение к комнате
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Создаем объект комнаты, если его нет
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                timerVal: 60,
                maxRounds: 3,
                currentRound: 1,
                currentScore: 0,
                teams: {
                    1: { name: TEAM_NAMES[0], score: 0 },
                    2: { name: TEAM_NAMES[1], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        // // Балансировка команд
        const team1Count = room.players.filter(p => p.team === 1).length;
        const team2Count = room.players.filter(p => p.team === 2).length;
        const assignedTeam = team1Count <= team2Count ? 1 : 2;

        const newPlayer = {
            id: socket.id,
            name: playerName,
            team: assignedTeam,
            isHost: room.players.length === 0
        };
        room.players.push(newPlayer);

        // // Рассылаем обновленное лобби
        io.to(roomKey).emit('alias-update-lobby', {
            roomId,
            players: room.players,
            teams: room.teams
        });
    });

    // // СОБЫТИЕ: Хост нажимает "Начать"
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = roomsAlias[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words; // // Массив слов из cards.js
            room.timerVal = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.activeIdx = 0;
            room.currentScore = 0;
            
            sendPrepScreen(io, roomId);
        }
    });

    // // СОБЫТИЕ: Угадано / Пропуск (от Свайпера)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendNextWord(io, roomId);
        }
    });
};

// // ФУНКЦИЯ: Показ экрана подготовки (4 сек)
function sendPrepScreen(io, roomId) {
    const room = roomsAlias[roomId];
    const activePlayer = room.players[room.activeIdx];
    
    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: room.teams[activePlayer.team].name
    });

    // // Автоматический старт таймера после паузы
    setTimeout(() => {
        if (room && room.gameStarted) {
            runGameTimer(io, roomId);
            sendNextWord(io, roomId);
        }
    }, 4000);
}

// // ФУНКЦИЯ: Рассылка слова и назначение Свайпера
function sendNextWord(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) return;

    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Свайпер — случайный игрок из ДРУГОЙ команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : active;

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word,
            activePlayerId: active.id,
            isSwiper: p.id === swiper.id // // Флаг, разрешающий управление
        });
    });
}

// // ФУНКЦИЯ: Запуск таймера хода
function runGameTimer(io, roomId) {
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

// // ФУНКЦИЯ: Завершение хода
function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    const active = room.players[room.activeIdx];
    room.teams[active.team].score += room.currentScore;

    // // Проверка на конец круга
    if (room.activeIdx === room.players.length - 1) {
        if (room.currentRound >= room.maxRounds) {
            // // Конец игры
            return io.to(`alias_${roomId}`).emit('alias-game-over', {
                winner: room.teams[1].score > room.teams[2].score ? room.teams[1].name : room.teams[2].name,
                team1Score: room.teams[1].score,
                team2Score: room.teams[2].score
            });
        }
        room.currentRound++;
    }
    
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    room.currentScore = 0;
    sendPrepScreen(io, roomId);
}
