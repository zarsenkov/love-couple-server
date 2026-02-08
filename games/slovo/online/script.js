(function() {
    // Подключаемся к серверу
    const socket = io("https://lovecouple-server-zarsenkov.amvera.io", { transports: ["polling", "websocket"] });
    let myName, myRoom, isMyTurn = false, timerInterval, allPlayers = [];

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(id);
        if(target) target.classList.add('active');
    }

    // 1. ФУНКЦИЯ ПОЛУЧЕНИЯ КАРТОЧКИ (Исправленная)
function getCard() {
        // Проверяем наличие массива в глобальном окне
        if (window.words && window.words.length > 0) {
            const randomIndex = Math.floor(Math.random() * window.words.length);
            const word = window.words[randomIndex];

            // Берем алфавит оттуда же или стандарт
            const alpha = window.alphabet || "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ";
            const lets = Array.from({length:3}, () => alpha[Math.floor(Math.random()*alpha.length)]).join(" ");

            return { 
                word: word.toUpperCase(), 
                letters: lets.toUpperCase() 
            };
        } else {
            console.error("Файл cards.js в папке online не найден или пуст!");
            return { word: "ОШИБКА ФАЙЛА", letters: "? ? ?" };
        }
    }

    // 2. ЛОГИКА ВХОДА
    window.joinLobby = function() {
        myName = document.getElementById('player-name').value.trim();
        myRoom = document.getElementById('room-id').value.trim();
        if(myName && myRoom) {
            socket.emit('join-room', { roomId: myRoom, playerName: myName });
            showScreen('lobby-screen');
            const rd = document.getElementById('room-display');
            if(rd) rd.innerText = "КОМНАТА: " + myRoom;
        }
    };

    // 3. ОБНОВЛЕНИЕ ЛОББИ
    socket.on('update-lobby', (data) => {
        allPlayers = data.players;
        const list = document.getElementById('players-list');
        if(list) {
            list.innerHTML = data.players.map(p => 
                `<li style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #ccc;">
                    <span>${p.name}</span><b>${p.score}</b>
                </li>`).join('');
        }
        
        if(data.players[0].id === socket.id && !data.gameStarted) {
            const hc = document.getElementById('host-controls');
            const sb = document.getElementById('start-btn');
            if(hc) hc.style.display = 'block';
            if(sb) sb.classList.remove('hidden');
        }
    });

    window.requestStart = function() {
        const rc = document.getElementById('rounds-count');
        const tv = document.getElementById('timer-val');
        socket.emit('start-game', { 
            roomId: myRoom, 
            maxRounds: rc ? rc.value : 3,
            timer: tv ? tv.value : 60
        });
    };

    // 4. ИГРОВОЙ ПРОЦЕСС
    socket.on('turn-changed', (data) => {
        showScreen('game-screen');
        isMyTurn = (socket.id === data.activePlayerId);
        
        const ha = document.getElementById('host-actions');
        const gm = document.getElementById('guest-msg');
        if(ha) ha.style.display = isMyTurn ? 'flex' : 'none';
        if(gm) gm.style.display = isMyTurn ? 'none' : 'block';
        
        document.getElementById('role-banner').innerText = isMyTurn ? "ТВОЙ ХОД (ОБЪЯСНЯЙ)" : "ВЕДЕТ: " + data.activePlayerName;
        
        if(isMyTurn) sendNewWord();
        startTimer(data.timer);
    });

    function sendNewWord() {
        const c = getCard();
        socket.emit('game-action', { roomId: myRoom, data: { type: 'SYNC', word: c.word, letters: c.letters } });
    }

    socket.on('game-event', (data) => {
        if(data.type === 'SYNC') {
            document.getElementById('target-letters').innerText = data.letters;
            document.getElementById('current-word').innerText = isMyTurn ? data.word : "???";
        }
    });

    // 5. ВЫБОР ПОБЕДИТЕЛЯ
    window.showScoreModal = function() {
        const container = document.getElementById('winner-buttons');
        if(container) {
            container.innerHTML = allPlayers.filter(p => p.id !== socket.id)
                .map(p => `<button class="btn-zinc" style="margin-bottom:5px;" onclick="givePoint('${p.name}')">${p.name}</button>`).join('');
            document.getElementById('score-modal').style.display = 'flex';
        }
    };

    window.givePoint = function(name) {
        socket.emit('add-point-to', { roomId: myRoom, targetName: name });
        window.closeModal();
        socket.emit('switch-turn', myRoom);
    };

    window.closeModal = () => {
        document.getElementById('score-modal').style.display = 'none';
    };

    window.handleSkip = () => socket.emit('switch-turn', myRoom);

    function startTimer(sec) {
        clearInterval(timerInterval);
        let left = sec;
        const el = document.getElementById('timer');
        if(!el) return;
        el.innerText = left;
        timerInterval = setInterval(() => {
            left--;
            el.innerText = left;
            if(left <= 0) { 
                clearInterval(timerInterval); 
                if(isMyTurn) socket.emit('switch-turn', myRoom); 
            }
        }, 1000);
    }

    socket.on('game-over', (data) => {
        showScreen('result-screen');
        const fs = document.getElementById('final-stats');
        if(fs) {
            const sorted = [...data.players].sort((a,b) => b.score - a.score);
            fs.innerHTML = sorted.map(p => `<div>${p.name}: ${p.score}</div>`).join('');
        }
    });
})();
