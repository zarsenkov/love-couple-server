const mafiaRooms = new Map();

function mafiaSocket(io, socket) {
    socket.on('mafia_create', ({ name }) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const room = {
            roomId,
            hostId: socket.id,
            players: [{ id: socket.id, name, isHost: true, role: null, isAlive: true }],
            status: 'lobby',
            nightActions: {},
            votes: {},
            timer: 0
        };
        mafiaRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room_data', room);
    });

    socket.on('mafia_join', ({ name, roomId }) => {
        const room = mafiaRooms.get(roomId);
        if (room && room.status === 'lobby') {
            room.players.push({ id: socket.id, name, isHost: false, role: null, isAlive: true });
            socket.join(roomId);
            io.to(roomId).emit('room_data', room);
        } else {
            socket.emit('error', 'Комната не найдена');
        }
    });

    socket.on('mafia_start_game', ({ roomId }) => {
        const room = mafiaRooms.get(roomId);
        if (room && room.hostId === socket.id) {
            assignRoles(room);
            room.status = 'reveal';
            room.players.forEach(p => {
                io.to(p.id).emit('game_start', p.role);
            });
            setTimeout(() => startNight(io, roomId), 10000);
        }
    });

    socket.on('mafia_night_action', ({ roomId, targetId, action }) => {
        const room = mafiaRooms.get(roomId);
        if (room) {
            room.nightActions[action] = targetId;
            // Если все роли сделали выбор (упрощенно: мафия сходила)
            if (Object.keys(room.nightActions).length >= (room.players.length > 6 ? 3 : 2)) {
                resolveNight(io, roomId);
            }
        }
    });

    socket.on('mafia_get_alive', ({ roomId }, callback) => {
        const room = mafiaRooms.get(roomId);
        if (room) callback(room.players.filter(p => p.isAlive));
    });

    socket.on('mafia_vote', ({ roomId, targetId }) => {
        const room = mafiaRooms.get(roomId);
        if (room) {
            room.votes[socket.id] = targetId;
            const totalAlive = room.players.filter(p => p.isAlive).length;
            if (Object.keys(room.votes).length === totalAlive) {
                resolveVoting(io, roomId);
            }
        }
    });
}

function assignRoles(room) {
    const pCount = room.players.length;
    let roles = ['mafia', 'sheriff', 'doctor'];
    if (pCount > 6) roles.push('mafia');
    while (roles.length < pCount) roles.push('citizen');
    roles = roles.sort(() => Math.random() - 0.5);
    room.players.forEach((p, i) => p.role = roles[i]);
}

function startNight(io, roomId) {
    const room = mafiaRooms.get(roomId);
    room.nightActions = {};
    io.to(roomId).emit('night_phase', room.players.filter(p => p.isAlive));
}

function resolveNight(io, roomId) {
    const room = mafiaRooms.get(roomId);
    const targetId = room.nightActions['mafia'];
    const healId = room.nightActions['doctor'];
    
    let deadId = null;
    let deadName = null;

    if (targetId && targetId !== healId) {
        const victim = room.players.find(p => p.id === targetId);
        victim.isAlive = false;
        deadId = victim.id;
        deadName = victim.name;
    }

    io.to(roomId).emit('day_phase', { deadId, deadName });
    checkWinner(io, roomId);
}

function resolveVoting(io, roomId) {
    const room = mafiaRooms.get(roomId);
    const counts = {};
    Object.values(room.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    if (sorted[0]) {
        const victim = room.players.find(p => p.id === sorted[0][0]);
        victim.isAlive = false;
    }
    
    room.votes = {};
    if (!checkWinner(io, roomId)) {
        setTimeout(() => startNight(io, roomId), 5000);
    }
}

function checkWinner(io, roomId) {
    const room = mafiaRooms.get(roomId);
    const mafia = room.players.filter(p => p.isAlive && p.role === 'mafia').length;
    const citizens = room.players.filter(p => p.isAlive && p.role !== 'mafia').length;

    if (mafia === 0) {
        io.to(roomId).emit('game_over', 'citizens');
        return true;
    }
    if (mafia >= citizens) {
        io.to(roomId).emit('game_over', 'mafia');
        return true;
    }
    return false;
}
