// // Хранилище всех активных комнат Alias
const roomsAlias = {};
// // Объект для управления интервалами таймеров (чтобы можно было их останавливать)
const aliasIntervals = {};

module.exports = (io, socket) => {
    
    // // ДЕЙСТВИЕ: Вход или создание комнаты
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Инициализируем комнату, если её еще нет
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
        
        // // Добавляем игрока, если его ID еще нет в списке
        if (!room.players.find(p => p.id === socket.id)) {
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                isHost: room.players.length === 0 
            });
        }

        // // Рассылаем обновленное лобби всем участникам
        io.to(roomKey).emit('alias-update-lobby', { 
            roomId: roomId,
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // // ДЕЙСТВИЕ: Запуск игры (только от хоста)
    socket.on('alias-start', ({ roomId, words, timer }) => {
        const room = roomsAlias[roomId];
        if (room && !room.gameStarted) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer) || 60; // // Сохраняем настройки времени
            room.activeIdx = 0;
            room.currentScore = 0;
            
            // // Начинаем первый ход и запускаем таймер
            sendAliasTurn(io, roomId, true);
            startRoomTimer(io, roomId);
        }
    });

    // // ДЕЙСТВИЕ: Угадано / Пропуск
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;
            room.players[room.activeIdx].score += points;

            // // Синхронизируем счет в реальном времени
            io.to(`alias_${roomId}`).emit('alias-update-score', { 
                score: room.currentScore 
            });
            
            // // Сразу выдаем следующее слово
            sendAliasTurn(io, roomId, false);
        }
    });

    // // Очистка при отключении игрока
    socket.on('disconnect', () => {
        for (const roomId in roomsAlias) {
            const room = roomsAlias[roomId];
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                room.players.splice(pIdx, 1);
                // // Если хост вышел, назначаем нового
                if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
                    room.players[0].isHost = true;
                }
                io.to(`alias_${roomId}`).emit('alias-update-lobby', { 
                    roomId, players: room.players 
                });
            }
        }
    });
};

// // ФУНКЦИЯ: Запуск обратного отсчета раунда
function startRoomTimer(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room) return;

    let timeLeft = room.timerVal;

    // // Сбрасываем старый интервал, если он был
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        timeLeft--;
        
        // // Отправляем тиканье всем в комнате
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft });

        if (timeLeft <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleTurnEnd(io, roomId); // // Завершаем ход по времени
        }
    }, 1000);
}

// // ФУНКЦИЯ: Завершение хода и передача следующему
function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    if (room) {
        // // Сообщаем всем, кто закончил и сколько набрал
        io.to(`alias_${roomId}`).emit('alias-turn-ended', { 
            prevPlayer: room.players[room.activeIdx].name,
            scoreGot: room.currentScore
        });

        // // Переключаем индекс игрока по кругу
        room.activeIdx = (room.activeIdx + 1) % room.players.length;
        room.currentScore = 0;

        // // Пауза 3 секунды, чтобы игроки увидели результат, затем новый ход
        setTimeout(() => {
            if (room.gameStarted && room.players.length > 0) {
                sendAliasTurn(io, roomId, true);
                startRoomTimer(io, roomId);
            }
        }, 3000);
    }
}

// // ФУНКЦИЯ: Генерация и отправка нового слова
function sendAliasTurn(io, roomId, isNewPlayer = false) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) {
        io.to(`alias_${roomId}`).emit('alias-game-over', { players: room.players });
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop(); // // Берем последнее слово из массива

    io.to(`alias_${roomId}`).emit('alias-new-turn', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name,
        word: word,
        isNewPlayer: isNewPlayer
    });
}
