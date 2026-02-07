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
                maxRounds: 5
            };
        }

        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.name === playerName);

        if (existingPlayer) {
            existingPlayer.id = socket.id;
            existingPlayer.online = true;
        } else {
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                online: true, 
                score: 0 // Инициализируем очки
            });
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
            io.to(roomId).emit('update-lobby', { 
                players: rooms[roomId].players, 
                maxRounds: rooms[roomId].maxRounds,
                gameStarted: rooms[roomId].gameStarted 
            });
        }
    });

    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.currentRound = 1;
            room.activePlayerIndex = 0;
            room.players.forEach(p => p.score = 0); // Сброс очков при новом старте
            sendTurn(roomId);
        }
    });

    socket.on('switch-turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        // Если это был успешный ход (вызван через handleWin), 
        // начисляем очко ТЕКУЩЕМУ активному игроку
        const currentPlayer = room.players[room.activePlayerIndex];
        if (currentPlayer) {
            currentPlayer.score += 1;
        }

        room.activePlayerIndex++;
        
        // Если все игроки сходили, завершаем круг
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
            room.currentRound++;
        }

        // Проверка: игра продолжается или финал?
        if (room.currentRound > room.maxRounds) {
            room.gameStarted = false;
            io.to(roomId).emit('game-over', { players: room.players });
        } else {
            sendTurn(roomId);
        }
        
        // Обновляем лобби, чтобы все видели новые счета
        io.to(roomId).emit('update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted,
            maxRounds: room.maxRounds
        });
    });

    socket.on('game-action', ({ roomId, data }) => {
        // Пересылаем карту (слово и букву) всем в комнате
        io.to(roomId).emit('game-event', data);
    });

    socket.on('disconnect', () => {
        // Логика пометки игрока как оффлайн (как в прошлых итерациях)
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.online = false;
                io.to(roomId).emit('player-offline', { name: player.name });
                io.to(roomId).emit('update-lobby', {
                    players: room.players,
                    gameStarted: room.gameStarted,
                    maxRounds: room.maxRounds
                });
            }
        }
    });
});

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

server.listen(80, () => {
    console.log('Server is running on port 80');
});
