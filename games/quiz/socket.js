// Хранилище комнат
const quizRooms = new Map();

// Пример вопросов (в реальности можно брать из БД)
const QUESTIONS = [
    { q: "Какая планета самая большая в Солнечной системе?", a: ["Марс", "Венера", "Юпитер", "Сатурн"], c: 2 },
    { q: "Кто написал 'Преступление и наказание'?", a: ["Толстой", "Достоевский", "Чехов", "Пушкин"], c: 1 },
    { q: "В какой стране находится Эйфелева башня?", a: ["Италия", "Германия", "Франция", "Испания"], c: 2 }
];

module.exports = (io) => {
    io.on('connection', (socket) => {

        socket.on('quiz_create', ({ name }) => {
            const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
            const room = {
                roomId,
                hostId: socket.id,
                players: [{ id: socket.id, name, score: 0, lastAnswer: null, isCorrect: false }],
                status: 'lobby',
                currentQuestion: 0,
                timer: 15
            };
            quizRooms.set(roomId, room);
            socket.join(roomId);
            socket.emit('room_data', room);
        });

        socket.on('quiz_join', ({ name, roomId }) => {
            const room = quizRooms.get(roomId);
            if (room && room.status === 'lobby') {
                room.players.push({ id: socket.id, name, score: 0, lastAnswer: null, isCorrect: false });
                socket.join(roomId);
                io.to(roomId).emit('room_data', room);
            } else {
                socket.emit('error', 'Комната не найдена или игра уже идет');
            }
        });

        socket.on('quiz_start_request', ({ roomId }) => {
            const room = quizRooms.get(roomId);
            if (room && room.hostId === socket.id) {
                room.status = 'playing';
                io.to(roomId).emit('game_start');
                sendQuestion(io, roomId);
            }
        });

        socket.on('quiz_submit_answer', ({ roomId, answerIndex }) => {
            const room = quizRooms.get(roomId);
            if (!room) return;

            const player = room.players.find(p => p.id === socket.id);
            if (player && player.lastAnswer === null) {
                player.lastAnswer = answerIndex;
                const correctIdx = QUESTIONS[room.currentQuestion].c;
                if (answerIndex === correctIdx) {
                    player.isCorrect = true;
                    // Бонус за время (чем больше времени осталось, тем больше очков)
                    player.score += 10 + Math.floor(room.timer);
                }
            }
        });
    });
};

function sendQuestion(io, roomId) {
    const room = quizRooms.get(roomId);
    if (!room) return;

    const question = QUESTIONS[room.currentQuestion];
    io.to(roomId).emit('next_question', {
        question: question.q,
        answers: question.a,
        index: room.currentQuestion,
        total: QUESTIONS.length
    });

    room.timer = 15;
    const interval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timer_tick', room.timer);

        if (room.timer <= 0) {
            clearInterval(interval);
            endRound(io, roomId);
        }
    }, 1000);
}

function endRound(io, roomId) {
    const room = quizRooms.get(roomId);
    const correctIdx = QUESTIONS[room.currentQuestion].c;

    const results = room.players.map(p => ({
        id: p.id,
        isCorrect: p.isCorrect,
        lastAnswer: p.lastAnswer,
        totalScore: p.score
    }));

    io.to(roomId).emit('round_ended', {
        correctIndex: correctIdx,
        playerResults: results
    });

    // Сброс временных данных
    room.players.forEach(p => { p.lastAnswer = null; p.isCorrect = false; });

    setTimeout(() => {
        room.currentQuestion++;
        if (room.currentQuestion < QUESTIONS.length) {
            sendQuestion(io, roomId);
        } else {
            const finalResults = room.players.map(p => ({ name: p.name, score: p.score }));
            io.to(roomId).emit('game_over', finalResults);
            quizRooms.delete(roomId);
        }
    }, 4000); // 4 секунды на просмотр правильного ответа
}
