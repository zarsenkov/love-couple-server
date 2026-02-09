// Хранилище комнат (вне функции, чтобы данные сохранялись между подключениями)
const rooms = new Map();

const words = [
    "Телефон", "Свидание", "Борщ", "Отпуск", "Шоколад", "Космос", "Ремонт", "Свадьба",
    "Гитара", "Сюрприз", "Мечта", "Паспорт", "Наушники", "Зеркало", "Акула", "Арбуз",
    "Банан", "Билет", "Ваза", "Вокзал", "Глобус", "Дорога", "Звезда", "Йогурт"
];
const alphabet = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШ";

module.exports = (io, socket) => {

    // Создание комнаты
    socket.on('slovo-create', (playerName) => {
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
        socket.emit('slovo-room-data', room);
        console.log(`[SLOVO] Room ${roomId} created by ${playerName}`);
    });

    // Вход в комнату
    socket.on('slovo-join', ({ roomId, playerName }) => {
        const cleanId = roomId.toUpperCase().trim();
        const room = rooms.get(cleanId);
        
        if (room && room.status === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, score: 0 });
            socket.join(cleanId);
            io.to(cleanId).emit('slovo-room-data', room);
        } else {
            socket.emit('slovo-error', 'Комната не найдена или игра уже идет');
        }
    });

    // Старт игры (только хост)
    socket.on('slovo-start', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players[0].id === socket.id) {
            room.status = 'playing';
            startTurn(roomId);
        }
    });

    // Обновление счета
    socket.on('slovo-score-update', ({ roomId, isWin }) => {
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
        io.to(roomId).emit('slovo-new-turn', {
            activePlayer: room.players[room.currentTurn],
            index: room.currentTurn
        });
        
        sendCard(roomId);

        if (room.timerId) clearInterval(room.timerId);
        room.timerId = setInterval(() => {
            room.timer--;
            io.to(roomId).emit('slovo-timer-tick', room.timer);
            if (room.timer <= 0) {
                clearInterval(room.timerId);
                endTurn(roomId);
            }
        }, 1000);
    }

    function sendCard(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;
        const randomWord = words[Math.floor(Math.random() * words.length)];
        const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
        
        room.players.forEach((p, idx) => {
            if (idx === room.currentTurn) {
                io.to(p.id).emit('slovo-card-update', { word: randomWord, letter: randomLetter });
            } else {
                io.to(p.id).emit('slovo-card-update', { word: '???', letter: randomLetter });
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
            io.to(roomId).emit('slovo-game-over', room.players);
            rooms.delete(roomId);
        }
    }
};
