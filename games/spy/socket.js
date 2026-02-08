// Объект для хранения активных игровых комнат "Шпиона"
// Ключ — ID комнаты, значение — объект с данными (игроки, локация и т.д.)
const roomsSpy = {};

// Экспортируем функцию для подключения к основному серверу index.js
module.exports = function(io, socket) {

    // --- ЛОГИКА ВХОДА В КОМНАТУ ---
    // Вызывается, когда игрок вводит ID комнаты и имя
    socket.on('spy-join', ({ roomId, playerName }) => {
        // Если такой комнаты еще нет — создаем новую структуру
        if (!roomsSpy[roomId]) {
            roomsSpy[roomId] = {
                players: [],
                gameStarted: false,
                location: "",
                spies: []
            };
        }

        const room = roomsSpy[roomId];

        // Проверяем, нет ли уже игрока с таким же именем (защита от дублей)
        if (room.players.find(p => p.name === playerName)) {
            socket.emit('spy-error', 'Это имя уже занято!');
            return;
        }

        // Создаем объект нового игрока. Если список пуст — он будет хостом (isHost: true)
        const isHost = room.players.length === 0;
        const newPlayer = {
            id: socket.id,
            name: playerName,
            isHost: isHost,
            role: null
        };

        // Добавляем игрока в массив и подписываем его сокет на канал комнаты
        room.players.push(newPlayer);
        socket.join(roomId);

        // Рассылаем всем в комнате обновленный список участников для отображения в лобби
        io.to(roomId).emit('spy-update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted
        });
    });

    // --- ЛОГИКА ЗАПУСКА ИГРЫ ---
    // Вызывается только хостом при нажатии кнопки "Запустить"
    socket.on('spy-start', ({ roomId, settings }) => {
        const room = roomsSpy[roomId];
        // Если комнаты нет, прерываем выполнение
        if (!room) return;

        room.gameStarted = true;
        
        // Выбираем случайную локацию один раз на сервере, чтобы она была одинаковой у всех "мирных"
        const locations = settings.locations;
        room.location = locations[Math.floor(Math.random() * locations.length)];

        // Генерируем список индексов игроков для выбора шпионов
        const playerIndices = [...Array(room.players.length).keys()];
        const spyIndices = [];
        
        // Выбираем случайных шпионов в зависимости от настроек
        for (let i = 0; i < settings.spyCount; i++) {
            if (playerIndices.length > 0) {
                const randomIdx = Math.floor(Math.random() * playerIndices.length);
                spyIndices.push(playerIndices.splice(randomIdx, 1)[0]);
            }
        }

        // Проходим по всем игрокам и назначаем им роли
        room.players.forEach((player, index) => {
            const isSpy = spyIndices.includes(index);
            player.role = isSpy ? "ШПИОН" : room.location;

            // Отправляем роль каждому игроку ПЕРСОНАЛЬНО через его socket.id
            // Это гарантирует, что никто не увидит чужую роль через сетевой трафик
            io.to(player.id).emit('spy-your-role', {
                role: player.role,
                location: room.location,
                isSpy: isSpy,
                time: settings.time
            });
        });

        // Отправляем сигнал всем, что игра началась (для смены экрана в приложении)
        io.to(roomId).emit('spy-game-started');
    });

    // --- ПРИНУДИТЕЛЬНОЕ ГОЛОСОВАНИЕ ---
    // Вызывается, когда время вышло или нажата кнопка завершения
    socket.on('spy-stop-game', (roomId) => {
        io.to(roomId).emit('spy-go-to-vote');
    });

    // --- ОБРАБОТКА ВЫХОДА ИЗ ИГРЫ ---
    // Вызывается автоматически сокетом при закрытии вкладки или потере сети
    socket.on('disconnect', () => {
        // Перебираем все комнаты, чтобы найти, откуда ушел игрок
        for (const roomId in roomsSpy) {
            const room = roomsSpy[roomId];
            const playerIdx = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIdx !== -1) {
                // Удаляем игрока из списка
                const disconnectedPlayer = room.players.splice(playerIdx, 1)[0];
                
                // Если ушел хост, назначаем первого оставшегося игрока новым хостом
                if (disconnectedPlayer.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                }

                // Если в комнате больше никого нет — удаляем комнату из памяти сервера
                if (room.players.length === 0) {
                    delete roomsSpy[roomId];
                } else {
                    // Иначе обновляем лобби для оставшихся игроков
                    io.to(roomId).emit('spy-update-lobby', {
                        players: room.players,
                        gameStarted: room.gameStarted
                    });
                }
            }
        }
    });
};
