const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path'); // Добавили модуль для работы с путями

const app = express();
app.use(cors());

// --- БЛОК ДЛЯ РАЗДАЧИ ФАЙЛОВ (ВСТАВЛЯТЬ СЮДА) ---
// Этот блок позволяет браузеру "видеть" ваш cards.js и папку online
app.use('/games', express.static(path.join(__dirname, 'games')));
// -----------------------------------------------

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

io.on('connection', (socket) => {
    // 1. Вход в комнату
    socket.on('join-room', ({ roomId, playerName }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false,
                currentRound: 1,
                maxRounds: 3,
                timerVal: 60
            };
        }
        
        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.name === playerName);
        
        if (existingPlayer) {
            existingPlayer.id = socket.id; 
        } else {
            room.players.push({ id: socket.id, name: playerName, score: 0 });
        }

        io.to(roomId).emit('update-lobby', { 
            players: room.players, 
            gameStarted: room.gameStarted 
        });
    });

    // 2. Старт игры
    socket.on('start-game', ({ roomId, maxRounds, timer }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.timerVal = parseInt(timer) || 60;
            room.currentRound = 1;
            room.activePlayerIndex = 0;
            sendTurn(roomId);
        }
    });

    // 3. Начисление баллов
    socket.on('add-point-to', ({ roomId, targetName }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.name === targetName);
            if (player) {
                player.score++;
                io.to(roomId).emit('update-lobby', { players: room.players, gameStarted: true });
            }
        }
    });

    // 4. Передача хода
    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        room.activePlayerIndex++;
        
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
            room.currentRound++;
        }

        if (room.currentRound > room.maxRounds) {
            room.gameStarted = false;
            io.to(roomId).emit('game-over', { players: room.players });
        } else {
            sendTurn(roomId);
        }
    });

    // 5. Синхронизация
    socket.on('game-action', ({ roomId, data }) => {
        io.to(roomId).emit('game-event', data);
    });

    socket.on('disconnect', () => { });
});

function sendTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.players[room.activePlayerIndex]) return;
    
    const active = room.players[room.activePlayerIndex];
    io.to(roomId).emit('turn-changed', {
        activePlayerId: active.id,
        activePlayerName: active.name,
        timer: room.timerVal,
        currentRound: room.currentRound
    });
}

// Запуск на порту 80 (Amvera)
server.listen(80, () => {
    console.log('ZINE Server started on port 80');
});
