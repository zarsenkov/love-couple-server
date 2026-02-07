const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" } // Разрешаем подключаться с твоего LoveCouple.ru
});

let rooms = {};

io.on('connection', (socket) => {
    // Вход в комнату
    socket.on('join-room', ({ roomId, gameId, name }) => {
        socket.join(roomId);
        if (!rooms[roomId]) rooms[roomId] = { game: gameId, players: [] };
        
        rooms[roomId].players.push({ id: socket.id, name });
        io.to(roomId).emit('update-players', rooms[roomId].players);
    });

    // Передача действий (нажатие кнопок, смена слов)
    socket.on('game-action', ({ roomId, data }) => {
        socket.to(roomId).emit('game-event', data);
    });

    socket.on('disconnect', () => {
        // Логика выхода (по желанию)
    });
});

const PORT = process.env.PORT || 80; // Amvera использует 80
http.listen(PORT, '0.0.0.0', () => console.log('Server is running on port ' + PORT));
