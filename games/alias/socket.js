// // Хранилище данных о комнатах
const aliasRooms = {};
// // Хранилище интервалов таймера
const aliasIntervals = {};

module.exports = (io, socket) => {
    // // СОБЫТИЕ: Вход или создание комнаты
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!aliasRooms[roomId]) {
            aliasRooms[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                currentScore: 0,
                teams: {
                    1: { name: "Еноты", score: 0 },
                    2: { name: "Панды", score: 0 }
                }
            };
        }

        const room = aliasRooms[roomId];
        // // Балансировка команд
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        room.players.push({
            id: socket.id,
            name: playerName,
            team: teamId,
            isHost: room.players.length === 0
        });

        // // Обновляем лобби для всех в комнате
        io.to(roomKey).emit('alias-update-lobby', {
            roomId: roomId,
            players: room.players,
            teams: room.teams
        });
    });

    // // СОБЫТИЕ: Старт (только от Хоста)
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = aliasRooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words; // // Массив из cards.js
            room.timerVal = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.currentRound = 1;
            room.activeIdx = 0;
            
            startAliasRound(io, roomId);
        }
    });

    // // СОБЫТИЕ: Действие (Угадано/Пропуск)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = aliasRooms[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendAliasWord(io, roomId);
        }
    });
};

// // Функция: запуск нового хода
function startAliasRound(io, roomId) {
    const room = aliasRooms[roomId];
    const activePlayer = room.players[room.activeIdx];
    
    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: room.teams[activePlayer.team].name
    });

    setTimeout(() => {
        if (room.gameStarted) {
            runAliasTimer(io, roomId);
            sendAliasWord(io, roomId);
        }
    }, 4000);
}

// // Функция: выдача нового слова и назначение Свайпера
function sendAliasWord(io, roomId) {
    const room = aliasRooms[roomId];
    if (!room || room.gamePool.length === 0) return;

    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Свайпер — случайный игрок из противоположной команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : active;

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word: word,
            activePlayerId: active.id,
            swiperId: swiper.id
        });
    });
}

// // Функция: серверный таймер
function runAliasTimer(io, roomId) {
    const room = aliasRooms[roomId];
    let time = room.timerVal;
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        time--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft: time });
        if (time <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleAliasTurnEnd(io, roomId);
        }
    }, 1000);
}

function handleAliasTurnEnd(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    room.teams[active.team].score += room.currentScore;
    room.currentScore = 0;
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    if (room.activeIdx === 0) room.currentRound++;

    if (room.currentRound > room.maxRounds) {
        io.to(`alias_${roomId}`).emit('alias-game-over', {
            winner: room.teams[1].score > room.teams[2].score ? room.teams[1].name : room.teams[2].name,
            team1Score: room.teams[1].score, team2Score: room.teams[2].score
        });
    } else {
        startAliasRound(io, roomId);
    }
}
