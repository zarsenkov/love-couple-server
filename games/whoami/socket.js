// Хранилище всех активных комнат в оперативной памяти сервера
const roomsWhoAmI = {};

module.exports = (io, socket) => {
    
    // --- ДЕЙСТВИЕ: Вход игрока в комнату ---
    socket.on('whoami-join', ({ roomId, playerName }) => {
        const roomKey = `whoami_${roomId}`;
        socket.join(roomKey); // Подключаем сокет к технической комнате Socket.io

        // Если комнаты еще нет — создаем её с настройками по умолчанию
        if (!roomsWhoAmI[roomId]) {
            roomsWhoAmI[roomId] = {
                players: [],       // Список игроков
                gameStarted: false, // Идет ли сейчас игра
                activeIdx: 0,      // Индекс текущего игрока
                gamePool: [],      // Оставшиеся слова в игре
                timerVal: 90,      // Секунд на ход
                maxRounds: 3,      // Лимит раундов
                currentRound: 1    // Текущий раунд
            };
        }

        const room = roomsWhoAmI[roomId];
        
        // Проверяем, не заходит ли игрок повторно (например, после перезагрузки)
        const existing = room.players.find(p => p.name === playerName);
        if (existing) {
            existing.id = socket.id; // Обновляем ID сокета для старого имени
        } else {
            // Добавляем нового игрока в список
            room.players.push({ id: socket.id, name: playerName, score: 0 });
        }

        // Рассылаем всем в комнате обновленный список игроков
        io.to(roomKey).emit('whoami-update-lobby', { 
            players: room.players,
            gameStarted: room.gameStarted 
        });
    });

    // --- ДЕЙСТВИЕ: Старт игры (вызывается хостом) ---
    socket.on('whoami-start', ({ roomId, words, timer, rounds }) => {
        const room = roomsWhoAmI[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;                // Получаем перемешанный список слов
            room.timerVal = parseInt(timer) || 90; // Устанавливаем время из настроек
            room.maxRounds = parseInt(rounds) || 3; // Устанавливаем кол-во раундов
            room.currentRound = 1;                 // Сбрасываем счетчик раундов
            room.activeIdx = 0;                    // Начинает первый игрок
            room.players.forEach(p => p.score = 0); // Обнуляем очки всем
            
            // Запускаем первый ход (true означает, что таймер на клиенте должен начаться заново)
            sendWhoAmITurn(io, roomId, true);
        }
    });

    // --- ДЕЙСТВИЕ: Угадал или Пас (нажатие кнопок) ---
    socket.on('whoami-action', ({ roomId, isCorrect }) => {
        const room = roomsWhoAmI[roomId];
        if (room && room.gameStarted) {
            // Если игрок угадал — добавляем ему балл
            if (isCorrect) {
                room.players[room.activeIdx].score++;
            }
            // Выдаем следующее слово (false — таймер на клиенте НЕ сбрасывается)
            sendWhoAmITurn(io, roomId, false);
        }
    });

    // --- ДЕЙСТВИЕ: Время вышло (переход хода) ---
    socket.on('whoami-timeout', (roomId) => {
        const room = roomsWhoAmI[roomId];
        if (room && room.gameStarted) {
            
            // Если сходил последний игрок в списке — круг (раунд) завершен
            if (room.activeIdx === room.players.length - 1) {
                room.currentRound++;
            }

            // Проверка: если раунды кончились — завершаем игру
            if (room.currentRound > room.maxRounds) {
                room.gameStarted = false;
                io.to(`whoami_${roomId}`).emit('whoami-game-over', { players: room.players });
            } else {
                // Передаем ход следующему игроку по кругу
                room.activeIdx = (room.activeIdx + 1) % room.players.length;
                // Запускаем ход (true — таймер на клиенте сбросится на начало)
                sendWhoAmITurn(io, roomId, true);
            }
        }
    });

    // --- ДЕЙСТВИЕ: Игрок нажал кнопку "Выйти" ---
    socket.on('whoami-leave', (roomId) => {
        handleLeave(io, socket, roomId);
    });

    // --- ДЕЙСТВИЕ: Игрок просто закрыл вкладку или пропал интернет ---
    socket.on('disconnect', () => {
        for (const roomId in roomsWhoAmI) {
            const room = roomsWhoAmI[roomId];
            if (room.players.some(p => p.id === socket.id)) {
                handleLeave(io, socket, roomId);
            }
        }
    });
};

// --- ФУНКЦИЯ: Подготовка и отправка данных о текущем ходе ---
function sendWhoAmITurn(io, roomId, isNewPlayer = false) {
    const room = roomsWhoAmI[roomId];
    const roomKey = `whoami_${roomId}`;

    // Если слова в пуле закончились — досрочный финал
    if (!room || room.gamePool.length === 0) {
        io.to(roomKey).emit('whoami-game-over', { players: room.players });
        room.gameStarted = false;
        return;
    }

    const activePlayer = room.players[room.activeIdx];
    const currentWord = room.gamePool.pop(); // Берем последнее слово из массива

    // Отправляем данные всем игрокам в комнате
    io.to(roomKey).emit('whoami-new-turn', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name,
        word: currentWord,
        timer: room.timerVal,
        isNewPlayer: isNewPlayer, // Флаг для управления таймером на клиенте
        round: room.currentRound,
        totalRounds: room.maxRounds
    });
}

// --- ФУНКЦИЯ: Логика удаления игрока из комнаты ---
function handleLeave(io, socket, roomId) {
    const room = roomsWhoAmI[roomId];
    if (room) {
        // Убираем игрока из массива по его ID сокета
        room.players = room.players.filter(p => p.id !== socket.id);
        const roomKey = `whoami_${roomId}`;
        
        // Если в комнате никого не осталось — удаляем её совсем
        if (room.players.length === 0) {
            delete roomsWhoAmI[roomId];
        } else {
            // Если кто-то остался — обновляем у них список игроков в лобби
            io.to(roomKey).emit('whoami-update-lobby', { players: room.players });
        }
    }
    socket.leave(`whoami_${roomId}`); // Убираем сокет из комнаты Socket.io
}
