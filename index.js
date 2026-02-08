const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');

// Импортируем игровые модули
const slovoSocket = require('./games/slovo/socket');
// const whoamiSocket = require('./games/whoami/socket'); // Подключим позже

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Статика: открываем доступ ко всей папке games
app.use('/games', express.static(path.join(__dirname, 'games')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Подключаем логику игры "Слово"
    slovoSocket(io, socket);

    // Когда создадим socket.js для "Кто я", просто добавим:
    // whoamiSocket(io, socket);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(80, () => {
    console.log('Main Server started on port 80');
});
