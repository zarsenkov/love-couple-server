// // Хранилище сессий (из репозитория)
const rooms = {};
const intervals = {};

module.exports = (io, socket) => {
    // // 1. Логика создания/входа
    socket.on('alias-join', ({ roomId, playerName }) => {
        socket.join(`alias_${roomId}`);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                score: { 1: 0, 2: 0 },
                settings: { timer: 60, rounds: 3 }
            };
        }
        const room = rooms[roomId];
        const team = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        const player = { id: socket.id, name: playerName, team, isHost: room.players.length === 0 };
        room.players.push(player);

        io.to(`alias_${roomId}`).emit('alias-update-lobby', {
            players: room.players,
            teams: { 1: { name: "Еноты" }, 2: { name: "Панды" } }
        });
    });

    // // 2. Логика старта (Хост)
    socket.on('alias-start', ({ roomId, words, timer, rounds }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words;
            room.settings.timer = timer;
            room.settings.rounds = rounds;
            room.activeIdx = 0;
            
            // // Запуск раунда (логика передачи хода из Гитхаба)
            nextTurn(io, roomId);
        }
    });

    // // 3. Логика Свайпа (Событие от угадывающего)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = rooms[roomId];
        if (room && room.gameStarted) {
            const points = isCorrect ? 1 : -1;
            const activePlayer = room.players[room.activeIdx];
            room.score[activePlayer.team] += points;
            
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.score });
            sendWord(io, roomId);
        }
    });
};

// // ФУНКЦИЯ: Показать экран подготовки
function nextTurn(io, roomId) {
    const room = rooms[roomId];
    const active = room.players[room.activeIdx];
    
    io.to(`alias_${roomId}`).emit('alias-prep-screen', { 
        playerName: active.name,
        teamName: active.team === 1 ? "Еноты" : "Панды"
    });

    setTimeout(() => {
        startTimer(io, roomId);
        sendWord(io, roomId);
    }, 4000);
}

// // ФУНКЦИЯ: Отправка слова и ролей (КТО СВАЙПАЕТ)
function sendWord(io, roomId) {
    const room = rooms[roomId];
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Находим врага для свайпа (как ты просил)
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies[Math.floor(Math.random() * enemies.length)];

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word,
            activePlayerId: active.id,
            swiperId: swiper.id // // Только этот человек увидит кнопки
        });
    });
}

// // ФУНКЦИЯ: Серверный таймер (из репозитория)
function startTimer(io, roomId) {
    const room = rooms[roomId];
    let time = room.settings.timer;
    if (intervals[roomId]) clearInterval(intervals[roomId]);

    intervals[roomId] = setInterval(() => {
        time--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft: time });
        if (time <= 0) {
            clearInterval(intervals[roomId]);
            // // Тут логика переключения хода...
        }
    }, 1000);
}
