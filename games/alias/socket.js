// // Хранилище игровых комнат
const aliasRooms = {};
// // Хранилище для интервалов таймера (чтобы можно было их очищать)
const aliasIntervals = {};

module.exports = (io, socket) => {
    // // 1. Присоединение к комнате
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!aliasRooms[roomId]) {
            aliasRooms[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                currentScore: 0,
                maxRounds: 3,
                currentRound: 1,
                teams: { 1: { score: 0 }, 2: { score: 0 } }
            };
        }
        const room = aliasRooms[roomId];
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        room.players.push({ id: socket.id, name: playerName, team: teamId, isHost: room.players.length === 0 });

        io.to(roomKey).emit('alias-update-lobby', { roomId, players: room.players });
    });

    // // 2. Нажатие кнопки старта (requestStart)
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = aliasRooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerLimit = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            startNewTurn(io, roomId);
        }
    });

    // // 3. Обработка действия (Угадано/Пропуск)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = aliasRooms[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendWord(io, roomId);
        }
    });
};

// // Функция: запуск нового хода игрока
function startNewTurn(io, roomId) {
    const room = aliasRooms[roomId];
    const activePlayer = room.players[room.activeIdx];
    room.currentScore = 0;

    // // Показываем экран подготовки
    io.to(`alias_${roomId}`).emit('alias-prep-screen', { playerName: activePlayer.name });

    // // Через 4 секунды начинаем саму игру
    setTimeout(() => {
        if (room.gameStarted) {
            sendWord(io, roomId);
            startTimer(io, roomId);
        }
    }, 4000);
}

// // Функция: выдача слова и выбор судьи
function sendWord(io, roomId) {
    const room = aliasRooms[roomId];
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[0] : active;

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        word: word,
        activePlayerId: active.id,
        swiperId: swiper.id
    });
}

// // Функция: серверный таймер
function startTimer(io, roomId) {
    const room = aliasRooms[roomId];
    let time = room.timerLimit;
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        time--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft: time });
        if (time <= 0) {
            clearInterval(aliasIntervals[roomId]);
            endTurn(io, roomId);
        }
    }, 1000);
}

// // Функция: завершение хода
function endTurn(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    room.teams[active.team].score += room.currentScore;

    room.activeIdx++;
    if (room.activeIdx >= room.players.length) {
        room.activeIdx = 0;
        room.currentRound++;
    }

    if (room.currentRound > room.maxRounds) {
        io.to(`alias_${roomId}`).emit('alias-game-over', { teams: room.teams });
    } else {
        startNewTurn(io, roomId);
    }
}
