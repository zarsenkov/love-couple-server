const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

// Те же слова и алфавит, что в оффлайн версии
const words = ["Телефон", "Свидание", "Борщ", "Отпуск", "Шоколад", "Космос", "Ремонт", "Свадьба", "Гитара", "Сюрприз", "Мечта", "Паспорт", "Наушники", "Зеркало"];
const alphabet = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШ";

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const room = {
            id: roomId,
            players: [{ id: socket.id, name: playerName, score: 0 }],
            status: 'lobby',
            currentTurn: 0,
            timer: 60,
            timerId: null
        };
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room_data', room);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        const room = rooms.get(roomId.toUpperCase());
        if (room && room.status === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, score: 0 });
            socket.join(room.id);
            io.to(room.id).emit('room_data', room);
        } else {
            socket.emit('error', 'Комната не найдена или игра уже идет');
        }
    });

    socket.on('start_game', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players[0].id === socket.id) {
            room.status = 'playing';
            startTurn(roomId);
        }
    });

    socket.on('score_update', ({ roomId, isWin }) => {
        const room = rooms.get(roomId);
        if (room && room.players[room.currentTurn].id === socket.id) {
            if (isWin) room.players[room.currentTurn].score++;
            sendCard(roomId);
        }
    });

    function startTurn(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;

        room.timer = 60;
        io.to(roomId).emit('new_turn', {
            activePlayer: room.players[room.currentTurn],
            index: room.currentTurn
        });
        
        sendCard(roomId);

        room.timerId = setInterval(() => {
            room.timer--;
            io.to(roomId).emit('timer_tick', room.timer);
            if (room.timer <= 0) {
                clearInterval(room.timerId);
                endTurn(roomId);
            }
        }, 1000);
    }

    function sendCard(roomId) {
        const room = rooms.get(roomId);
        const randomWord = words[Math.floor(Math.random() * words.length)];
        const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
        
        // Отправляем слово только текущему игроку, остальным только букву
        room.players.forEach((p, idx) => {
            if (idx === room.currentTurn) {
                io.to(p.id).emit('card_update', { word: randomWord, letter: randomLetter });
            } else {
                io.to(p.id).emit('card_update', { word: '???', letter: randomLetter });
            }
        });
    }

    function endTurn(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        
        room.currentTurn++;
        if (room.currentTurn < room.players.length) {
            startTurn(roomId);
        } else {
            room.status = 'results';
            io.to(roomId).emit('game_over', room.players);
            rooms.delete(roomId);
        }
    }

    socket.on('disconnect', () => {
        // Простая очистка комнат при выходе
        rooms.forEach((room, id) => {
            if (room.players.some(p => p.id === socket.id)) {
                clearInterval(room.timerId);
                rooms.delete(id);
                io.to(id).emit('error', 'Игрок покинул игру. Комната удалена.');
            }
        });
    });
});

server.listen(3000, () => console.log('Server running on port 3000'));
