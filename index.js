const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
const disconnectTimeouts = {}; // Для хранения таймеров на 60 сек

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, playerName }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false,
                currentRound: 1,
                maxRounds: 5 // По умолчанию
            };
        }

        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.name === playerName);

        if (existingPlayer) {
            // Игрок вернулся (перезагрузка или реконнект)
            existingPlayer.id = socket.id;
            existingPlayer.online = true;
            clearTimeout(disconnectTimeouts[playerName + roomId]);
            console.log(`Player ${playerName} reconnected to ${roomId}`);
        } else {
            // Новый игрок
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
            rooms[roomId].maxRounds = parseInt(rounds);
            io.to(roomId).emit('update-lobby', { players: rooms[roomId].players, maxRounds: rooms[roomId].maxRounds });
        }
    });

    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.currentRound = 1;
            sendTurn(roomId);
        }
    });

    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        room.activePlayerIndex++;
        
        // Если круг прошли
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
            room.currentRound++;
        }

        // Проверка на конец игры
        if (room.currentRound > room.maxRounds) {
            io.to(roomId).emit('game-over', { players: room.players });
            room.gameStarted = false;
        } else {
            sendTurn(roomId);
        }
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            const room = rooms[roomId];
            if (!room) continue;

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.online = false;
                io.to(roomId).emit('player-offline', { name: player.name });

                // Таймер на 60 секунд
                const timeoutId = setTimeout(() => {
                    if (rooms[roomId]) {
                        rooms[roomId].players = rooms[roomId].players.filter(p => p.name !== player.name);
                        
                        if (rooms[roomId].players.length === 0) {
                            delete rooms[roomId];
                            console.log(`Room ${roomId} deleted.`);
                        } else {
                            io.to(roomId).emit('update-lobby', { players: rooms[roomId].players });
                            // Если вылетел тот, кто ходил — переключаем
                            if (room.gameStarted) socket.emit('switch-turn', roomId);
                        }
                    }
                }, 60000);

                disconnectTimeouts[player.name + roomId] = timeoutId;
            }
        }
    });
});

function sendTurn(roomId) {
    const room = rooms[roomId];
    const active = room.players[room.activePlayerIndex];
    io.to(roomId).emit('turn-changed', {
        activePlayerId: active.id,
        activePlayerName: active.name,
        currentRound: room.currentRound,
        maxRounds: room.maxRounds
    });
}

server.listen(80);
