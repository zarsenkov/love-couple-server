const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
const disconnectTimers = {}; // Будем хранить как { "имя_игрока": timer }

io.on('connection', (socket) => {
    
    socket.on('join-room', ({ roomId, playerName, gameType }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false,
                currentRound: 1,
                maxRounds: 5,
                gameType: gameType || 'whoami' 
            };
        }

        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.name === playerName);

        if (existingPlayer) {
            existingPlayer.id = socket.id;
            existingPlayer.online = true;
            // Очищаем таймер по ИМЕНИ игрока
            if (disconnectTimers[playerName]) {
                clearTimeout(disconnectTimers[playerName]);
                delete disconnectTimers[playerName];
            }
        } else {
            room.players.push({ id: socket.id, name: playerName, online: true, score: 0 });
        }

        io.to(roomId).emit('update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted,
            maxRounds: room.maxRounds,
            gameType: room.gameType
        });
    });

    socket.on('set-rounds', ({ roomId, rounds }) => {
        if (rooms[roomId]) {
            rooms[roomId].maxRounds = Math.min(Math.max(parseInt(rounds), 1), 10);
            io.to(roomId).emit('update-lobby', { 
                players: rooms[roomId].players, 
                maxRounds: rooms[roomId].maxRounds,
                gameType: rooms[roomId].gameType 
            });
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

    // ОБЪЕДИНЕННАЯ ЛОГИКА: Угадал слово
    socket.on('correct-answer', (roomId) => {
        const room = rooms[roomId];
        if (room && room.gameStarted) {
            room.players[room.activePlayerIndex].score++;
            
            io.to(roomId).emit('update-lobby', { 
                players: room.players, 
                gameStarted: true,
                gameType: room.gameType
            });
            
            io.to(roomId).emit('game-event', { type: 'NEXT_WORD' });
        }
    });

    socket.on('skip-answer', (roomId) => {
        const room = rooms[roomId];
        if (room && room.gameStarted) {
            io.to(roomId).emit('game-event', { type: 'NEXT_WORD' });
        }
    });

    socket.on('switch-turn', (roomId, wasGuessed = false) => {
        const room = rooms[roomId];
        if (!room) return;

        if (wasGuessed && room.gameType === 'zine') {
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
            if (!room || roomId === socket.id) continue;

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.online = false;
                io.to(roomId).emit('player-offline', { name: player.name });

                // Запускаем таймер удаления по ИМЕНИ
                disconnectTimers[player.name] = setTimeout(() => {
                    removePlayer(roomId, player.name);
                    delete disconnectTimers[player.name];
                }, 15000);
            }
        }
    });
});

function removePlayer(roomId, playerName) {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(p => p.name !== playerName);
    
    if (room.players.length === 0) {
        delete rooms[roomId];
    } else {
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
        }
        io.to(roomId).emit('update-lobby', { 
            players: room.players, 
            gameStarted: room.gameStarted,
            gameType: room.gameType
        });
        io.to(roomId).emit('hide-overlay');
        if (room.gameStarted) sendTurn(roomId);
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
            maxRounds: room.maxRounds,
            gameType: room.gameType
        });
    }
}

server.listen(80);
