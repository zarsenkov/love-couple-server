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
                maxRounds: 5
            };
        }

        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.name === playerName);

        if (existingPlayer) {
            existingPlayer.id = socket.id;
            existingPlayer.online = true;
            if (disconnectTimers[socket.id]) {
                clearTimeout(disconnectTimers[socket.id]);
                delete disconnectTimers[socket.id];
            }
        } else {
            room.players.push({ id: socket.id, name: playerName, online: true, score: 0 });
        }

        io.to(roomId).emit('update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted,
            maxRounds: room.maxRounds
        });
    });

    socket.on('set-rounds', ({ roomId, rounds }) => {
        if (rooms[roomId]) {
            rooms[roomId].maxRounds = Math.min(Math.max(parseInt(rounds), 1), 10);
            io.to(roomId).emit('update-lobby', { players: rooms[roomId].players, maxRounds: rooms[roomId].maxRounds });
        }
    });

    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length > 0) {
            room.gameStarted = true;
            room.currentRound = 1;
            room.activePlayerIndex = 0;
            room.players.forEach(p => p.score = 0);
            sendTurn(roomId);
        }
    });

    socket.on('switch-turn', (roomId, wasGuessed) => {
        const room = rooms[roomId];
        if (!room) return;

        if (wasGuessed) {
            room.players[room.activePlayerIndex].score++;
        }

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

    socket.on('kick-player', (roomId, playerName) => {
        removePlayer(roomId, playerName);
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            const room = rooms[roomId];
            if (!room) continue;

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.online = false;
                io.to(roomId).emit('player-offline', { name: player.name });

                disconnectTimers[socket.id] = setTimeout(() => {
                    removePlayer(roomId, player.name);
                }, 60000);
            }
        }
    });
});

function removePlayer(roomId, playerName) {
    if (!rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.name !== playerName);
    
    if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
    } else {
        io.to(roomId).emit('update-lobby', { 
            players: rooms[roomId].players, 
            gameStarted: rooms[roomId].gameStarted 
        });
        // Если вылетел текущий ходящий
        io.to(roomId).emit('hide-overlay');
    }
}

function sendTurn(roomId) {
    const room = rooms[roomId];
    const active = room.players[room.activePlayerIndex];
    if (active) {
        io.to(roomId).emit('turn-changed', {
            activePlayerId: active.id,
            activePlayerName: active.name,
            currentRound: room.currentRound,
            maxRounds: room.maxRounds
        });
    }
}

server.listen(80);
