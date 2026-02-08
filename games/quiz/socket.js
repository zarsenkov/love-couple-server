// love-couple-server/games/quiz/socket.js

const roomsQuiz = {};

module.exports = (io) => {
    io.on('connection', (socket) => {

        // 1. Создание комнаты
        socket.on('quiz-create', ({ name }) => {
            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            roomsQuiz[roomId] = {
                id: roomId,
                host: socket.id,
                players: [{ id: socket.id, name, score: 0, isHost: true }],
                categories: [],
                phase: 'lobby',
                currentPlayerIdx: 0,
                questionCount: 0,
                timer: null,
                currentQuestions: []
            };
            socket.join(roomId);
            socket.emit('quiz-room-joined', { roomId, isHost: true });
            io.to(roomId).emit('quiz-update-players', roomsQuiz[roomId].players);
        });

        // 2. Вход в комнату
        socket.on('quiz-join', ({ name, roomId }) => {
            const room = roomsQuiz[roomId];
            if(!room) return socket.emit('error', 'Комната не найдена');
            
            room.players.push({ id: socket.id, name, score: 0, isHost: false });
            socket.join(roomId);
            socket.emit('quiz-room-joined', { roomId, isHost: false });
            io.to(roomId).emit('quiz-update-players', room.players);
        });

        // 3. Запрос старта (от хоста)
        socket.on('quiz-start-request', ({ roomId, categories }) => {
            const room = roomsQuiz[roomId];
            if(!room || socket.id !== room.host) return;

            room.categories = categories;
            room.phase = 'prep';
            room.currentPlayerIdx = 0;
            
            startPrepPhase(roomId);
        });

        // 4. Логика фазы подготовки
        function startPrepPhase(roomId) {
            const room = roomsQuiz[roomId];
            const activePlayer = room.players[room.currentPlayerIdx];
            
            io.to(roomId).emit('quiz-prep-phase', {
                activePlayerId: activePlayer.id,
                activePlayerName: activePlayer.name
            });
        }

        // 5. Игрок нажал "Я готов"
        socket.on('quiz-player-ready', ({ roomId }) => {
            const room = roomsQuiz[roomId];
            if(!room) return;

            // Генерируем пачку вопросов для этого игрока (5 штук)
            // Здесь предполагается, что QUIZ_QUESTIONS доступен на сервере или передан
            room.questionCount = 0;
            sendNextQuestion(roomId);
        });

        // 6. Отправка вопроса и запуск таймера
        function sendNextQuestion(roomId) {
            const room = roomsQuiz[roomId];
            if(room.questionCount >= 5) {
                room.currentPlayerIdx++;
                if(room.currentPlayerIdx >= room.players.length) {
                    return io.to(roomId).emit('quiz-results', room.players);
                }
                return startPrepPhase(roomId);
            }

            // Выбор случайного вопроса (упрощенно)
            const q = { question: "Пример вопроса?", answers: ["A","B","C","D"], correct: 1 }; 
            room.currentQuestion = q;
            room.timeLeft = 30;

            io.to(roomId).emit('quiz-question', {
                question: q,
                score: room.players[room.currentPlayerIdx].score,
                activePlayerName: room.players[room.currentPlayerIdx].name
            });

            // Таймер
            if(room.timer) clearInterval(room.timer);
            room.timer = setInterval(() => {
                room.timeLeft--;
                io.to(roomId).emit('quiz-timer-tick', room.timeLeft);
                if(room.timeLeft <= 0) {
                    processAnswer(roomId, -1);
                }
            }, 1000);
        }

        // 7. Обработка ответа
        socket.on('quiz-answer', ({ roomId, answerIdx }) => {
            processAnswer(roomId, answerIdx);
        });

        function processAnswer(roomId, answerIdx) {
            const room = roomsQuiz[roomId];
            if(!room || !room.timer) return;

            clearInterval(room.timer);
            room.timer = null;

            const isCorrect = answerIdx === room.currentQuestion.correct;
            if(isCorrect) {
                room.players[room.currentPlayerIdx].score += (10 + Math.floor(room.timeLeft / 2));
            }

            io.to(roomId).emit('quiz-answer-result', {
                sentIdx: answerIdx,
                correctIdx: room.currentQuestion.correct,
                isCorrect
            });

            setTimeout(() => {
                room.questionCount++;
                sendNextQuestion(roomId);
            }, 2000);
        }

        // Удаление комнаты при выходе
        socket.on('disconnect', () => {
            // Логика очистки комнат
        });
    });
};
