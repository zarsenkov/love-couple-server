const roomsAlias = {};
const aliasIntervals = {};
const TEAM_NAMES = ["Еноты", "Панды", "Зайцы", "Львы"];

module.exports = (io, socket) => {
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [], gameStarted: false, activeIdx: 0,
                teams: {
                    1: { name: TEAM_NAMES[0], score: 0 },
                    2: { name: TEAM_NAMES[1], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        const team = (room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length) ? 1 : 2;
        
        room.players.push({ id: socket.id, name: playerName, team, isHost: room.players.length === 0 });

        io.to(roomKey).emit('alias-update-lobby', { roomId, players: room.players, teams: room.teams });
    });

    socket.on('alias-start', (data) => {
        const room = roomsAlias[data.roomId];
        if (room) {
            Object.assign(room, { gameStarted: true, gamePool: data.words, timerVal: data.timer, maxRounds: data.maxRounds, currentRound: 1, activeIdx: 0, currentScore: 0 });
            sendPrep(io, data.roomId);
        }
    });

    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendWord(io, roomId);
        }
    });
};

function sendPrep(io, rId) {
    const room = roomsAlias[rId];
    const active = room.players[room.activeIdx];
    io.to(`alias_${rId}`).emit('alias-prep-screen', { playerName: active.name, teamName: room.teams[active.team].name });
    setTimeout(() => sendWord(io, rId), 4000);
}

function sendWord(io, rId) {
    const room = roomsAlias[rId];
    if (!room) return;
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // Находим "Свайпера" (случайный игрок из ТЕКУЩЕЙ команды, но не сам объясняющий)
    // Если в команде один человек — свайпает он сам (но это скучно)
    const teamMates = room.players.filter(p => p.team === active.team && p.id !== active.id);
    const swiperId = teamMates.length > 0 ? teamMates[Math.floor(Math.random()*teamMates.length)].id : active.id;

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word, 
            activePlayerId: active.id, 
            isSwiper: p.id === swiperId 
        });
    });
}
