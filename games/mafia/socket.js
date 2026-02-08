const mafiaRooms = new Map();

module.exports = (io, socket) => {
    
    // --- СОЗДАНИЕ И ВХОД ---
    socket.on('mafia_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby', // lobby, reveal, night, day_results, day_voting, game_over
            players: [{ id: socket.id, name: playerName, role: null, isAlive: true, isHost: true }],
            nightActions: { kill: null, heal: null, check: null },
            timer: null,
            logs: []
        };
        mafiaRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('mafia_created', { roomId, players: room.players });
    });

    socket.on('mafia_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = mafiaRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, role: null, isAlive: true, isHost: false });
            socket.join(id);
            io.to(id).emit('mafia_update_lobby', room);
            socket.emit('mafia_created', { roomId: id, players: room.players });
        } else {
            socket.emit('mafia_error', 'Комната не найдена');
        }
    });

    // --- СТАРТ И РАСПРЕДЕЛЕНИЕ РОЛЕЙ ---
    socket.on('mafia_start', (roomId) => {
        const room = mafiaRooms.get(roomId);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 4) return socket.emit('mafia_error', 'Нужно минимум 4 игрока');

        // Распределение ролей
        const p = room.players;
        let roles = [];
        if (p.length >= 7) roles = ['mafia', 'mafia', 'doctor', 'sheriff'];
        else if (p.length >= 5) roles = ['mafia', 'doctor', 'sheriff'];
        else roles = ['mafia', 'doctor']; // Для 4 игроков

        while (roles.length < p.length) roles.push('citizen');
        roles.sort(() => Math.random() - 0.5);

        p.forEach((player, i) => player.role = roles[i]);

        room.state = 'reveal';
        io.to(roomId).emit('mafia_role_reveal', room);

        // Через 10 секунд автоматически начинаем первую ночь
        setTimeout(() => startNight(roomId), 10000);
    });

    // --- НОЧНАЯ ФАЗА ---
    function startNight(roomId) {
        const room = mafiaRooms.get(roomId);
        if (!room) return;
        
        room.state = 'night';
        room.nightActions = { kill: null, heal: null, check: null };
        io.to(roomId).emit('mafia_night_start', { players: room.players.filter(p => p.isAlive) });
    }

    socket.on('mafia_night_action', ({ roomId, targetId, action }) => {
        const room = mafiaRooms.get(roomId);
        if (!room || room.state !== 'night') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isAlive) return;

        if (player.role === 'mafia' && action === 'kill') room.nightActions.kill = targetId;
        if (player.role === 'doctor' && action === 'heal') room.nightActions.heal = targetId;
        if (player.role === 'sheriff' && action === 'check') {
            const target = room.players.find(p => p.id === targetId);
            socket.emit('mafia_sheriff_result', { name: target.name, isMafia: target.role === 'mafia' });
            room.nightActions.check = targetId;
        }

        // Проверка: все ли походили? (Упрощенно: если мафия сделала выбор, идем дальше)
        if (room.nightActions.kill) {
            // Маленькая задержка для атмосферы
            setTimeout(() => resolveNight(roomId), 3000);
        }
    });

    function resolveNight(roomId) {
        const room = mafiaRooms.get(roomId);
        if (!room || room.state !== 'night') return;

        const { kill, heal } = room.nightActions;
        let deadId = null;

        if (kill && kill !== heal) {
            const victim = room.players.find(p => p.id === kill);
            if (victim) {
                victim.isAlive = false;
                deadId = victim.id;
            }
        }

        room.state = 'day_results';
        io.to(roomId).emit('mafia_day_start', { deadId, players: room.players });
        
        if (checkGameOver(roomId)) return;
    }

    // --- ГОЛОСОВАНИЕ ---
    socket.on('mafia_vote', ({ roomId, targetId }) => {
        const room = mafiaRooms.get(roomId);
        if (!room) return;

        // Здесь должна быть сложная логика подсчета голосов
        // Для MVP: Первый же голос убивает (упростим для теста, потом расширим)
        const victim = room.players.find(p => p.id === targetId);
        if (victim) {
            victim.isAlive = false;
            io.to(roomId).emit('mafia_vote_result', { victimName: victim.name, role: victim.role });
            if (!checkGameOver(roomId)) {
                setTimeout(() => startNight(roomId), 5000);
            }
        }
    });

    function checkGameOver(roomId) {
        const room = mafiaRooms.get(roomId);
        const alive = room.players.filter(p => p.isAlive);
        const mafias = alive.filter(p => p.role === 'mafia').length;
        const citizens = alive.length - mafias;

        if (mafias === 0) {
            io.to(roomId).emit('mafia_game_over', 'Мирные жители победили!');
            return true;
        }
        if (mafias >= citizens) {
            io.to(roomId).emit('mafia_game_over', 'Мафия победила!');
            return true;
        }
        return false;
    }

    socket.on('disconnect', () => {
        // Логика удаления из комнаты
    });
};