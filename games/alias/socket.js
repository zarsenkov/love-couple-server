const ALIAS_WORDS = [
    "Космос", "Велосипед", "Программист", "Сервер", "Кот", "Небоскреб",
    "Машина", "Футбол", "Пицца", "Интернет", "Робот", "Банан",
    "Гитара", "Школа", "Зомби", "Бэтмен", "Кроссовки", "Лампочка",
    "Пляж", "Солнце", "Книга", "Музыка", "Телефон", "Дождь",
    "Снег", "Кофе", "Чай", "Самолет", "Поезд", "Океан"
];

// Хранилище комнат
const rooms = {};

module.exports = (io, socket) => {
    
    // --- 1. СОЗДАНИЕ ---
    socket.on('create_room', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        console.log(`[ALIAS] Create Room: ${roomId} by ${playerName}`);

        rooms[roomId] = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{
                id: socket.id,
                name: playerName,
                score: 0,
                isHost: true
            }],
            gameData: {
                currentWord: null,
                timeLeft: 0,
                explainerId: null,
                judgeId: null,
                timerInterval: null
            }
        };

        socket.join(roomId);
        socket.emit('room_created', { roomId, players: rooms[roomId].players });
        io.to(roomId).emit('update_lobby', rooms[roomId]);
    });

    // --- 2. ВХОД ---
    socket.on('join_room', ({ roomId, playerName }) => {
        if (!roomId) return;
        roomId = roomId.toUpperCase().trim();
        
        const room = rooms[roomId];

        if (room && room.state === 'lobby') {
            console.log(`[ALIAS] Join Room: ${roomId} by ${playerName}`);
            
            room.players.push({
                id: socket.id,
                name: playerName,
                score: 0,
                isHost: false
            });

            socket.join(roomId);
            
            // Важно: Сначала уведомляем игрока, что он вошел
            socket.emit('room_created', { roomId, players: room.players });
            // Потом обновляем лобби для всех
            io.to(roomId).emit('update_lobby', room);
        } else {
            socket.emit('error_msg', 'Комната не найдена!');
        }
    });

    // --- 3. СТАРТ ---
    socket.on('start_game', (roomId) => {
        if (!roomId) return;
        roomId = roomId.toUpperCase();
        const room = rooms[roomId];
        
        if (!room) return;
        if (room.hostId !== socket.id) return; // Защита: только хост

        console.log(`[ALIAS] Start Game: ${roomId}`);
        room.state = 'playing';
        
        startRound(roomId);
    });

    // --- 4. ДЕЙСТВИЯ (СВАЙПЫ) ---
    socket.on('word_action', ({ roomId, action }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return;

        if (action === 'guessed') {
            const player = room.players.find(p => p.id === room.gameData.explainerId);
            if (player) player.score++;
        }
        nextWord(roomId);
    });

    // --- ВНУТРЕННИЕ ФУНКЦИИ ---
    function startRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        // Выбор ролей
        const pCount = room.players.length;
        if (pCount < 1) return; // Страховка

        let explainerIdx = Math.floor(Math.random() * pCount);
        // Если игроков больше 1, судья другой человек. Если 1 (тест) - он же.
        let judgeIdx = pCount > 1 ? (explainerIdx + 1) % pCount : explainerIdx;

        room.gameData.explainerId = room.players[explainerIdx].id;
        room.gameData.judgeId = room.players[judgeIdx].id;
        room.gameData.timeLeft = 60;

        io.to(roomId).emit('round_start', {
            explainerId: room.gameData.explainerId,
            judgeId: room.gameData.judgeId
        });

        nextWord(roomId);
        startTimer(roomId);
    }

    function nextWord(roomId) {
        const room = rooms[roomId];
        const word = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
        room.gameData.currentWord = word;
        io.to(roomId).emit('new_word', word);
    }

    function startTimer(roomId) {
        const room = rooms[roomId];
        if (room.gameData.timerInterval) clearInterval(room.gameData.timerInterval);

        room.gameData.timerInterval = setInterval(() => {
            room.gameData.timeLeft--;
            io.to(roomId).emit('timer_update', room.gameData.timeLeft);

            if (room.gameData.timeLeft <= 0) {
                clearInterval(room.gameData.timerInterval);
                io.to(roomId).emit('round_end');
                room.state = 'lobby';
                io.to(roomId).emit('update_lobby', room);
            }
        }, 1000);
    }

    // Очистка при отключении
    socket.on('disconnect', () => {
        // Упрощенная логика: удаляем игрока из комнат (можно доработать)
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('update_lobby', room);
            }
        }
    });
};