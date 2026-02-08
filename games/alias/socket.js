// Хранилище всех активных комнат Alias в оперативной памяти
const roomsAlias = {};

module.exports = (io, socket) => {
    
    // --- ДЕЙСТВИЕ: Вход в комнату Alias ---
    // roomId - ID комнаты, playerName - имя игрока
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey); // Подключаем сокет к комнате

        // Если комнаты нет — создаем структуру
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],       // Участники
                gameStarted: false, // Статус
                activeIdx: 0,      // Индекс того, кто сейчас объясняет
                gamePool: [],      // Стак слов на игру
                timerVal: 60,      // Время на один ход
                currentScore: 0    // Текущий счет раунда (для живого отображения)
            };
        }

        const room = roomsAlias[roomId];
        
        // Проверка на повторный вход (реконнект)
        const existing = room.players.find(p => p.name === playerName);
        if (existing) {
            existing.id = socket.id;
        } else {
            // Добавляем игрока. Первый зашедший получает флаг хоста (isHost)
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                isHost: room.players.length === 0 
            });
        }

        // Отправляем всем в комнате обновленное лобби
        io.to(roomKey).emit('alias-update-lobby', { 
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // --- ДЕЙСТВИЕ: Старт игры ---
    // Вызывается хостом, передает настройки и перемешанный массив слов
    socket.on('alias-start', ({ roomId, words, timer }) => {
        const room = roomsAlias[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;                 // Сохраняем присланные слова
            room.timerVal = parseInt(timer) || 60; // Настраиваем время
            room.activeIdx = 0;                    // Начинает первый в списке
            room.currentScore = 0;                 // Сбрасываем счет раунда
            
            // Запускаем первый ход
            sendAliasTurn(io, roomId, true);
        }
    });

    // --- ДЕЙСТВИЕ: Угадал или Пропустил ---
    // Обрабатывает изменение счета и выдает новое слово
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            // В Alias: угадал +1, пропустил -1
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;
            
            // Начисляем очки конкретному игроку (тому, кто объясняет)
            room.players[room.activeIdx].score += points;

            // Сразу синхронизируем общий счет раунда для всех
            io.to(`alias_${roomId}`).emit('alias-update-score', {
                score: room.currentScore
            });

            // Выдаем следующее слово без сброса таймера
            sendAliasTurn(io, roomId, false);
        }
    });

    // --- ДЕЙСТВИЕ: Завершение хода по времени ---
    socket.on('alias-timeout', (roomId) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            // Передаем ход следующему по списку
            room.activeIdx = (room.activeIdx + 1) % room.players.length;
            room.currentScore = 0; // Сбрасываем счетчик для нового хода

            // Запускаем новый ход со сбросом таймера (isNewPlayer = true)
            sendAliasTurn(io, roomId, true);
        }
    });

    // --- ДЕЙСТВИЕ: Выход из комнаты ---
    socket.on('alias-leave', (roomId) => {
        handleAliasLeave(io, socket, roomId);
    });

    // Обработка обрыва соединения
    socket.on('disconnect', () => {
        for (const roomId in roomsAlias) {
            if (roomsAlias[roomId].players.some(p => p.id === socket.id)) {
                handleAliasLeave(io, socket, roomId);
            }
        }
    });
};

// --- ФУНКЦИЯ: Генерация и отправка данных о ходе ---
function sendAliasTurn(io, roomId, isNewPlayer = false) {
    const room = roomsAlias[roomId];
    const roomKey = `alias_${roomId}`;

    // Если слова в базе кончились
    if (!room || room.gamePool.length === 0) {
        io.to(roomKey).emit('alias-game-over', { players: room.players });
        room.gameStarted = false;
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const currentWord = room.gamePool.pop(); // Берем верхнее слово

    // Рассылаем данные: кто водит, слово и настройки
    io.to(roomKey).emit('alias-new-turn', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name,
        word: currentWord,
        timer: room.timerVal,
        isNewPlayer: isNewPlayer
    });
}

// --- ФУНКЦИЯ: Очистка при выходе ---
function handleAliasLeave(io, socket, roomId) {
    const room = roomsAlias[roomId];
    if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        const roomKey = `alias_${roomId}`;
        
        if (room.players.length === 0) {
            delete roomsAlias[roomId];
        } else {
            // Если вышел хост — передаем корону другому
            if (!room.players.some(p => p.isHost)) {
                room.players[0].isHost = true;
            }
            io.to(roomKey).emit('alias-update-lobby', { players: room.players });
        }
    }
    socket.leave(`alias_${roomId}`);
}
