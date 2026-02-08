// Основной модуль сокетов для игры Мафия
module.exports = (io) => {
    const roomsMafia = {}; // Хранилище игровых комнат

    io.on("connection", (socket) => {
        // --- ПРИСОЕДИНЕНИЕ К КОМНАТЕ ---
        // Обработка входа игрока в лобби
        socket.on("mafia-join", ({ roomId, playerName }) => {
            socket.join(roomId);
            if (!roomsMafia[roomId]) {
                roomsMafia[roomId] = {
                    players: [],
                    hostId: socket.id,
                    gameStarted: false,
                    phase: "lobby", // lobby, distribution, night, day, result
                    nightActions: {},
                    timer: 60,
                    rolesConfig: { doctor: true, commissar: true, prostitute: false, maniac: false }
                };
            }
            
            const room = roomsMafia[roomId];
            const player = { id: socket.id, name: playerName, role: null, alive: true, ready: false };
            room.players.push(player);

            io.to(roomId).emit("mafia-update-room", room);
        });

        // --- НАСТРОЙКА РОЛЕЙ ---
        // Изменение состава активных ролей хостом
        socket.on("mafia-toggle-role", ({ roomId, role, enabled }) => {
            const room = roomsMafia[roomId];
            if (room && socket.id === room.hostId) {
                room.rolesConfig[role] = enabled;
                io.to(roomId).emit("mafia-update-room", room);
            }
        });

        // --- СТАРТ РАЗДАЧИ ---
        // Распределение ролей и запуск фазы ознакомления
        socket.on("mafia-start-dist", ({ roomId }) => {
            const room = roomsMafia[roomId];
            if (!room || socket.id !== room.hostId) return;

            const roles = generateRoles(room.players.length, room.rolesConfig);
            room.players.forEach((p, i) => {
                p.role = roles[i];
                p.alive = true;
                // Отправляем роль каждому игроку индивидуально (безопасность)
                io.to(p.id).emit("mafia-your-role", p.role);
            });

            room.phase = "distribution";
            room.gameStarted = true;
            io.to(roomId).emit("mafia-update-room", room);
        });

        // --- ЛОГИКА НОЧИ ---
        // Обработка выбора спец-ролей ночью
        socket.on("mafia-night-action", ({ roomId, targetId, action }) => {
            const room = roomsMafia[roomId];
            if (!room) return;
            room.nightActions[action] = targetId;
            
            // Если все роли походили (упрощенно — проверка готовности)
            // В реальном проде тут нужен счетчик живых спец-ролей
        });

        // --- УНИВЕРСАЛЬНЫЙ ТАЙМЕР ---
        // Запуск обратного отсчета сервером
        socket.on("mafia-start-timer", ({ roomId, duration }) => {
            const room = roomsMafia[roomId];
            if (!room) return;
            clearInterval(room.timerInterval);
            room.timer = duration;
            
            room.timerInterval = setInterval(() => {
                room.timer--;
                io.to(roomId).emit("mafia-timer-tick", room.timer);
                if (room.timer <= 0) clearInterval(room.timerInterval);
            }, 1000);
        });

        // --- ОТКЛЮЧЕНИЕ ---
        socket.on("disconnect", () => {
            // Логика удаления игрока из комнаты
        });
    });

    // Функция генерации массива ролей на основе количества игроков
    function generateRoles(count, config) {
        let roles = [];
        let mafiaCount = Math.max(1, Math.floor(count / 3));
        for(let i=0; i < mafiaCount; i++) roles.push('mafia');
        if(config.doctor) roles.push('doctor');
        if(config.commissar) roles.push('commissar');
        if(config.prostitute) roles.push('prostitute');
        if(config.maniac) roles.push('maniac');
        while(roles.length < count) roles.push('citizen');
        return roles.sort(() => Math.random() - 0.5);
    }
};
