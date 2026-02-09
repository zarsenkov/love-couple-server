const spyRooms = new Map();

// Список локаций
const LOCATIONS = [
    "Орбитальная станция", "Овощебаза", "Подводная лодка", "Киностудия", 
    "Партизанский отряд", "Больница", "Цирк-шапито", "Казино", 
    "Школа", "Пиратский корабль", "Полицейский участок", "Театр",
    "Самолет", "Супермаркет", "Банк", "Отель", "Воинская часть"
];

module.exports = (io, socket) => {
    
    socket.on('spy_create', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        const room = {
            id: roomId,
            hostId: socket.id,
            state: 'lobby',
            players: [{ id: socket.id, name: playerName, role: '', isHost: true }],
            location: '',
            settings: { time: 480 } // 8 минут по умолчанию
        };
        spyRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('spy_created', { roomId, players: room.players });
    });

    socket.on('spy_join', ({ roomId, playerName }) => {
        const id = roomId?.toUpperCase().trim();
        const room = spyRooms.get(id);
        if (room && room.state === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, role: '', isHost: false });
            socket.join(id);
            io.to(id).emit('spy_update', room);
            socket.emit('spy_created', { roomId: id, players: room.players });
        } else {
            socket.emit('error_msg', 'Комната не найдена');
        }
    });

    socket.on('spy_start', (roomId) => {
        const room = spyRooms.get(roomId);
        if (room && room.hostId === socket.id && room.players.length >= 3) {
            room.state = 'playing';
            
            // Выбираем локацию
            room.location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
            
            // Выбираем шпиона
            const spyIdx = Math.floor(Math.random() * room.players.length);
            
            room.players.forEach((p, i) => {
                p.role = (i === spyIdx) ? 'spy' : 'civilian';
            });

            io.to(roomId).emit('spy_game_start', { 
                location: room.location, 
                players: room.players,
                time: room.settings.time 
            });
        } else {
            socket.emit('error_msg', 'Нужно минимум 3 игрока');
        }
    });

    socket.on('disconnect', () => {
        spyRooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) spyRooms.delete(roomId);
                else io.to(roomId).emit('spy_update', room);
            }
        });
    });
};