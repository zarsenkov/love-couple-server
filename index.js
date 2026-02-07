const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);

// Настройка Socket.io с правильными CORS
const io = new Server(httpServer, {
  cors: {
    origin: "https://lovecouple.ru", // Явно разрешаем твой сайт
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true // Для совместимости
});

app.get('/', (req, res) => {
  res.send('Server is LIVE on port 80');
});

let rooms = {};

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  socket.on('join-room', ({ roomId, gameId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { game: gameId, players: [] };
    rooms[roomId].players.push({ id: socket.id, name });
    io.to(roomId).emit('update-players', rooms[roomId].players);
  });

  socket.on('game-action', ({ roomId, data }) => {
    socket.to(roomId).emit('game-event', data);
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

const PORT = process.env.PORT || 80;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
