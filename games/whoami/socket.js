const roomsWhoAmI = {};

module.exports = (io, socket) => {
    // 1. Вход в игру
    socket.on('whoami-join', ({ roomId, playerName }) => {
        const roomKey = `whoami_${roomId}`;
        socket.join(roomKey);

        if (!roomsWhoAmI[roomId]) {
            roomsWhoAmI[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 90,
                maxRounds: 3,
                currentRound: 1
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

    // 2. Старт игры (Хост)
socket.on('whoami-start', ({ roomId, words, timer, rounds }) => {
    const room = roomsWhoAmI[roomId];
    if (room) {
        room.gameStarted = true;
        room.gamePool = words;
        room.timerVal = parseInt(timer) || 90;
        room.maxRounds = parseInt(rounds) || 3; // Установка раундов
        room.currentRound = 1;
        room.activeIdx = 0;
        room.players.forEach(p => p.score = 0); // Сброс очков перед новой игрой
        sendWhoAmITurn(io, roomId, true);
    }
});

    // 3. Действие: "Угадал" или "Пас"
    socket.on('whoami-action', ({ roomId, isCorrect }) => {
        const room = roomsWhoAmI[roomId];
        if (room && room.gameStarted) {
            if (isCorrect) {
                room.players[room.activeIdx].score++;
            }
            // Передаем false, чтобы таймер у этого же игрока НЕ сбрасывался
            sendWhoAmITurn(io, roomId, false);
        }
    });

    // 4. Время вышло — переход хода
socket.on('whoami-timeout', (roomId) => {
    const room = roomsWhoAmI[roomId];
    if (room && room.gameStarted) {
        // Если сходил последний игрок в списке — круг (раунд) завершен
        if (room.activeIdx === room.players.length - 1) {
            room.currentRound++;
        }

        if (room.currentRound > room.maxRounds) {
            // ИГРА ОКОНЧЕНА
            room.gameStarted = false;
            io.to(`whoami_${roomId}`).emit('whoami-game-over', { players: room.players });
        } else {
            // СЛЕДУЮЩИЙ ИГРОК
            room.activeIdx = (room.activeIdx + 1) % room.players.length;
            sendWhoAmITurn(io, roomId, true);
        }
    }
});

    // 5. Выход из комнаты
    socket.on('whoami-leave', (roomId) => {
        handleLeave(io, socket, roomId);
    });

    // 6. Обработка внезапного отключения (закрыл вкладку)
    socket.on('disconnect', () => {
        for (const roomId in roomsWhoAmI) {
            const room = roomsWhoAmI[roomId];
            if (room.players.some(p => p.id === socket.id)) {
                handleLeave(io, socket, roomId);
            }
        }
    });
};

// --- Вспомогательные функции (вынесены за пределы экспорта) ---

function sendWhoAmITurn(io, roomId, isNewPlayer = false) {
    const room = roomsWhoAmI[roomId];
    const roomKey = `whoami_${roomId}`;

    if (!room || room.gamePool.length === 0) {
        io.to(roomKey).emit('whoami-over', { players: room.players });
        room.gameStarted = false;
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const currentWord = room.gamePool.pop();

    io.to(roomKey).emit('whoami-new-turn', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name,
        word: currentWord,
        timer: room.timerVal,
        round: room.currentRound,
        totalRounds: room.maxRounds,
        isNewPlayer: isNewPlayer
    });
}

function handleLeave(io, socket, roomId) {
    const room = roomsWhoAmI[roomId];
    if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        const roomKey = `whoami_${roomId}`;
        
        if (room.players.length === 0) {
            delete roomsWhoAmI[roomId];
        } else {
            io.to(roomKey).emit('whoami-update-lobby', { players: room.players });
        }
    }
    socket.leave(`whoami_${roomId}`);
}
