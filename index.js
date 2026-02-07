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
    // 1. ВХОД В КОМНАТУ
    socket.on('join-room', ({ roomId, playerName, gameType }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                activePlayerIndex: 0,
                gameStarted: false,
                currentRound: 1,
                maxRounds: 5,
                gameType: gameType || 'zine' // Сохраняем тип игры
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
// 2. НАСТРОЙКА РАУНДОВ
        io.to(roomId).emit('update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted,
            maxRounds: room.maxRounds,
            gameType: room.gameType // Отправляем тип игры обратно
        });
    });
// 3. СТАРТ ИГРЫ
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
// 4. ДОБАВЛЕНИЕ ОЧКА (БЕЗ СМЕНЫ ХОДА) - для "Кто я?"
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

    // НАЧИСЛЕНИЕ ОЧКА (для игры "Кто я?")
    socket.on('add-point', (roomId) => {
        const room = rooms[roomId];
        if (room && room.gameStarted) {
            // Очко получает тот, кто сейчас УГАДЫВАЕТ
            room.players[room.activePlayerIndex].score++;
            // Рассылаем обновленные очки всем
            io.to(roomId).emit('update-lobby', { 
                players: room.players, 
                gameStarted: true,
                gameType: room.gameType 
            });
        }
    });

// 5. СМЕНА ХОДА
    socket.on('switch-turn', (roomId, wasGuessed) => {
        const room = rooms[roomId];
        if (!room) return;

        // Если в другой игре (ZINE) нужно давать очко только в конце
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
// 6. ПЕРЕДАЧА СОБЫТИЙ (Слова, карточки)
    socket.on('game-action', ({ roomId, data }) => {
        // Просто транслируем игровые события (карточки, слова) всем в комнате
        io.to(roomId).emit('game-event', data);
    });
// 7. КИК ИГРОКА (Исправлено)
    socket.on('kick-player', (roomId, playerName) => {
        removePlayer(roomId, playerName);
    });
// 8. ОБРАБОТКА ВЫХОДА
socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            const room = rooms[roomId];
            if (!room) continue;

            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.online = false;
                io.to(roomId).emit('player-offline', { name: player.name });

                // Если через 15 сек не вернулся — удаляем (хватит, чтобы переподключиться)
                disconnectTimers[socket.id] = setTimeout(() => {
                    removePlayer(roomId, player.name);
                }, 15000);
            }
        }
    });
});
// ФУНКЦИЯ УДАЛЕНИЯ ИГРОКА
function removePlayer(roomId, playerName) {
    if (!rooms[roomId]) return;
    
    const room = rooms[roomId];
    // Удаляем игрока
    room.players = room.players.filter(p => p.name !== playerName);
    
    if (room.players.length === 0) {
        delete rooms[roomId]; // Полное удаление комнаты из памяти
    } else {
        // Если удалили игрока, чей был ход — сбрасываем индекс на 0
        if (room.activePlayerIndex >= room.players.length) {
            room.activePlayerIndex = 0;
        }

        io.to(roomId).emit('update-lobby', { 
            players: room.players, 
            gameStarted: room.gameStarted,
            gameType: room.gameType
        });
        io.to(roomId).emit('hide-overlay');

        // Если игра идет, переотправляем ход, чтобы обновить экраны
        if (room.gameStarted) sendTurn(roomId);
    }
}
// ФУНКЦИЯ ОТПРАВКИ ХОДА
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
