// Объект для хранения комнат игры "Шпион"
// Ключ - roomId, значение - объект с данными игры
const roomsSpy = {};

function handleSpyGame(io, socket) {
    // Функция обработки входа в комнату "Шпиона"
    socket.on('spy-join', ({ roomId, playerName }) => {
        // Если комнаты нет — создаем её
        if (!roomsSpy[roomId]) {
            roomsSpy[roomId] = {
                players: [],
                gameStarted: false,
                location: "",
                spies: []
            };
        }

        const room = roomsSpy[roomId];

        // Проверяем, не занято ли имя
        if (room.players.find(p => p.name === playerName)) {
            socket.emit('spy-error', 'Это имя уже занято!');
            return;
        }

        // Добавляем игрока: первый вошедший становится хостом
        const isHost = room.players.length === 0;
        const newPlayer = {
            id: socket.id,
            name: playerName,
            isHost: isHost,
            role: null
        };

        room.players.push(newPlayer);
        socket.join(roomId);

        // Уведомляем всех в комнате об обновлении списка игроков
        io.to(roomId).emit('spy-update-lobby', {
            players: room.players,
            gameStarted: room.gameStarted
        });
    });

    // Функция запуска игры (только для хоста)
    socket.on('spy-start', ({ roomId, settings }) => {
        const room = roomsSpy[roomId];
        if (!room) return;

        room.gameStarted = true;
        
        // Выбираем случайную локацию из присланного списка или встроенного
        // Локация выбирается один раз на сервере для синхронизации
        const locations = settings.locations;
        room.location = locations[Math.floor(Math.random() * locations.length)];

        // Распределяем роли: выбираем индексы шпионов
        const playerIndices = [...Array(room.players.length).keys()];
        const spyIndices = [];
        for (let i = 0; i < settings.spyCount; i++) {
            const randomIdx = Math.floor(Math.random() * playerIndices.length);
            spyIndices.push(playerIndices.splice(randomIdx, 1)[0]);
        }

        // Назначаем роли каждому игроку
        room.players.forEach((player, index) => {
            if (spyIndices.includes(index)) {
                player.role = "ШПИОН";
            } else {
                player.role = room.location;
            }
            // Отправляем каждому игроку ЕГО роль персонально (система приватности)
            io.to(player.id).emit('spy-your-role', {
                role: player.role,
                location: room.location, // Шпион тоже может получить это, если механика позволяет, либо скрыть
                time: settings.time
            });
        });

        // Уведомляем всех о начале игры (переход на экран игры)
        io.to(roomId).emit('spy-game-started');
    });

    // Функция принудительного голосования или завершения игры
    socket.on('spy-stop-game', (roomId) => {
        io.to(roomId).emit('spy-go-to-vote');
    });

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        for (const roomId in roomsSpy) {
            const room = roomsSpy[roomId];
            const playerIdx = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIdx !== -1) {
                const disconnectedPlayer = room.players.splice(playerIdx, 1)[0];
                
                // Если вышел хост, назначаем нового
                if (disconnectedPlayer.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                }

                // Если в комнате никого не осталось — удаляем её
                if (room.players.length === 0) {
                    delete roomsSpy[roomId];
                } else {
                    io.to(roomId).emit('spy-update-lobby', {
                        players: room.players,
                        gameStarted: room.gameStarted
                    });
                }
            }
        }
    });
}
