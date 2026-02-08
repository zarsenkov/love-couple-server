const roomsSpy = {};
const { LOCATIONS } = require('./cards'); // Подключаем локации

module.exports = function(io, socket) {
    // // ВХОД В ИГРУ
    socket.on('spy-join', ({ roomId, playerName }) => {
        if (!roomsSpy[roomId]) {
            roomsSpy[roomId] = { 
                id: roomId, players: [], status: 'LOBBY', 
                readyCount: 0, location: '', spies: [], votes: {} 
            };
        }
        const room = roomsSpy[roomId];
        const isHost = room.players.length === 0;
        
        room.players.push({ id: socket.id, name: playerName, isHost: isHost });
        socket.join(roomId);
        io.to(roomId).emit('spy-update-lobby', { roomId, players: room.players });
    });

    // // РАСПРЕДЕЛЕНИЕ РОЛЕЙ
    socket.on('spy-start-request', (roomId) => {
        const room = roomsSpy[roomId];
        if (!room || room.players.length < 3) return;

        room.status = 'READY_CHECK';
        room.readyCount = 0;
        room.location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
        
        // Расчет шпионов (1 на 3-5 чел, 2 на 6+)
        const spyCount = room.players.length >= 6 ? 2 : 1;
        const shuffled = [...room.players].sort(() => 0.5 - Math.random());
        room.spies = shuffled.slice(0, spyCount).map(p => p.id);

        room.players.forEach(p => {
            const isSpy = room.spies.includes(p.id);
            io.to(p.id).emit('spy-init-roles', {
                role: isSpy ? "ШПИОН" : "ЖИТЕЛЬ",
                location: isSpy ? "???" : room.location,
                isSpy: isSpy
            });
        });
    });

    // // ИГРОК ОЗНАКОМИЛСЯ
    socket.on('spy-player-ready', (roomId) => {
        const room = roomsSpy[roomId];
        if (!room) return;
        room.readyCount++;
        io.to(roomId).emit('spy-ready-update', { ready: room.readyCount, total: room.players.length });

        if (room.readyCount >= room.players.length) {
            room.status = 'INGAME';
            io.to(roomId).emit('spy-game-begin', 300); // 5 минут
            
            // Авто-переход к голосованию через 5 минут
            setTimeout(() => {
                if(room.status === 'INGAME') startVoting(io, roomId);
            }, 300000);
        }
    });

    // // ГОЛОСОВАНИЕ
    socket.on('spy-cast-vote', ({ roomId, targetId }) => {
        const room = roomsSpy[roomId];
        if (!room) return;
        room.votes[targetId] = (room.votes[targetId] || 0) + 1;

        if (Object.values(room.votes).reduce((a, b) => a + b, 0) >= room.players.length) {
            calculateResults(io, roomId);
        }
    });

    // // ВЫХОД
    socket.on('disconnect', () => {
        for (const rid in roomsSpy) {
            roomsSpy[rid].players = roomsSpy[rid].players.filter(p => p.id !== socket.id);
            io.to(rid).emit('spy-update-lobby', { roomId: rid, players: roomsSpy[rid].players });
        }
    });
};

function startVoting(io, roomId) {
    const room = roomsSpy[roomId];
    room.status = 'VOTING';
    io.to(roomId).emit('spy-start-voting', room.players);
}

function calculateResults(io, roomId) {
    const room = roomsSpy[roomId];
    const sortedVotes = Object.entries(room.votes).sort((a,b) => b[1] - a[1]);
    const mostVotedId = sortedVotes[0][0];
    const spyWin = !room.spies.includes(mostVotedId);

    io.to(roomId).emit('spy-results', {
        spyWin,
        location: room.location,
        votes: room.votes,
        players: room.players,
        spies: room.spies
    });
    delete roomsSpy[roomId]; // Очистка комнаты
}
