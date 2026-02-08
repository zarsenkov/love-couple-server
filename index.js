const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
const disconnectTimers = {};

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, playerName }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false,
                currentRound: 1,
                maxRounds: 3
            };
        }
        const room = rooms[roomId];
        const existing = room.players.find(p => p.name === playerName);
        if (existing) {
            existing.id = socket.id;
            existing.online = true;
            if (disconnectTimers[socket.id]) clearTimeout(disconnectTimers[socket.id]);
        } else {
            room.players.push({ id: socket.id, name: playerName, online: true, score: 0 });
        }
        io.to(roomId).emit('update-lobby', { players: room.players, gameStarted: room.gameStarted });
        io.to(roomId).emit('hide-overlay'); // Скрываем оверлеи при входе нового/старого игрока
    });

    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length > 0) {
            room.gameStarted = true;
            room.currentRound = 1;
            room.activePlayerIndex = 0;
            sendTurn(roomId);
        }
    });

    socket.on('add-point', (roomId) => {
        const room = rooms[roomId];
        if (room && room.gameStarted) {
            room.players[room.activePlayerIndex].score++;
            io.to(roomId).emit('update-lobby', { players: room.players, gameStarted: true });
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
            room.gameStarted = false;
            io.to(roomId).emit('game-over', { players: room.players });
        } else {
            sendTurn(roomId);
        }
    });

    socket.on('game-action', ({ roomId, data }) => {
        io.to(roomId).emit('game-event', data);
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(roomId => {
            const room = rooms[roomId];
            if (room) {
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.online = false;
                    io.to(roomId).emit('player-offline', { name: player.name });
                    disconnectTimers[socket.id] = setTimeout(() => {
                        removePlayer(roomId, player.name);
                    }, 10000);
                }
            }
        });
    });
});

function removePlayer(roomId, playerName) {
    if (!rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.name !== playerName);
    if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
    } else {
        io.to(roomId).emit('update-lobby', { players: rooms[roomId].players });
    }
}

function sendTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.players[room.activePlayerIndex]) return;
    const active = room.players[room.activePlayerIndex];
    io.to(roomId).emit('turn-changed', {
        activePlayerId: active.id,
        activePlayerName: active.name,
        currentRound: room.currentRound
    });
}

server.listen(80, () => console.log("Сервер запущен на порту 80"));
