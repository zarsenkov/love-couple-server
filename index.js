const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
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
            existingPlayer.id = socket.id; // Обновляем ID при перезаходе
        } else {
            room.players.push({ id: socket.id, name: playerName, score: 0 });
        }

        io.to(roomId).emit('update-lobby', { 
            players: room.players, 
            gameStarted: room.gameStarted 
        });
    });

    // 2. Старт игры хостом
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

    // 3. Начисление баллов конкретному игроку (выбор ведущего)
    socket.on('add-point-to', ({ roomId, targetName }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.name === targetName);
            if (player) {
                player.score++;
                // Обновляем лобби, чтобы все видели новый счет
                io.to(roomId).emit('update-lobby', { players: room.players, gameStarted: true });
            }
        }
    });

    // 4. Передача хода следующему игроку
    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        room.activePlayerIndex++;
        
        // Если круг прошли все игроки
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
            room.currentRound++;
        }

        // Проверка на завершение всех раундов
        if (room.currentRound > room.maxRounds) {
            room.gameStarted = false;
            io.to(roomId).emit('game-over', { players: room.players });
        } else {
            sendTurn(roomId);
        }
    });

    // 5. Синхронизация слова и букв (от ведущего к остальным)
    socket.on('game-action', ({ roomId, data }) => {
        io.to(roomId).emit('game-event', data);
    });

    // Обработка отключения
    socket.on('disconnect', () => {
        // Здесь можно добавить логику удаления игрока, 
        // но по ТЗ лучше оставить как есть, чтобы игра не ломалась при моргании интернета
    });
});

// Функция отправки данных о текущем ходе
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

// Порт 80 для Amvera
server.listen(80, () => {
    console.log('ZINE Server started on port 80');
});
