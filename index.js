const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { activePlayer: socket.id, currentWord: null, currentLetter: null };
        }
        socket.emit('init-state', {
            isMyTurn: rooms[roomId].activePlayer === socket.id,
            currentWord: rooms[roomId].currentWord,
            currentLetter: rooms[roomId].currentLetter
        });
    });

    socket.on('game-action', ({ roomId, data }) => {
        if (data.type === 'SYNC_CARD') {
            rooms[roomId].currentWord = data.word;
            rooms[roomId].currentLetter = data.letter;
        }
        io.to(roomId).emit('game-event', data);
    });

    socket.on('switch-turn', (roomId) => {
        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
        if (clients.length > 1) {
            const room = rooms[roomId];
            const currentIndex = clients.indexOf(room.activePlayer);
            const nextIndex = (currentIndex + 1) % clients.length;
            room.activePlayer = clients[nextIndex];
            io.to(roomId).emit('turn-changed', { activePlayer: room.activePlayer });
        }
    });
});

httpServer.listen(80, '0.0.0.0');
