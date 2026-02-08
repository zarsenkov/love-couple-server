// ВАЖНО: Объект rooms должен быть ВНЕ экспорта, 
// чтобы он был один для всех подключений
const rooms = {};

const ALIAS_WORDS = [
    "Космос", "Велосипед", "Программист", "Сервер", "Кот", "Небоскреб",
    "Машина", "Футбол", "Пицца", "Интернет", "Робот", "Банан",
    "Гитара", "Школа", "Зомби", "Бэтмен", "Кроссовки", "Лампочка",
    "Пляж", "Солнце", "Книга", "Музыка", "Телефон", "Дождь",
    "Снег", "Кофе", "Чай", "Самолет", "Поезд", "Океан"
];

module.exports = (io, socket) => {
    
    // --- СОЗДАНИЕ КОМНАТЫ ---
    socket.on('create_room', ({ playerName }) => {
        // Генерируем ID
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        
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
        // Отправляем подтверждение только создателю
        socket.emit('room_created', { roomId, players: rooms[roomId].players });
        // Обновляем лобби для всех в комнате
        io.to(roomId).emit('update_lobby', rooms[roomId]);
        console.log(`[ALIAS] Room Created: ${roomId} by ${playerName}`);
    });

    // --- ВХОД В КОМНАТУ ---
    socket.on('join_room', ({ roomId, playerName }) => {
        if (!roomId) return;
        const cleanId = roomId.toUpperCase().trim();
        const room = rooms[cleanId];

        if (room) {
            console.log(`[ALIAS] Player ${playerName} joining ${cleanId}`);
            
            // Проверяем, не занято ли имя (опционально)
            room.players.push({
                id: socket.id,
                name: playerName,
                score: 0,
                isHost: false
            });

            socket.join(cleanId);
            
            // Сначала подтверждаем вход игроку
            socket.emit('room_created', { roomId: cleanId, players: room.players });
            // Обновляем лобби для всей комнаты
            io.to(cleanId).emit('update_lobby', room);
        } else {
            console.log(`[ALIAS] Join failed: Room ${cleanId} not found`);
            socket.emit('error_msg', `Комната ${cleanId} не найдена`);
        }
    });

    // --- СТАРТ ИГРЫ ---
    socket.on('start_game', (roomId) => {
        const cleanId = roomId.toUpperCase().trim();
        const room = rooms[cleanId];
        
        if (room && room.hostId === socket.id) {
            room.state = 'playing';
            startRound(cleanId);
        }
    });

    // --- ЛОГИКА СЛОВ ---
    socket.on('word_action', ({ roomId, action }) => {
        const room = rooms[roomId.toUpperCase().trim()];
        if (!room || room.state !== 'playing') return;

        if (action === 'guessed') {
            const player = room.players.find(p => p.id === room.gameData.explainerId);
            if (player) player.score++;
        }
        nextWord(room.id);
    });

    // --- ФУНКЦИИ ИГРЫ ---
    function startRound(roomId) {
        const room = rooms[roomId];
        const pCount = room.players.length;
        if (pCount < 1) return;

        let expIdx = Math.floor(Math.random() * pCount);
        let jdgIdx = pCount > 1 ? (expIdx + 1) % pCount : expIdx;

        room.gameData.explainerId = room.players[expIdx].id;
        room.gameData.judgeId = room.players[jdgIdx].id;
        room.gameData.timeLeft = 60;

        io.to(roomId).emit('round_start', {
            explainerId: room.gameData.explainerId,
            judgeId: room.gameData.judgeId
        });

        nextWord(roomId);
        
        if (room.gameData.timerInterval) clearInterval(room.gameData.timerInterval);
        room.gameData.timerInterval = setInterval(() => {
            room.gameData.timeLeft--;
            io.to(roomId).emit('timer_update', room.gameData.timeLeft);

            if (room.gameData.timeLeft <= 0) {
                clearInterval(room.gameData.timerInterval);
                room.state = 'lobby';
                io.to(roomId).emit('round_end');
                io.to(roomId).emit('update_lobby', room);
            }
        }, 1000);
    }

    function nextWord(roomId) {
        const room = rooms[roomId];
        const word = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
        io.to(roomId).emit('new_word', word);
    }

    socket.on('disconnect', () => {
        for (const rId in rooms) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            if (rooms[rId].players.length === 0) {
                clearInterval(rooms[rId].gameData.timerInterval);
                delete rooms[rId];
            } else {
                io.to(rId).emit('update_lobby', rooms[rId]);
            }
        }
    });
};