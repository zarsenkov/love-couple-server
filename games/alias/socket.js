// // Объект для хранения данных комнат (игроки, счет, слова)
const aliasRooms = {};
// // Объект для контроля таймеров
const aliasIntervals = {};

module.exports = (io, socket) => {
    // // Функция: Вход в игру или создание комнаты
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Если комнаты еще нет, создаем её структуру
        if (!aliasRooms[roomId]) {
            aliasRooms[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                currentScore: 0,
                teams: {
                    1: { name: "Еноты", score: 0 },
                    2: { name: "Панды", score: 0 }
                }
            };
        }

        const room = aliasRooms[roomId];
        // // Автоматически распределяем игрока в команду, где меньше людей
        const teamId = room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length ? 1 : 2;
        
        // // Добавляем игрока в список
        room.players.push({
            id: socket.id,
            name: playerName,
            team: teamId,
            isHost: room.players.length === 0 // // Первый вошедший становится хостом
        });

        // // Рассылаем всем в комнате обновленный список игроков
        io.to(roomKey).emit('alias-update-lobby', {
            roomId: roomId,
            players: room.players,
            teams: room.teams
        });
    });

    // // Функция: Старт игры (вызывается хостом)
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = aliasRooms[roomId];
        if (room) {
            room.gameStarted = true;
            room.gamePool = words; // // Слова передаются с фронтенда (из cards.js)
            room.timerVal = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.currentRound = 1;
            room.activeIdx = 0;
            
            startAliasRound(io, roomId);
        }
    });

    // // Функция: Угадано/Пропуск (действие от игрока)
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = aliasRooms[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1; // // +1 за угаданное, -1 за пропуск
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendAliasWord(io, roomId);
        }
    });
};

// // Логика запуска нового хода
function startAliasRound(io, roomId) {
    const room = aliasRooms[roomId];
    const activePlayer = room.players[room.activeIdx];
    
    // // Уведомляем всех, кто сейчас объясняет
    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: room.teams[activePlayer.team].name
    });

    // // Пауза 4 секунды перед началом, чтобы игрок приготовился
    setTimeout(() => {
        if (room.gameStarted) {
            runAliasTimer(io, roomId);
            sendAliasWord(io, roomId);
        }
    }, 4000);
}

// // Отправка нового слова
function sendAliasWord(io, roomId) {
    const room = aliasRooms[roomId];
    if (!room || room.gamePool.length === 0) return;

    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Назначаем "Свайпера" (того, кто отмечает очки). Это может быть сам игрок или враг.
    // // По твоему запросу: свайпает случайный игрок из ДРУГОЙ команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : active;

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word: word,
            activePlayerId: active.id,
            swiperId: swiper.id
        });
    });
}

// // Работа таймера на сервере (самый надежный способ)
function runAliasTimer(io, roomId) {
    const room = aliasRooms[roomId];
    let time = room.timerVal;
    
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        time--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft: time });

        if (time <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleAliasTurnEnd(io, roomId);
        }
    }, 1000);
}

// // Завершение хода
function handleAliasTurnEnd(io, roomId) {
    const room = aliasRooms[roomId];
    const active = room.players[room.activeIdx];
    
    // // Прибавляем очки команде
    room.teams[active.team].score += room.currentScore;
    room.currentScore = 0;

    // // Переходим к следующему игроку
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    
    // // Если круг закончился, проверяем лимит раундов
    if (room.activeIdx === 0) room.currentRound++;

    if (room.currentRound > room.maxRounds) {
        // // Финал игры
        io.to(`alias_${roomId}`).emit('alias-game-over', {
            winner: room.teams[1].score > room.teams[2].score ? room.teams[1].name : room.teams[2].name,
            team1Score: room.teams[1].score,
            team2Score: room.teams[2].score
        });
        room.gameStarted = false;
    } else {
        startAliasRound(io, roomId);
    }
}
