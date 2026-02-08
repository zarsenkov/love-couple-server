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
        room.players.push({ id: socket.id, name: playerName, score: 0 });
        io.to(roomId).emit('update-lobby', { players: room.players });
    });

    socket.on('start-game', ({ roomId, maxRounds, timer }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.maxRounds = parseInt(maxRounds);
            room.timerVal = parseInt(timer);
            sendTurn(roomId);
        }
    });

    socket.on('add-point-to', ({ roomId, targetName }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.name === targetName);
            if (player) player.score++;
        }
    });

    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        room.activePlayerIndex++;
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
            room.currentRound++;
        }

        if (room.currentRound > room.maxRounds) {
            io.to(roomId).emit('game-over', { players: room.players });
        } else {
            sendTurn(roomId);
        }
    });

    socket.on('game-action', ({ roomId, data }) => {
        io.to(roomId).emit('game-event', data);
    });

    socket.on('disconnect', () => {
        // Простая логика: если вышел — просто забыли (как просил)
    });
});

function sendTurn(roomId) {
    const room = rooms[roomId];
    const active = room.players[room.activePlayerIndex];
    io.to(roomId).emit('turn-changed', {
        activePlayerId: active.id,
        activePlayerName: active.name,
        timer: room.timerVal
    });
}

server.listen(80);
