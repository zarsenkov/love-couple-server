const bunkerRooms = new Map();

const DATA = {
    disasters: [
        { name: "ЯДЕРНАЯ ЗИМА", desc: "Радиация и холод -60°C. Поверхность мертва на десятилетия." },
        { name: "ПАНДЕМИЯ Z", desc: "Вирус превращает людей в агрессивных мутантов. 99% населения заражены." },
        { name: "СТОЛКНОВЕНИЕ", desc: "Астероид вызвал цунами и закрыл солнце пылью. Еды почти нет." },
        { name: "ВОССТАНИЕ ИИ", desc: "Дроны охотятся за любым тепловым излучением. Мы — дичь." }
    ],
    professions: ["Врач-хирург", "Инженер", "Ученый-биолог", "Повар", "Военный", "Психолог", "Фермер", "Слесарь", "Программист", "Учитель"],
    health: ["Идеально здоров", "Астма", "Диабет 1 типа", "Слепота на один глаз", "Крепкий иммунитет", "Депрессия", "Бесплодие"],
    hobbies: ["Рисование", "Бокс", "Игра на гитаре", "Огородничество", "Паркур", "Охота", "Кулинария", "Чтение"],
    phobias: ["Темнота", "Пауки", "Замкнутое пространство", "Кровь", "Одиночество", "Высота"],
    luggage: ["Дробовик (2 патрона)", "Аптечка", "Семена овощей", "Бутылка виски", "Набор инструментов", "Рация", "Фонарик"],
    specialCards: ["ОБМЕН: Поменяйся профессией с любым игроком", "ЛЕЧЕНИЕ: Вылечи свое здоровье", "РЕВИЗИЯ: Узнай багаж любого игрока", "ДЕТЕКТОР: Узнай правду о здоровье игрока"]
};

module.exports = (io, socket) => {
    
    socket.on('bunker-create', ({ playerName }) => {
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
        socket.emit('bunker-room-data', room);
    });

    socket.on('bunker-join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = bunkerRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, character: {}, revealed: [], isOut: false });
            socket.join(id);
            io.to(id).emit('bunker-room-data', room);
        } else {
            socket.emit('error_msg', 'БУНКЕР НЕ НАЙДЕН ИЛИ ИГРА НАЧАТА');
        }
    });

    socket.on('bunker-start', (roomId) => {
        const room = bunkerRooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.state = 'playing';
            room.disaster = DATA.disasters[Math.floor(Math.random() * DATA.disasters.length)];
            room.bunker = { 
                food: Math.floor(Math.random() * 24) + 6 + " мес.", 
                area: room.players.length * 8 + "м²",
                extra: "Система очистки воздуха" 
            };

            room.players.forEach(p => {
                p.character = {
                    prof: DATA.professions[Math.floor(Math.random() * DATA.professions.length)],
                    health: DATA.health[Math.floor(Math.random() * DATA.health.length)],
                    hobby: DATA.hobbies[Math.floor(Math.random() * DATA.hobbies.length)],
                    phobia: DATA.phobias[Math.floor(Math.random() * DATA.phobias.length)],
                    luggage: DATA.luggage[Math.floor(Math.random() * DATA.luggage.length)],
                    special: DATA.specialCards[Math.floor(Math.random() * DATA.specialCards.length)],
                    bio: (Math.random() > 0.5 ? 'Мужчина' : 'Женщина') + ", " + (Math.floor(Math.random() * 45) + 18) + " лет"
                };
                p.revealed = []; 
            });

            io.to(roomId).emit('bunker-game-start', room);
        }
    });

    socket.on('bunker-reveal', ({ roomId, trait }) => {
        const room = bunkerRooms.get(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.revealed.includes(trait)) {
            player.revealed.push(trait);
            io.to(roomId).emit('bunker-update-data', room);
        }
    });

    socket.on('bunker-vote', ({ roomId, targetId }) => {
        const room = bunkerRooms.get(roomId);
        if (!room) return;
        const target = room.players.find(p => p.id === targetId);
        if (target) {
            target.isOut = true;
            io.to(roomId).emit('bunker-update-data', room);
            io.to(roomId).emit('log_msg', `${target.name} изгнан из убежища!`);
        }
    });

    socket.on('disconnect', () => {
        bunkerRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) bunkerRooms.delete(roomId);
                else io.to(roomId).emit('bunker-room-data', room);
            }
        });
    });
};
