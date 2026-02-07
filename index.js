const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, playerName }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false
            };
        }
        
        // Добавляем игрока
        if (!rooms[roomId].players.find(p => p.id === socket.id)) {
            rooms[roomId].players.push({ id: socket.id, name: playerName });
        }

        io.to(roomId).emit('update-lobby', {
            players: rooms[roomId].players,
            gameStarted: rooms[roomId].gameStarted
        });
    });

    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length > 0) {
            room.gameStarted = true;
            room.activePlayerIndex = 0;
            const active = room.players[0];
            io.to(roomId).emit('game-started', { 
                activePlayerId: active.id, 
                activePlayerName: active.name 
            });
        }
    });

    socket.on('game-action', ({ roomId, data }) => {
        io.to(roomId).emit('game-event', data);
    });

    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length > 0) {
            room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
            const next = room.players[room.activePlayerIndex];
            io.to(roomId).emit('turn-changed', { 
                activePlayerId: next.id, 
                activePlayerName: next.name 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        // Здесь можно добавить логику удаления игрока из комнаты
    });
});

// ПОРТ: Amvera использует 80 по умолчанию
const PORT = process.env.PORT || 80;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
