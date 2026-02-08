const roomsAlias = {};
const aliasIntervals = {};
const TEAM_NAMES = ["Дерзкие Еноты", "Крутые Перцы", "Ночные Совы", "Ленивые Панды"];

module.exports = (io, socket) => {
    // // Вход
    socket.on('alias-join', ({ roomId, playerName }) => {
        const rKey = `alias_${roomId}`;
        socket.join(rKey);

        if (!roomsAlias[roomId]) {
            roomsAlias[roomId] = {
                players: [], gameStarted: false, activeIdx: 0, currentRound: 1, currentScore: 0,
                teams: {
                    1: { name: TEAM_NAMES[0], score: 0 },
                    2: { name: TEAM_NAMES[1], score: 0 }
                }
            };
        }

        const room = roomsAlias[roomId];
        const team = (room.players.filter(p => p.team === 1).length <= room.players.filter(p => p.team === 2).length) ? 1 : 2;
        room.players.push({ id: socket.id, name: playerName, team, isHost: room.players.length === 0 });

        io.to(rKey).emit('alias-update-lobby', { roomId, players: room.players, teams: room.teams });
    });

    // // Старт (Хост)
    socket.on('alias-start', (data) => {
        const room = roomsAlias[data.roomId];
        if (room) {
            Object.assign(room, { 
                gameStarted: true, gamePool: data.words, timerVal: parseInt(data.timer), 
                maxRounds: parseInt(data.maxRounds), activeIdx: 0, currentScore: 0 
            });
            sendPrep(io, data.roomId);
        }
    });

    // // Действие
    socket.on('alias-action', ({ roomId, isCorrect }) => {
        const room = roomsAlias[roomId];
        if (room && room.gameStarted) {
            room.currentScore += isCorrect ? 1 : -1;
            io.to(`alias_${roomId}`).emit('alias-update-score', { score: room.currentScore });
            sendWord(io, roomId);
        }
    });
};

// // Подготовка (4 сек)
function sendPrep(io, rId) {
    const room = roomsAlias[rId];
    const active = room.players[room.activeIdx];
    io.to(`alias_${rId}`).emit('alias-prep-screen', { playerName: active.name, teamName: room.teams[active.team].name });
    
    setTimeout(() => {
        if (room.gameStarted) {
            startTimer(io, rId); // // ЗАПУСК ТАЙМЕРА ТУТ
            sendWord(io, rId);
        }
    }, 4000);
}

// // Слово и роли
function sendWord(io, rId) {
    const room = roomsAlias[rId];
    if (!room || room.gamePool.length === 0) return;
    
    const word = room.gamePool.pop();
    const active = room.players[room.activeIdx];
    
    // // Ищем Свайпера: случайный из ДРУГОЙ команды
    const enemies = room.players.filter(p => p.team !== active.team);
    const swiper = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : active;

    room.players.forEach(p => {
        io.to(p.id).emit('alias-new-turn', {
            word, activePlayerId: active.id, isSwiper: p.id === swiper.id
        });
    });
}

// // Таймер
function startTimer(io, rId) {
    const room = roomsAlias[rId];
    let time = room.timerVal;
    if (aliasIntervals[rId]) clearInterval(aliasIntervals[rId]);

    aliasIntervals[rId] = setInterval(() => {
        time--;
        io.to(`alias_${rId}`).emit('alias-timer-tick', { timeLeft: time });
        if (time <= 0) {
            clearInterval(aliasIntervals[rId]);
            endTurn(io, rId);
        }
    }, 1000);
}

// // Конец хода
function endTurn(io, rId) {
    const room = roomsAlias[rId];
    const active = room.players[room.activeIdx];
    room.teams[active.team].score += room.currentScore;
    
    if (room.activeIdx === room.players.length - 1) {
        if (room.currentRound >= room.maxRounds) {
            const t1 = room.teams[1], t2 = room.teams[2];
            let win = t1.score > t2.score ? t1.name : (t2.score > t1.score ? t2.name : "Ничья");
            return io.to(`alias_${rId}`).emit('alias-game-over', { winner: win, team1Name: t1.name, team1Score: t1.score, team2Name: t2.name, team2Score: t2.score });
        }
        room.currentRound++;
    }
    room.activeIdx = (room.activeIdx + 1) % room.players.length;
    room.currentScore = 0;
    setTimeout(() => sendPrep(io, rId), 2000);
}
