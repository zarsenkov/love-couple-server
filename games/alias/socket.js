// // Хранилище комнат
const roomsAlias = {};
const aliasIntervals = {};
const TEAM_NAMES = ["Дерзкие Еноты", "Тайные Агенты", "Крутые Перцы", "Ночные Совы", "Ленивые Панды"];

module.exports = (io, socket) => {
    
    // // Вход в игру с рандомным распределением команд
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 60,
                currentScore: 0,
                teams: {
                    1: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], score: 0 },
                    2: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        if (!room.players.find(p => p.id === socket.id)) {
            // // Считаем количество людей в каждой команде
            const countT1 = room.players.filter(p => p.team === 1).length;
            const countT2 = room.players.filter(p => p.team === 2).length;
            
            // // Сажаем в ту, где меньше
            const assignedTeam = countT1 <= countT2 ? 1 : 2;

            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                isHost: room.players.length === 0,
                team: assignedTeam 
            });
        }

        io.to(roomKey).emit('alias-update-lobby', { 
            roomId, players: room.players, teams: room.teams 
        });
    });

    // // Остальная логика старта и таймеров остается прежней...
    // // (Смотри предыдущий socket.js)
};
