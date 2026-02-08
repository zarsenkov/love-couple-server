const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');

// 1. Импортируем модули логики
const slovoSocket = require('./games/slovo/socket');
const whoamiSocket = require('./games/whoami/socket');
const aliasSocket = require('./games/alias/socket');
const spySocket = require('./games/spy/socket');

const app = express();

// Разрешаем CORS для экспресса (на случай будущих API запросов)
app.use(cors());

const server = http.createServer(app);

// 2. Настройка Socket.io с CORS
// Это самое важное, чтобы фронтенд из другого репозитория мог подключиться
const io = new Server(server, { 
    cors: { 
        origin: "*", // Позволяет подключаться с любого домена (твоих репозиториев lovedeck)
        methods: ["GET", "POST"]
    } 
});

// Убираем статику app.use('/games', ...), так как фронтенд теперь живет в другом месте

io.on('connection', (socket) => {
    console.log('Новое подключение к серверу сокетов:', socket.id);

    // 3. Подключаем логику игр
    slovoSocket(io, socket);
    whoamiSocket(io, socket);
    aliasSocket(io, socket);
    spySocket(io, socket);

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
    });
});

// Запуск на порту 80 для Amvera
server.listen(80, () => {
    console.log('API & Socket Server started on port 80');
});
