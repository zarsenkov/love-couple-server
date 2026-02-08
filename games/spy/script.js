// Инициализация сокета
const socket = io();

// Глобальное состояние онлайн-игры
let onlineState = {
    roomId: '',
    playerName: '',
    isHost: false,
    spyCount: 1
};

// Функция переключения экранов
function toScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// Функция входа в игру
function joinGame() {
    const name = document.getElementById('player-name').value.trim();
    const room = document.getElementById('room-id').value.trim();

    if (name.length < 2 || room.length < 4) {
        alert("Введите корректное имя и ID комнаты (4 цифры)");
        return;
    }

    onlineState.playerName = name;
    onlineState.roomId = room;

    // Отправляем запрос на сервер с префиксом spy-
    socket.emit('spy-join', { roomId: room, playerName: name });
}

// Функция изменения настроек (только для хоста)
function changeOnlineVal(type, delta) {
    if (type === 'spies') {
        onlineState.spyCount = Math.max(1, onlineState.spyCount + delta);
        document.getElementById('online-spy-count').innerText = onlineState.spyCount;
    }
}

// Функция запуска игры хостом
function startOnlineGame() {
    socket.emit('spy-start', {
        roomId: onlineState.roomId,
        settings: {
            spyCount: onlineState.spyCount,
            locations: LOCATIONS // Используем массив из основного script.js
        }
    });
}

// --- ОБРАБОТКА СОБЫТИЙ СЕРВЕРА ---

// Обновление списка игроков в лобби
socket.on('spy-update-lobby', ({ players, gameStarted }) => {
    toScreen('lobby-screen');
    document.getElementById('display-room-id').innerText = onlineState.roomId;
    
    const list = document.getElementById('online-players-list');
    list.innerHTML = players.map(p => `
        <div class="name-tag ${p.name === onlineState.playerName ? 'me' : ''}">
            ${p.name} ${p.isHost ? '👑' : ''}
        </div>
    `).join('');

    // Проверяем, является ли текущий игрок хостом
    const me = players.find(p => p.id === socket.id);
    if (me && me.isHost) {
        onlineState.isHost = true;
        document.getElementById('host-controls').style.display = 'block';
        document.getElementById('wait-message').style.display = 'none';
    }
});

// Получение роли от сервера (индивидуально)
socket.on('spy-your-role', ({ role, location }) => {
    toScreen('role-screen');
    const roleEl = document.getElementById('role-text');
    const locEl = document.getElementById('location-text');

    roleEl.innerText = role;
    
    // Если игрок — шпион, скрываем локацию (или пишем "Неизвестно")
    if (role === "ШПИОН") {
        locEl.innerText = "ВЫ ДОЛЖНЫ УЗНАТЬ ГДЕ ВЫ";
        roleEl.style.color = "var(--neon-red)";
    } else {
        locEl.innerText = "ЛОКАЦИЯ: " + location;
        roleEl.style.color = "var(--neon-cyan)";
    }
});

// Ошибка при входе
socket.on('spy-error', (msg) => {
    alert(msg);
});
