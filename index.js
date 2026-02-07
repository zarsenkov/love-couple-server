const rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, playerName }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [], // Список объектов {id, name}
                activePlayerIndex: 0,
                gameStarted: false
            };
        }
        
        // Добавляем игрока, если его еще нет
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: playerName });
        }

        // Рассылаем всем в комнате обновленный список игроков
        io.to(roomId).emit('update-lobby', {
            players: rooms[roomId].players,
            gameStarted: rooms[roomId].gameStarted
        });
    });

    socket.on('start-game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            rooms[roomId].activePlayerIndex = 0;
            const activeId = rooms[roomId].players[0].id;
            io.to(roomId).emit('game-started', { activePlayerId: activeId });
        }
    });

    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
            const nextPlayerId = room.players[room.activePlayerIndex].id;
            io.to(roomId).emit('turn-changed', { activePlayerId: nextPlayerId });
        }
    });

    socket.on('disconnect', () => {
        // Логика удаления игрока из комнаты при выходе (по желанию)
    });
});
