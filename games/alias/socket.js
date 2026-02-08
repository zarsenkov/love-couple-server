// // Серверная логика Alias
const roomsAlias = {};

module.exports = (io, socket) => {
    // // Вход в комнату
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [], gameStarted: false, activeIdx: 0, 
                currentScore: 0, gamePool: [], teams: { 1: { score: 0 }, 2: { score: 0 } }
            };
        }

        const room = roomsAlias[roomId];
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        room.players.push({ id: socket.id, name: playerName, team: teamId, isHost: room.players.length === 0 });

        io.to(roomKey).emit('alias-update-lobby', { roomId, players: room.players });
    });

    // // СТАРТ ИГРЫ
    socket.on('alias-start', ({ roomId, words }) => {
        const room = roomsAlias[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;
            // // Запускаем первый ход
            sendWord(io, roomId);
        }
    });

    // // Логика обработки очков
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendWord(io, roomId); // // Даем следующее слово
        }
    });
};

// // Функция отправки слова и назначения ролей
function sendWord(io, roomId) {
    const room = roomsAlias[roomId];
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Назначаем Свайпера (судью) из другой команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[0] : active;

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        word: word,
        activePlayerId: active.id,
        swiperId: swiper.id
    });
}
