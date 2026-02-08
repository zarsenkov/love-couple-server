// // Хранилище комнат и интервалов таймера
const aliasRooms = {};
const aliasIntervals = {};

module.exports = (io, socket) => {
    // // Вход в комнату
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!aliasRooms[roomId]) {
            aliasRooms[roomId] = {
                players: [], gameStarted: false, activeIdx: 0,
                gamePool: [], timerVal: 60, maxRounds: 3, currentRound: 1, currentScore: 0,
                teams: { 1: { name: "Еноты", score: 0 }, 2: { name: "Панды", score: 0 } }
            };
        }
        const room = aliasRooms[roomId];
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        room.players.push({ id: socket.id, name: playerName, team: teamId, isHost: room.players.length === 0 });

        io.to(roomKey).emit('alias-update-lobby', { roomId, players: room.players });
    });

    // // Старт игры (нажатие "ПОГНАЛИ")
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = aliasRooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.activeIdx = 0;
            room.currentRound = 1;
            startAliasTurn(io, roomId);
        }
    });

    // // Действие со словом
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = aliasRooms[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendNextWord(io, roomId);
        }
    });
};

// // Запуск хода одного игрока
function startAliasTurn(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    room.currentScore = 0;

    io.to(`alias_${roomId}`).emit('alias-prep-screen', { playerName: active.name });

    // // Пауза 4 сек на подготовку, потом старт таймера и первого слова
    setTimeout(() => {
        if (room.gameStarted) {
            sendNextWord(io, roomId);
            runServerTimer(io, roomId);
        }
    }, 4000);
}

// // Серверный таймер
function runServerTimer(io, roomId) {
    const room = aliasRooms[roomId];
    let time = room.timerVal;
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        time--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft: time });
        if (time <= 0) {
            clearInterval(aliasIntervals[roomId]);
            endAliasTurn(io, roomId);
        }
    }, 1000);
}

// // Отправка слова и выбор СУДЬИ
function sendNextWord(io, roomId) {
    const room = aliasRooms[roomId];
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random()*enemies.length)] : active;

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        word: word, activePlayerId: active.id, swiperId: swiper.id
    });
}

// // Конец хода и проверка на конец игры
function endAliasTurn(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    
    room.teams[active.team].score += room.currentScore;
    room.activeIdx++;

    // // Если все игроки сходили — круг закончен
    if (room.activeIdx >= room.players.length) {
        room.activeIdx = 0;
        room.currentRound++;
    }

    // // Проверка завершения игры
    if (room.currentRound > room.maxRounds) {
        io.to(`alias_${roomId}`).emit('alias-game-over', { teams: room.teams });
        room.gameStarted = false;
    } else {
        startAliasTurn(io, roomId);
    }
}
