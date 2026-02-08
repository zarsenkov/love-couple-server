const socket = io("https://lovecouple-server-zarsenkov.amvera.io"); // Твой адрес сервера
let myName, myRoom, isMyTurn = false;
let categoriesData = {};
let selectedCats = [];

// Загрузка категорий
fetch('categories.json')
    .then(r => r.json())
    .then(data => {
        categoriesData = data.categories || data;
        const box = document.getElementById('categories-box');
        Object.keys(categoriesData).forEach(cat => {
            const btn = document.createElement('div');
            btn.className = 'cat-item';
            btn.innerText = cat;
            btn.onclick = () => {
                btn.classList.toggle('selected');
                selectedCats.includes(cat) ? 
                    selectedCats = selectedCats.filter(c => c !== cat) : 
                    selectedCats.push(cat);
            };
            box.appendChild(btn);
        });
    });

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function joinGame() {
    myName = document.getElementById('player-name').value.trim();
    myRoom = document.getElementById('room-id').value.trim();
    if(myName && myRoom) {
        socket.emit('whoami-join', { roomId: myRoom, playerName: myName });
        showScreen('lobby-screen');
        document.getElementById('room-display').innerText = "КОМНАТА: " + myRoom;
    }
}

socket.on('whoami-update-lobby', (data) => {
    const list = document.getElementById('players-list');
    list.innerHTML = data.players.map(p => `<li>${p.name} — ${p.score} очков</li>`).join('');
    
    // Если я первый в списке — я хост
    if(data.players[0].id === socket.id) {
        document.getElementById('host-controls').style.display = 'block';
        document.getElementById('wait-msg').style.display = 'none';
    }
});

function startGame() {
    if(selectedCats.length === 0) return alert("Выбери хоть одну категорию!");
    
    let pool = [];
    selectedCats.forEach(cat => pool.push(...categoriesData[cat]));
    pool = pool.sort(() => Math.random() - 0.5); // Перемешиваем

    socket.emit('whoami-start', { roomId: myRoom, words: pool, timer: 90 });
}

socket.on('whoami-new-turn', (data) => {
    showScreen('game-screen');
    isMyTurn = (socket.id === data.activePlayerId);
    
    document.getElementById('active-player-name').innerText = data.activePlayerName;
    const wordEl = document.getElementById('current-word');
    const instrEl = document.getElementById('instruction');
    const controls = document.getElementById('action-buttons');

    if(isMyTurn) {
        wordEl.innerText = "ПРИЛОЖИ КО ЛБУ";
        instrEl.innerText = "Ты угадываешь! Слушай друзей.";
        controls.style.display = 'none'; // Угадывающий не нажимает кнопки сам (или можно включить)
    } else {
        wordEl.innerText = data.word;
        instrEl.innerText = "Объясняй игроку " + data.activePlayerName;
        // Кнопки управления только у тех, кто видит слово (или только у одного)
        controls.style.display = 'grid'; 
    }
    
    startTimer(data.timer);
});

function sendAction(isCorrect) {
    socket.emit('whoami-action', { roomId: myRoom, isCorrect: isCorrect });
}

function startTimer(sec) {
    let timeLeft = sec;
    const el = document.getElementById('timer');
    clearInterval(window.gameTimer);
    window.gameTimer = setInterval(() => {
        timeLeft--;
        el.innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(window.gameTimer);
            if(isMyTurn) socket.emit('whoami-timeout', myRoom);
        }
    }, 1000);
}

socket.on('whoami-game-over', (data) => {
    showScreen('result-screen');
    const stats = document.getElementById('final-stats');
    stats.innerHTML = data.players.sort((a,b) => b.score - a.score)
        .map(p => `<div>${p.name}: ${p.score}</div>`).join('');
});
