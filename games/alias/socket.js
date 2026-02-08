// // Хранилище комнат и таймеров
const aliasRooms = {};
const aliasIntervals = {};

module.exports = (io, socket) => {

    // // Вход в комнату: создаем или добавляем в существующую
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        if (!aliasRooms[roomId]) {
            aliasRooms[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                currentScore: 0,
                teams: { 1: { name: "Команда 1", score: 0 }, 2: { name: "Команда 2", score: 0 } }
            };
        }

        const room = aliasRooms[roomId];
        // // Балансировка по командам
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        room.players.push({
            id: socket.id,
            name: playerName,
            team: teamId,
            isHost: room.players.length === 0
        });

        // // Обновляем лобби для всех
        io.to(roomKey).emit('alias-update-lobby', {
            roomId: roomId,
            players: room.players
        });
    });

    // // Запуск игры: срабатывает по кнопке "ПОГНАЛИ"
    socket.on('alias-start', ({ roomId, words }) => {
        const room = aliasRooms[roomId];
        if (room && !room.gameStarted) {
            room.gameStarted = true;
            room.gamePool = words; // // Список слов от клиента
            
            // // Передаем ход первому игроку
            startNewTurn(io, roomId);
        }
    });

    // // Обработка действий (Угадано/Пропуск)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = aliasRooms[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendWord(io, roomId);
        }
    });
};

// // Функция отправки нового слова
function sendWord(io, roomId) {
    const room = aliasRooms[roomId];
    if (!room || room.gamePool.length === 0) return;

    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Свайпер (тот кто отмечает) - игрок из другой команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : active;

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        word: word,
        activePlayerId: active.id,
        swiperId: swiper.id
    });
}

// // Начало нового хода
function startNewTurn(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    
    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: active.name
    });

    setTimeout(() => {
        sendWord(io, roomId);
    }, 3000);
}
