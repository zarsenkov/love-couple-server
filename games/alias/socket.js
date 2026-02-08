// Глобальное хранилище комнат (можно вынести в отдельный файл state.js, но пока пусть будет тут)
const rooms = {}; 

module.exports = (io, socket) => {

    // --- СОБЫТИЕ: СОЗДАНИЕ КОМНАТЫ ---
    socket.on('create_room', ({ playerName, gameType }) => {
        try {
            // 1. Генерируем ID комнаты (5 букв)
            const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
            
            console.log(`[ALIAS] Игрок ${playerName} создает комнату ${roomId}`);

            // 2. Создаем структуру комнаты
            rooms[roomId] = {
                id: roomId,
                gameType: 'alias',
                hostId: socket.id,
                state: 'lobby', // lobby, playing, finished
                players: [
                    { 
                        id: socket.id, 
                        name: playerName, 
                        team: 'A', // Первый игрок в команду А
                        score: 0,
                        role: 'host' 
                    }
                ],
                settings: {
                    timeRound: 60,
                    scoreGoal: 30
                },
                gameData: {
                    currentWord: null,
                    timeLeft: 0
                }
            };

            // 3. Подключаем сокет создателя к комнате (комната socket.io)
            socket.join(roomId);

            // 4. Отправляем подтверждение клиенту
            // Важно: отправляем и ID, и список игроков сразу, чтобы отрисовать лобби
            socket.emit('room_created', { 
                roomId: roomId, 
                players: rooms[roomId].players 
            });

            // Обновляем лобби для всех (хотя там пока один игрок)
            io.to(roomId).emit('update_lobby', rooms[roomId]);

        } catch (e) {
            console.error("Ошибка при создании комнаты:", e);
        }
    });

    // --- СОБЫТИЕ: ВХОД В КОМНАТУ (Для второго игрока) ---
    socket.on('join_room', ({ roomId, playerName }) => {
        roomId = roomId.toUpperCase(); // Защита от регистра
        const room = rooms[roomId];

        if (room && room.state === 'lobby') {
            console.log(`[ALIAS] Игрок ${playerName} входит в ${roomId}`);
            
            // Распределение команд (четный/нечетный)
            const team = room.players.length % 2 === 0 ? 'A' : 'B';
            
            room.players.push({
                id: socket.id,
                name: playerName,
                team: team,
                score: 0,
                role: 'player'
            });

            socket.join(roomId);
            
            // Уведомляем ВСЕХ в комнате, что пришел новый игрок
            io.to(roomId).emit('update_lobby', room);
            
            // Отправляем присоединившемуся подтверждение
            socket.emit('room_created', { roomId: roomId, players: room.players }); // Используем то же событие для переключения экрана
            
        } else {
            socket.emit('error_msg', 'Комната не найдена или игра уже идет!');
        }
    });

    // ... сюда пойдут остальные события (start_game, next_word) ...
};