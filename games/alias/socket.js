// // Объект для хранения данных комнат
const roomsAlias = {};
// // Объект для хранения интервалов таймеров
const aliasIntervals = {};
// // Список случайных названий команд
const TEAM_NAMES = ["Дерзкие Еноты", "Тайные Агенты", "Крутые Перцы", "Ночные Совы", "Ленивые Панды", "Быстрые Зайцы"];

module.exports = (io, socket) => {
    
    // // СОБЫТИЕ: Игрок заходит в комнату
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Если комнаты нет — создаем её с начальными данными
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,
                gamePool: [],
                timerVal: 60,
                currentScore: 0,
                teams: {
                    1: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], score: 0 },
                    2: { name: TEAM_NAMES[Math.floor(Math.random()*TEAM_NAMES.length)], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        // // Рандомное распределение в команды (балансировка по количеству)
        if (!room.players.find(p => p.id === socket.id)) {
            const countT1 = room.players.filter(p => p.team === 1).length;
            const countT2 = room.players.filter(p => p.team === 2).length;
            const assignedTeam = countT1 <= countT2 ? 1 : 2;

            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                isHost: room.players.length === 0,
                team: assignedTeam 
            });
        }

        // // Рассылаем всем обновленные данные лобби
        io.to(roomKey).emit('alias-update-lobby', { 
            roomId, 
            players: room.players, 
            teams: room.teams 
        });
    });

    // // СОБЫТИЕ: Хост нажимает "Старт"
    socket.on('alias-start', ({ roomId, words, timer }) => {
        const room = roomsAlias[roomId];
        if (room && !room.gameStarted) {
            room.gameStarted = true;
            room.gamePool = words;
            room.timerVal = parseInt(timer) || 60;
            room.activeIdx = 0;
            room.currentScore = 0;
            
            // // Показываем экран подготовки перед первым раундом
            sendPrepScreen(io, roomId);
        }
    });

    // // СОБЫТИЕ: Нажатие Угадано/Пропуск
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;
            
            // // Обновляем счет в реальном времени
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            
            // // Даем следующее слово
            sendWordToTeam(io, roomId);
        }
    });

    // // СОБЫТИЕ: Отключение игрока
    socket.on('disconnect', () => {
        // // (Логика удаления игрока и передачи хоста аналогична предыдущей версии)
    });
};

// // ФУНКЦИЯ: Показ экрана "Сейчас объясняет..."
function sendPrepScreen(io, roomId) {
    const room = roomsAlias[roomId];
    const activePlayer = room.players[room.activeIdx];
    const teamName = room.teams[activePlayer.team].name;

    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: teamName
    });

    // // Через 4 секунды начинаем раунд
    setTimeout(() => {
        startTimer(io, roomId);
        sendWordToTeam(io, roomId);
    }, 4000);
}

// // ФУНКЦИЯ: Отправка слова (с проверкой на команду)
function sendWordToTeam(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) return;

    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop();

    // // Каждому игроку шлем персональное сообщение: видит он слово или нет
    room.players.forEach(p => {
        const sameTeam = (p.team === activePlayer.team);
        io.to(p.id).emit('alias-new-turn', {
            activePlayerId: activePlayer.id,
            activePlayerName: activePlayer.name,
            word: sameTeam ? word : `Угадывает команда: ${room.teams[activePlayer.team].name}`,
            isMyTeam: sameTeam
        });
    });
}

// // ФУНКЦИЯ: Работа серверного таймера
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

// // ФУНКЦИЯ: Завершение раунда
function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    if (room) {
        io.to(`alias_${roomId}`).emit('alias-turn-ended', { 
            prevPlayer: room.players[room.activeIdx].name,
            scoreGot: room.currentScore
        });

        // // Переход к следующему игроку в массиве
        room.activeIdx = (room.activeIdx + 1) % room.players.length;
        room.currentScore = 0;

        // // Снова заставка подготовки через паузу
        setTimeout(() => {
            if (room.gameStarted) sendPrepScreen(io, roomId);
        }, 3000);
    }
}
