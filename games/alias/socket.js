// Объект для хранения комнат
const roomsAlias = {};

module.exports = (io, socket) => {
    
    // Вход или создание комнаты
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // Инициализация, если комнаты нет
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
        
        // Проверяем, нет ли уже такого игрока
        if (!room.players.find(p => p.id === socket.id)) {
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                isHost: room.players.length === 0 
            });
        }

        // Отправляем roomId обратно, чтобы клиент точно знал, где он
        io.to(roomKey).emit('alias-update-lobby', { 
            roomId: roomId,
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // Запуск игры
    socket.on('alias-start', ({ roomId, words, timer }) => {
        const room = roomsAlias[roomId];
        if (room && !room.gameStarted) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer) || 60;
            room.activeIdx = 0;
            room.currentScore = 0;
            
            // Вызываем функцию отправки первого слова (описана ниже)
            sendAliasTurn(io, roomId, true);
        }
    });

    // Логика ответа
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;
            room.players[room.activeIdx].score += points;

            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendAliasTurn(io, roomId, false);
        }
    });
};

// Функция отправки хода (должна быть в этом же файле)
function sendAliasTurn(io, roomId, isNewPlayer = false) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) {
        io.to(`alias_${roomId}`).emit('alias-game-over', { players: room.players });
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop();

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        activePlayerId: activePlayer.id,
        word: word,
        timer: room.timerVal
    });
}
