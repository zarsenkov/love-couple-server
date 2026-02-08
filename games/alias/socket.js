// // Хранилище всех активных игровых комнат (состояние игры, игроки, очки)
const roomsAlias = {};
// // Хранилище интервалов таймеров для каждой комнаты, чтобы они не накладывались
const aliasIntervals = {};
// // Список названий для команд, которые будут выбраны случайно при создании комнаты
const TEAM_NAMES = ["Дерзкие Еноты", "Тайные Агенты", "Крутые Перцы", "Ночные Совы", "Ленивые Панды", "Быстрые Зайцы"];

module.exports = (io, socket) => {

    // // СОБЫТИЕ: Вход в комнату или переподключение
    // // Отвечает за создание комнаты, распределение по командам и обновление лобби
    socket.on('alias-join', ({ roomId, playerName }) => {
        const roomKey = `alias_${roomId}`;
        socket.join(roomKey);

        // // Инициализация новой комнаты, если ID задействован впервые
        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [],
                gameStarted: false,
                activeIdx: 0,      // // Индекс игрока, который сейчас объясняет
                gamePool: [],      // // Массив слов на игру
                timerVal: 60,      // // Длительность одного хода
                maxRounds: 3,      // // Общее кол-во кругов
                currentRound: 1,
                currentScore: 0,   // // Очки за текущий ход (балл за слово)
                teams: {
                    1: { name: TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)], score: 0 },
                    2: { name: TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        
        // // Проверка на существующего игрока (чтобы не дублировать при перезагрузке страницы)
        let player = room.players.find(p => p.id === socket.id || p.name === playerName);
        
        if (!player) {
            // // Авто-балансировка команд: закидываем туда, где меньше людей
            const countT1 = room.players.filter(p => p.team === 1).length;
            const countT2 = room.players.filter(p => p.team === 2).length;
            const assignedTeam = countT1 <= countT2 ? 1 : 2;

            player = { 
                id: socket.id, 
                name: playerName, 
                isHost: room.players.length === 0, // // Первый зашедший становится Хостом
                team: assignedTeam 
            };
            room.players.push(player);
        } else {
            // // Если игрок "вернулся", привязываем его новый socket.id к старому профилю
            player.id = socket.id;
        }

        // // Рассылка всем в комнате актуального состава команд
        io.to(roomKey).emit('alias-update-lobby', { 
            roomId, 
            players: room.players, 
            teams: room.teams,
            gameStarted: room.gameStarted 
        });
    });

    // // СОБЫТИЕ: Запуск игры (только от Хоста)
    // // Обнуляет статистику и запускает первый раунд
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
            
            // // Переходим к показу экрана "Приготовьтесь"
            sendPrepScreen(io, roomId);
        }
    });

    // // СОБЫТИЕ: Игровое действие (Угадано/Пропуск)
    // // Начисляем/отнимаем балл и сразу шлем новое слово
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            // // Логика очков: +1 за успех, -1 за пропуск
            const points = isCorrect ? 1 : -1;
            room.currentScore += points;

            // // Мгновенное обновление счета на экранах всех игроков
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            
            // // Берем следующее слово из перемешанного пула
            sendWordToTeam(io, roomId);
        }
    });

    // // СОБЫТИЕ: Разрыв соединения
    socket.on('disconnect', () => {
        // // Логика зарезервирована для удаления пустых комнат через таймаут
    });
};

// // ФУНКЦИЯ: Показ экрана подготовки
// // Выводит сообщение "Ходит [Имя]" для всех участников на 4 секунды
function sendPrepScreen(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room) return;
    
    const activePlayer = room.players[room.activeIdx];
    const teamName = room.teams[activePlayer.team].name;

    // // Сообщаем клиентам, кто сейчас будет объяснять
    io.to(`alias_${roomId}`).emit('alias-prep-screen', {
        playerName: activePlayer.name,
        teamName: teamName
    });

    // // Задержка перед началом самого раунда (даем время собраться с мыслями)
    setTimeout(() => {
        if (room.gameStarted) {
            startTimer(io, roomId);
            sendWordToTeam(io, roomId);
        }
    }, 4000);
}

// // ФУНКЦИЯ: Рассылка слова игрокам
// // Важно: объясняющий видит слово, остальные видят только название его команды
function sendWordToTeam(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room || room.gamePool.length === 0) return;

    const activePlayer = room.players[room.activeIdx];
    const word = room.gamePool.pop(); // // Достаем слово из конца массива

    room.players.forEach(p => {
        const sameTeam = (p.team === activePlayer.team);
        // // Отправляем каждому игроку индивидуально (через его личный сокет ID)
        io.to(p.id).emit('alias-new-turn', {
            activePlayerId: activePlayer.id,
            activePlayerName: activePlayer.name,
            // // Защита: противники не должны видеть слово, чтобы не подсказывать
            word: sameTeam ? word : `Угадывает команда: ${room.teams[activePlayer.team].name}`,
            isMyTeam: sameTeam
        });
    });
}

// // ФУНКЦИЯ: Запуск и управление таймером хода
// // Работает каждую секунду и по истечении времени завершает ход
function startTimer(io, roomId) {
    const room = roomsAlias[roomId];
    let timeLeft = room.timerVal;

    // // Очищаем старый интервал, если он вдруг завис
    if (aliasIntervals[roomId]) clearInterval(aliasIntervals[roomId]);

    aliasIntervals[roomId] = setInterval(() => {
        timeLeft--;
        // // Синхронизируем тиканье таймера у всех участников
        io.to(`alias_${roomId}`).emit('alias-timer-tick', { timeLeft });

        if (timeLeft <= 0) {
            clearInterval(aliasIntervals[roomId]);
            handleTurnEnd(io, roomId); // // Время вышло — подводим итоги хода
        }
    }, 1000);
}

// // ФУНКЦИЯ: Завершение хода и расчет кругов/раундов
// // Суммирует очки команды и переключает очередь на следующего игрока
function handleTurnEnd(io, roomId) {
    const room = roomsAlias[roomId];
    if (!room) return;

    // // Прибавляем набранные за 60 секунд очки к общему счету команды
    const activePlayer = room.players[room.activeIdx];
    room.teams[activePlayer.team].score += room.currentScore;

    // // Уведомляем всех, сколько очков принес текущий игрок
    io.to(`alias_${roomId}`).emit('alias-turn-ended', { 
        prevPlayer: activePlayer.name,
        scoreGot: room.currentScore
    });

    // // Проверка: если этот игрок был последним в списке, значит круг закончен
    if (room.activeIdx === room.players.length - 1) {
        // // Если достигли лимита раундов (кругов) — заканчиваем игру
        if (room.currentRound >= room.maxRounds) {
            const t1 = room.teams[1];
            const t2 = room.teams[2];
            let winner = "Ничья!";
            
            if (t1.score > t2.score) winner = t1.name;
            else if (t2.score > t1.score) winner = t2.name;

            // // Рассылаем финальный результат и обнуляем статус игры
            io.to(`alias_${roomId}`).emit('alias-game-over', {
                winner,
                team1Name: t1.name, team1Score: t1.score,
                team2Name: t2.name, team2Score: t2.score
            });
            room.gameStarted = false;
            return;
        }
        room.currentRound++; // // Увеличиваем счетчик кругов
    }

    // // Передаем очередь следующему игроку (циклически)
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    room.currentScore = 0; // // Сбрасываем промежуточный счет

    // // Небольшая пауза в 3 секунды, чтобы посмотреть результат хода, и снова PrepScreen
    setTimeout(() => {
        if (room.gameStarted) sendPrepScreen(io, roomId);
    }, 3000);
}
