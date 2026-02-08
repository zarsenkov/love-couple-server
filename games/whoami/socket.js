const whoAmIRooms = new Map();

module.exports = (io, socket) => {
    
    socket.on('whoami_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby', // lobby, naming, playing
            players: [{ id: socket.id, name: playerName, character: '', assignedTo: null }],
            settings: { category: 'Все подряд' }
        };
        whoAmIRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('whoami_created', { roomId, players: room.players });
    });

    socket.on('whoami_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = whoAmIRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, character: '', assignedTo: null });
            socket.join(id);
            io.to(id).emit('whoami_update', room);
            socket.emit('whoami_created', { roomId: id, players: room.players });
        } else {
            socket.emit('error_msg', 'Комната не найдена');
        }
    });

    socket.on('whoami_start_naming', (roomId) => {
        const room = whoAmIRooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.state = 'naming';
            // Назначаем, кто кому загадывает (по цепочке)
            for (let i = 0; i < room.players.length; i++) {
                const targetIdx = (i + 1) % room.players.length;
                room.players[i].assignedTo = room.players[targetIdx].id;
            }
            io.to(roomId).emit('whoami_naming_phase', room);
        }
    });

    socket.on('whoami_set_character', ({ roomId, character }) => {
        const room = whoAmIRooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        const target = room.players.find(p => p.id === player.assignedTo);
        target.character = character;

        // Проверяем, все ли загадали
        const ready = room.players.every(p => p.character !== '');
        if (ready) {
            room.state = 'playing';
            io.to(roomId).emit('whoami_game_start', room);
        } else {
            io.to(roomId).emit('whoami_update', room);
        }
    });

    socket.on('disconnect', () => {
        whoAmIRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) whoAmIRooms.delete(roomId);
                else io.to(roomId).emit('whoami_update', room);
            }
        });
    });
};