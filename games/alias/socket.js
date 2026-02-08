// Глобальное хранилище комнат вне функции
const rooms = new Map();

const WORDS = ["Космос", "Велосипед", "Программист", "Кот", "Небоскреб", "Машина", "Футбол", "Пицца", "Интернет", "Робот", "Банан", "Гитара", "Зомби", "Бэтмен", "Лампочка", "Пляж", "Солнце", "Книга", "Музыка", "Телефон", "Дождь", "Кофе", "Самолет", "Океан", "Звезда", "Гриб", "Лес", "Торт", "Море", "Очки"];

module.exports = (io, socket) => {
    
    socket.on('create_room', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const roomData = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{ id: socket.id, name: playerName, score: 0, isHost: true }],
            settings: { time: 60, goal: 20 },
            gameData: { currentWord: '', timeLeft: 0, explainerId: null, judgeId: null, timer: null }
        };
        rooms.set(roomId, roomData);
        socket.join(roomId);
        socket.emit('room_created', { roomId, players: roomData.players, settings: roomData.settings });
        console.log(`[ALIAS] Room Created: ${roomId}`);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = rooms.get(id);

        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, score: 0, isHost: false });
            socket.join(id);
            socket.emit('room_created', { roomId: id, players: room.players, settings: room.settings });
            io.to(id).emit('update_lobby', room);
        } else {
            socket.emit('error_msg', 'Комната не найдена или игра началась');
        }
    });

    socket.on('update_settings', ({ roomId, settings }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.settings = settings;
            io.to(roomId).emit('update_settings', settings);
        }
    });

    socket.on('start_game', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id && room.players.length >= 2) {
            room.state = 'playing';
            startRound(roomId);
        } else {
            socket.emit('error_msg', 'Нужно минимум 2 игрока');
        }
    });

    socket.on('word_action', ({ roomId, action }) => {
        const room = rooms.get(roomId);
        if (!room || room.state !== 'playing') return;

        if (action === 'guessed') {
            const explainer = room.players.find(p => p.id === room.gameData.explainerId);
            if (explainer) {
                explainer.score++;
                if (explainer.score >= room.settings.goal) return endGame(roomId, `Победил ${explainer.name}!`);
            }
        }
        sendNewWord(room);
    });

    function startRound(roomId) {
        const room = rooms.get(roomId);
        if (!room) return;

        const p = room.players;
        // Ротация ролей: берем случайных или по очереди
        let idx1 = Math.floor(Math.random() * p.length);
        let idx2 = (idx1 + 1) % p.length;

        room.gameData.explainerId = p[idx1].id;
        room.gameData.judgeId = p[idx2].id;
        room.gameData.timeLeft = room.settings.time;

        io.to(roomId).emit('round_start', {
            explainerId: room.gameData.explainerId,
            judgeId: room.gameData.judgeId,
            players: room.players
        });

        sendNewWord(room);
        
        if (room.gameData.timer) clearInterval(room.gameData.timer);
        room.gameData.timer = setInterval(() => {
            room.gameData.timeLeft--;
            io.to(roomId).emit('timer_update', room.gameData.timeLeft);
            if (room.gameData.timeLeft <= 0) {
                clearInterval(room.gameData.timer);
                io.to(roomId).emit('round_end', { players: room.players });
                room.state = 'lobby';
                io.to(roomId).emit('update_lobby', room);
            }
        }, 1000);
    }

    function sendNewWord(room) {
        room.gameData.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
        io.to(room.id).emit('new_word', room.gameData.currentWord);
    }

    function endGame(roomId, message) {
        const room = rooms.get(roomId);
        if (room) {
            clearInterval(room.gameData.timer);
            io.to(roomId).emit('game_over', { message, players: room.players });
            room.state = 'lobby';
            room.players.forEach(p => p.score = 0);
        }
    }

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            const playerIdx = room.players.findIndex(p => p.id === socket.id);
            if (playerIdx !== -1) {
                room.players.splice(playerIdx, 1);
                
                if (room.players.length < 2 && room.state === 'playing') {
                    endGame(roomId, "Игрок покинул игру. Недостаточно участников.");
                } else if (room.players.length === 0) {
                    clearInterval(room.gameData.timer);
                    rooms.delete(roomId);
                } else {
                    if (socket.id === room.hostId) room.hostId = room.players[0].id;
                    io.to(roomId).emit('update_lobby', room);
                }
            }
        });
    });
};