const whoRooms = new Map();

module.exports = (io, socket) => {
    
    socket.on('whoami_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{ id: socket.id, name: playerName, character: '', assignedTo: null, isReady: false }],
        };
        whoRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('whoami_created', { roomId, players: room.players });
    });

    socket.on('whoami_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = whoRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, character: '', assignedTo: null, isReady: false });
            socket.join(id);
            io.to(id).emit('whoami_update', room);
            socket.emit('whoami_created', { roomId: id, players: room.players });
        } else {
            socket.emit('error_msg', 'Комната не найдена');
        }
    });

    socket.on('whoami_start_naming', (roomId) => {
        const room = whoRooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.state = 'naming';
            // Цепочка: 1-й загадывает 2-му, ..., последний загадывает 1-му
            for (let i = 0; i < room.players.length; i++) {
                const targetIdx = (i + 1) % room.players.length;
                room.players[i].assignedTo = room.players[targetIdx].id;
            }
            io.to(roomId).emit('whoami_naming_phase', room);
        }
    });

    socket.on('whoami_set_character', ({ roomId, character }) => {
        const room = whoRooms.get(roomId);
        if (!room) return;

        const sender = room.players.find(p => p.id === socket.id);
        const target = room.players.find(p => p.id === sender.assignedTo);
        
        target.character = character;
        sender.isReady = true;

        const allReady = room.players.every(p => p.isReady);
        if (allReady) {
            room.state = 'playing';
            io.to(roomId).emit('whoami_game_start', room);
        } else {
            io.to(roomId).emit('whoami_update_naming', room);
        }
    });

    socket.on('disconnect', () => {
        whoRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length < 2 && room.state !== 'lobby') {
                    io.to(roomId).emit('error_msg', 'Игрок вышел. Игра окончена.');
                    whoRooms.delete(roomId);
                } else if (room.players.length === 0) {
                    whoRooms.delete(roomId);
                } else {
                    io.to(roomId).emit('whoami_update', room);
                }
            }
        });
    });
};