// Хранилище комнат Alias
const roomsAlias = {};

module.exports = (io, socket) => {
    
    // Вход в комнату
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // Инициализация комнаты
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 60,
                currentScore: 0
            };
        }

        const room = roomsAlias[roomId];
        
        // Проверяем, есть ли уже игрок с таким ID (реконнект)
        const existingIdx = room.players.findIndex(p => p.id === socket.id);
        if (existingIdx === -1) {
            // Добавляем нового игрока
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                // Если игроков 0, то первый становится хостом
                isHost: room.players.length === 0 
            });
        }

        // Отправляем всем в комнате (включая вошедшего) обновление
        io.to(roomKey).emit('alias-update-lobby', { 
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // ... остальной код (alias-start, alias-action, alias-timeout) остается без изменений ...
};
