// // Хранилище всех активных игровых комнат
const roomsAlias = {};
// // Хранилище интервалов таймеров для каждой комнаты
const aliasIntervals = {};
// // Список названий для команд (выбираются случайно)
const TEAM_NAMES = ["Дерзкие Еноты", "Тайные Агенты", "Крутые Перцы", "Ночные Совы", "Ленивые Панды", "Быстрые Зайцы"];

module.exports = (io, socket) => {

    // // СОБЫТИЕ: Вход в комнату или переподключение
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Если комнаты еще нет — создаем структуру
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 60,
                maxRounds: 3,
                currentRound: 1,
                currentScore: 0,
                teams: {
                    1: { name: TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)], score: 0 },
                    2: { name: TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        // // Проверяем, есть ли уже такой игрок (защита от вылета)
        let player = room.players.find(p => p.id === socket.id || p.name === playerName);
        
        if (!player) {
            // // Распределяем в команду, где меньше людей (балансировка)
            const countT1 = room.players.filter(p => p.team === 1).length;
            const countT2 = room.players.filter(p => p.team === 2).length;
            const assignedTeam = countT1 <= countT2 ? 1 : 2;

            player = { 
                id: socket.id, 
                name: playerName, 
                isHost: room.players.length === 0,
                team: assignedTeam 
            };
            room.players.push(player);
        } else {
            // // Если игрок переподключился — обновляем его socket ID
            player.id = socket.id;
        }

        // // Отправляем актуальное состояние комнаты всем участникам
        io.to(roomKey).emit('alias-update-lobby', { 
            roomId, 
            players: room.players, 
            teams: room.teams,
            gameStarted: room.gameStarted 
        });
    });

    // // СОБЫТИЕ: Запуск игры хостом
    socket.on('alias-start', ({ roomId, words, timer, maxRounds }) => {
        const room = roomsAlias[roomId];
        if (room && !room.gameStarted) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer) || 60;
            room.maxRounds = parseInt(maxRounds) || 3;
            room.currentRound = 1;
            room.activeIdx = 0;
            room.currentScore = 0;
            
            // // Запускаем цикл подготовки первого игрока
            sendPrepScreen(io, roomId);
        }
    });

    // // СОБЫТИЕ: Угадано слово или пропуск
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            // // Зачисляем очки за текущий ход
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;

            // // Рассылаем обновление счета в реальном времени
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            
            // // Выдаем следующее слово из пула
            sendWordToTeam(io, roomId);
        }
    });

    // // СОБЫТИЕ: Отключение (disconnect)
    socket.on('disconnect', () => {
        // // В онлайн версии мы не удаляем игрока сразу, чтобы он мог вернуться (30 сек таймаут)
        // // Здесь можно добавить логику проверки пустой комнаты
    });
};

// // ФУНКЦИЯ: Показ экрана подготовки ("Сейчас объясняет...")
function sendPrepScreen(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room) return;
    
    const activePlayer = room.players[room.activeIdx];
    const teamName = room.teams[activePlayer.team].name;

    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: teamName
    });

    // // Пауза 4 секунды, чтобы игроки приготовились, затем старт таймера
    setTimeout(() => {
        if (room.gameStarted) {
            startTimer(io, roomId);
            sendWordToTeam(io, roomId);
        }
    }, 4000);
}

// // ФУНКЦИЯ: Рассылка слова (только тем, кто в команде)
function sendWordToTeam(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) return;

    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop();

    room.players.forEach(p => {
        const sameTeam = (p.team === activePlayer.team);
        io.to(p.id).emit('alias-new-turn', {
            activePlayerId: activePlayer.id,
            activePlayerName: activePlayer.name,
            // // Противники видят название команды вместо слова
            word: sameTeam ? word : `Угадывает команда: ${room.teams[activePlayer.team].name}`,
            isMyTeam: sameTeam
        });
    });
}

// // ФУНКЦИЯ: Обратный отсчет раунда
function startTimer(io, roomId) {
    const room = roomsAlias[roomId];
    let timeLeft = room.timerVal;

    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        timeLeft--;
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft });

        if (timeLeft <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleTurnEnd(io, roomId);
        }
    }, 1000);
}

// // ФУНКЦИЯ: Завершение хода игрока и проверка конца игры
function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room) return;

    // // Добавляем очки раунда в общую копилку команды
    const activePlayer = room.players[room.activeIdx];
    room.teams[activePlayer.team].score += room.currentScore;

    // // Оповещаем всех об окончании хода
    io.to(`alias_${roomId}`).emit('alias-turn-ended', { 
        prevPlayer: activePlayer.name,
        scoreGot: room.currentScore
    });

    // // Если это был последний игрок в круге — проверяем раунды
    if (room.activeIdx === room.players.length - 1) {
        if (room.currentRound >= room.maxRounds) {
            // // ФИНАЛ ИГРЫ: определяем победителя
            const t1 = room.teams[1];
            const t2 = room.teams[2];
            let winner = "Ничья!";
            if (t1.score > t2.score) winner = t1.name;
            else if (t2.score > t1.score) winner = t2.name;

            io.to(`alias_${roomId}`).emit('alias-game-over', {
                winner,
                team1Name: t1.name, team1Score: t1.score,
                team2Name: t2.name, team2Score: t2.score
            });
            room.gameStarted = false;
            return;
        }
        room.currentRound++; // // Переходим к следующему кругу раундов
    }

    // // Переключаем на следующего игрока
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    room.currentScore = 0;

    // // Через паузу показываем экран подготовки следующего игрока
    setTimeout(() => {
        if (room.gameStarted) sendPrepScreen(io, roomId);
    }, 3000);
}
