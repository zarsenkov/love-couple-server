const roomsWhoAmI = {};

module.exports = (io, socket) => {
    // Вход в игру "Кто я"
    socket.on('whoami-join', ({ roomId, playerName }) => {
        const roomKey = `whoami_${roomId}`;
        socket.join(roomKey);

        if (!roomsWhoAmI[roomId]) {
            roomsWhoAmI[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 90
            };
        }

        const room = roomsWhoAmI[roomId];
        const existing = room.players.find(p => p.name === playerName);
        
        if (existing) {
            existing.id = socket.id;
        } else {
            room.players.push({ id: socket.id, name: playerName, score: 0 });
        }

        io.to(roomKey).emit('whoami-update-lobby', { 
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // Хост запускает игру и присылает сформированный массив слов
    socket.on('whoami-start', ({ roomId, words, timer }) => {
        const room = roomsWhoAmI[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words; // Перемешанный список слов по выбранным категориям
            room.timerVal = timer || 90;
            room.activeIdx = 0;
            sendWhoAmITurn(io, roomId);
        }
    });

    // Кнопки "Угадал" или "Пас"
    socket.on('whoami-action', ({ roomId, isCorrect }) => {
        const room = roomsWhoAmI[roomId];
        if (room && room.gameStarted) {
            if (isCorrect) {
                room.players[room.activeIdx].score++;
            }
            sendWhoAmITurn(io, roomId);
        }
    });

    // Время вышло — переход хода к следующему игроку
    socket.on('whoami-timeout', (roomId) => {
        const room = roomsWhoAmI[roomId];
        if (room && room.gameStarted) {
            room.activeIdx = (room.activeIdx + 1) % room.players.length;
            sendWhoAmITurn(io, roomId);
        }
    });
};

function sendWhoAmITurn(io, roomId) {
    const room = roomsWhoAmI[roomId];
    const roomKey = `whoami_${roomId}`;

    if (!room || room.gamePool.length === 0) {
        room.gameStarted = false;
        io.to(roomKey).emit('whoami-game-over', { players: room.players });
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const currentWord = room.gamePool.pop(); // Достаем последнее слово из пула

    io.to(roomKey).emit('whoami-new-turn', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name,
        word: currentWord,
        timer: room.timerVal
    });
}
