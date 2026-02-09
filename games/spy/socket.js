// Глобальный объект комнат
const spyRooms = new Map();

const SPY_LOCATIONS = [
    "ОРБИТАЛЬНАЯ СТАНЦИЯ", "ПОДВОДНАЯ ЛОДКА", "СЕКРЕТНЫЙ БУНКЕР", "БАНК", 
    "ТЕАТР", "КАЗИНО", "СУПЕРМАРКЕТ", "БАЙКОНУР", "ВОИНСКАЯ ЧАСТЬ", 
    "ОТЕЛЬ", "АЭРОПОРТ", "ЛАБОРАТОРИЯ", "КРУИЗНЫЙ ЛАЙНЕР", "ПОЛИЦЕЙСКИЙ УЧАСТОК"
];

module.exports = (io, socket) => {
    
    socket.on('spy_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{ id: socket.id, name: playerName, role: '', isReady: false }],
            settings: { time: 480 }, // 8 минут
            location: '',
            timer: null
        };
        spyRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('spy_created', { roomId, players: room.players });
    });

    socket.on('spy_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = spyRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, role: '', isReady: false });
            socket.join(id);
            io.to(id).emit('spy_update_lobby', room);
            socket.emit('spy_created', { roomId: id, players: room.players });
        } else {
            socket.emit('error_msg', 'ОБЪЕКТ НЕ НАЙДЕН');
        }
    });

    socket.on('spy_start', (roomId) => {
        const room = spyRooms.get(roomId);
        if (room && room.hostId === socket.id && room.players.length >= 2) {
            room.state = 'playing';
            room.location = SPY_LOCATIONS[Math.floor(Math.random() * SPY_LOCATIONS.length)];
            const spyIdx = Math.floor(Math.random() * room.players.length);
            
            room.players.forEach((p, i) => {
                p.role = (i === spyIdx) ? 'SPY' : 'AGENT';
            });

            io.to(roomId).emit('spy_game_start', { 
                location: room.location, 
                players: room.players,
                totalTime: room.settings.time 
            });

            // Запуск таймера
            let timeLeft = room.settings.time;
            if (room.timer) clearInterval(room.timer);
            room.timer = setInterval(() => {
                timeLeft--;
                io.to(roomId).emit('spy_timer_tick', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(room.timer);
                    io.to(roomId).emit('spy_game_end', { reason: 'TIME_OVER' });
                }
            }, 1000);
        }
    });

    socket.on('disconnect', () => {
        spyRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) {
                    clearInterval(room.timer);
                    spyRooms.delete(roomId);
                } else {
                    io.to(roomId).emit('spy_update_lobby', room);
                }
            }
        });
    });
};