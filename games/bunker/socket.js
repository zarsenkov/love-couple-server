const bunkerRooms = new Map();

// База данных (сокращенно, расширяется аналогично оффлайн версии)
const DATA = {
    disasters: [
        { name: "ЯДЕРНАЯ ЗИМА", desc: "Радиация и вечный холод. Поверхность непригодна для жизни на 50 лет." },
        { name: "ТЕХНОГЕННЫЙ КОЛЛАПС", desc: "Все заводы взорвались, атмосфера отравлена токсичным газом." },
        { name: "БИОЛОГИЧЕСКАЯ УГРОЗА", desc: "Вирус поражает нервную систему. Выжившие прячутся под землей." }
    ],
    professions: ["Врач", "Инженер", "Ученый", "Повар", "Военный", "Психолог", "Фермер", "Слесарь"],
    health: ["Здоров", "Астма", "Диабет", "Слепота", "Иммунитет", "Депрессия"],
    specialCards: ["Обмен ролью", "Проверка здоровья", "Доп. паек", "Вскрыть чужое хобби"]
};

module.exports = (io, socket) => {
    
    socket.on('bunker_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{ id: socket.id, name: playerName, character: {}, revealed: [], isOut: false }],
            disaster: null,
            bunker: {}
        };
        bunkerRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('bunker_created', { roomId, players: room.players });
    });

    socket.on('bunker_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = bunkerRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, character: {}, revealed: [], isOut: false });
            socket.join(id);
            io.to(id).emit('bunker_update', room);
            socket.emit('bunker_created', { roomId: id, players: room.players });
        } else {
            socket.emit('error_msg', 'БУНКЕР НЕ НАЙДЕН');
        }
    });

    socket.on('bunker_start', (roomId) => {
        const room = bunkerRooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.state = 'playing';
            
            // Генерируем мир
            room.disaster = DATA.disasters[Math.floor(Math.random() * DATA.disasters.length)];
            room.bunker = { food: "6 месяцев", area: room.players.length * 10 + "м²" };

            // Генерируем персонажей
            room.players.forEach(p => {
                p.character = {
                    prof: DATA.professions[Math.floor(Math.random() * DATA.professions.length)],
                    health: DATA.health[Math.floor(Math.random() * DATA.health.length)],
                    special: DATA.specialCards[Math.floor(Math.random() * DATA.specialCards.length)],
                    bio: (Math.random() > 0.5 ? 'М' : 'Ж') + ", " + (Math.floor(Math.random() * 50) + 18) + " лет"
                };
                p.revealed = []; // Список вскрытых черт (напр. ['prof'])
            });

            io.to(roomId).emit('bunker_game_start', room);
        }
    });

    // Вскрытие характеристики
    socket.on('bunker_reveal', ({ roomId, trait }) => {
        const room = bunkerRooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.revealed.includes(trait)) {
            player.revealed.push(trait);
            io.to(roomId).emit('bunker_update_data', room);
        }
    });

    socket.on('bunker_vote', ({ roomId, targetId }) => {
        const room = bunkerRooms.get(roomId);
        if (!room) return;
        const target = room.players.find(p => p.id === targetId);
        if (target) {
            target.isOut = true;
            io.to(roomId).emit('bunker_update_data', room);
            io.to(roomId).emit('log_msg', `Игрок ${target.name} изгнан!`);
        }
    });

    socket.on('disconnect', () => {
        bunkerRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) bunkerRooms.delete(roomId);
                else io.to(roomId).emit('bunker_update', room);
            }
        });
    });
};