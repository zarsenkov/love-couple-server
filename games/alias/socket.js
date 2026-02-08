// Подключаем зависимости
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаем статику (html, css, js) из папки public
app.use(express.static(path.join(__dirname, 'public')));

// --- КОНФИГУРАЦИЯ ---
const PORT = process.env.PORT || 3000;
const ALIAS_WORDS = [
    "Яблоко", "Космос", "Программист", "Сервер", "Кот", "Небоскреб", 
    "Машина", "Футбол", "Пицца", "Интернет", "Робот", "Банан", 
    "Гитара", "Школа", "Зомби", "Бэтмен", "Кроссовки", "Лампочка"
];

// --- ХРАНИЛИЩЕ ДАННЫХ ---
// rooms = { roomId: { players: [], state: 'lobby', settings: {}, gameData: {} } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Создание комнаты
    socket.on('create_room', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: playerName, team: 'A', score: 0 }],
            state: 'lobby', // lobby, playing, finished
            settings: { time: 60, goal: 20 },
            gameData: { 
                currentWord: null, 
                timeLeft: 0, 
                explainerId: null, 
                judgeId: null, 
                timerInterval: null 
            }
        };
        socket.join(roomId);
        socket.emit('room_created', roomId);
        io.to(roomId).emit('update_lobby', rooms[roomId]);
    });

    // 2. Вход в комнату
    socket.on('join_room', ({ roomId, playerName }) => {
        if (rooms[roomId] && rooms[roomId].state === 'lobby') {
            const team = rooms[roomId].players.length % 2 === 0 ? 'A' : 'B';
            rooms[roomId].players.push({ id: socket.id, name: playerName, team: team, score: 0 });
            socket.join(roomId);
            io.to(roomId).emit('update_lobby', rooms[roomId]);
        } else {
            socket.emit('error_msg', 'Комната не найдена или игра уже идет');
        }
    });

    // 3. Старт игры
    socket.on('start_game', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].state = 'playing';
            startRound(roomId);
        }
    });

    // 4. Обработка свайпов (Угадано / Пропуск)
    socket.on('word_action', ({ roomId, action }) => { // action: 'guessed' or 'skip'
        const room = rooms[roomId];
        if (!room) return;

        if (action === 'guessed') {
            // Начисляем очко команде объясняющего
            const explainer = room.players.find(p => p.id === room.gameData.explainerId);
            if (explainer) {
                explainer.score++; // Можно сделать общим счетом команды
            }
        }
        
        // Даем следующее слово
        nextWord(roomId);
    });

    socket.on('disconnect', () => {
        // Простая логика удаления: если хост вышел, можно удалять комнату (тут упрощено)
        console.log('User disconnected:', socket.id);
    });
});

// --- ЛОГИКА ИГРЫ ---

function startRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Выбираем роли
    // Упрощенно: берем случайного игрока как Объясняющего, следующего как Судью
    const pCount = room.players.length;
    const explainerIdx = Math.floor(Math.random() * pCount);
    let judgeIdx = (explainerIdx + 1) % pCount;

    room.gameData.explainerId = room.players[explainerIdx].id;
    room.gameData.judgeId = room.players[judgeIdx].id;
    room.gameData.timeLeft = room.settings.time;

    io.to(roomId).emit('round_start', {
        explainerId: room.gameData.explainerId,
        judgeId: room.gameData.judgeId,
        players: room.players
    });

    nextWord(roomId);
    startTimer(roomId);
}

function nextWord(roomId) {
    const room = rooms[roomId];
    const word = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
    room.gameData.currentWord = word;
    
    // Отправляем слово только Судье и Объясняющему (для надежности можно всем, но скрывать CSS)
    io.to(roomId).emit('new_word', word);
}

function startTimer(roomId) {
    const room = rooms[roomId];
    
    // Очистка предыдущего интервала
    if (room.gameData.timerInterval) clearInterval(room.gameData.timerInterval);

    room.gameData.timerInterval = setInterval(() => {
        room.gameData.timeLeft--;
        io.to(roomId).emit('timer_update', room.gameData.timeLeft);

        if (room.gameData.timeLeft <= 0) {
            clearInterval(room.gameData.timerInterval);
            io.to(roomId).emit('round_end'); // Клиент перейдет в лобби или экран счета
            // Тут можно добавить логику смены раунда или завершения игры
            room.state = 'lobby'; // Возвращаем в лобби для простоты
            io.to(roomId).emit('update_lobby', room);
        }
    }, 1000);
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});