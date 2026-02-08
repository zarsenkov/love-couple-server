const { Server } = require("socket.io");

// Хранилище комнат в памяти (пока сервер работает)
// Структура: { roomId: { players: [], state: 'lobby', gameData: {...} } }
const rooms = {};

const ALIAS_WORDS = [
    "Космос", "Велосипед", "Программист", "Сервер", "Кот", "Небоскреб",
    "Машина", "Футбол", "Пицца", "Интернет", "Робот", "Банан",
    "Гитара", "Школа", "Зомби", "Бэтмен", "Кроссовки", "Лампочка",
    "Пляж", "Солнце", "Книга", "Музыка", "Телефон", "Дождь",
    "Снег", "Кофе", "Чай", "Самолет", "Поезд", "Океан"
];

module.exports = (io, socket) => {
    
    // --- 1. СОЗДАНИЕ КОМНАТЫ ---
    socket.on('create_room', ({ playerName }) => {
        try {
            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            console.log(`[ALIAS] Создание комнаты ${roomId} игроком ${playerName}`);

            rooms[roomId] = {
                id: roomId,
                hostId: socket.id, // Запоминаем ID хоста
                state: 'lobby',
                players: [{
                    id: socket.id,
                    name: playerName,
                    score: 0,
                    isHost: true // Помечаем хоста
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
        } catch (e) {
            console.error("Ошибка create_room:", e);
        }
    });

    // --- 2. ВХОД В КОМНАТУ ---
    socket.on('join_room', ({ roomId, playerName }) => {
        roomId = roomId?.toUpperCase();
        const room = rooms[roomId];

        if (room && room.state === 'lobby') {
            console.log(`[ALIAS] Игрок ${playerName} вошел в ${roomId}`);
            
            room.players.push({
                id: socket.id,
                name: playerName,
                score: 0,
                isHost: false
            });

            socket.join(roomId);
            // Отправляем update_lobby ВСЕМ в комнате
            io.to(roomId).emit('update_lobby', room);
            // Лично игроку подтверждаем вход
            socket.emit('room_created', { roomId, players: room.players });
        } else {
            socket.emit('error_msg', 'Комната не найдена или игра уже идет');
        }
    });

    // --- 3. СТАРТ ИГРЫ (ИСПРАВЛЕНО) ---
    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        // Проверка: только хост может начать
        if (room.hostId !== socket.id) {
            return; 
        }

        console.log(`[ALIAS] Старт игры в комнате ${roomId}`);
        room.state = 'playing';
        
        startRound(roomId);
    });

    // --- 4. ДЕЙСТВИЯ В ИГРЕ (СВАЙПЫ) ---
    socket.on('word_action', ({ roomId, action }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return;

        if (action === 'guessed') {
            // Начисляем очки объясняющему
            const player = room.players.find(p => p.id === room.gameData.explainerId);
            if (player) player.score += 1;
        }

        // Следующее слово
        nextWord(roomId);
    });

    // --- ВНУТРЕННИЕ ФУНКЦИИ ---

    function startRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        // Выбор ролей (случайно)
        const playersCount = room.players.length;
        if (playersCount < 2) {
             // Для теста можно и с 1, но по логике нужно 2
             // io.to(roomId).emit('error_msg', 'Нужно минимум 2 игрока!');
             // return;
        }

        // Просто берем двух случайных
        let explainerIndex = Math.floor(Math.random() * playersCount);
        let judgeIndex = (explainerIndex + 1) % playersCount;

        room.gameData.explainerId = room.players[explainerIndex].id;
        room.gameData.judgeId = room.players[judgeIndex].id;
        room.gameData.timeLeft = 60; // Время раунда

        // Уведомляем клиентов о начале раунда и ролях
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
                
                // Возврат в лобби через 3 секунды или сразу
                room.state = 'lobby';
                io.to(roomId).emit('update_lobby', room);
            }
        }, 1000);
    }
};