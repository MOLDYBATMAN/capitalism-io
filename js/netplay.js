// Netplay module for Capitalism.io — handles online multiplayer via Socket.io
// Must be loaded after socket.io client script, before other game scripts.

const netplay = (() => {
  // ---- State ----
  let socket = null;
  let auth = { loggedIn: false, username: null, token: null, isGuest: false };
  let myPlayerIdx = null;  // our slot in the online game
  let inOnlineGame = false;
  let isSpectator = false;
  let currentRoom = null;
  let chatOpen = false;
  let _turnTimerInterval = null;
  let _turnTimerSeconds = 0;
  const TURN_TIME_LIMIT = 90;

  // ---- Init ----
  function init() {
    initAuth();
  }

  function initAuth() {
    const token = localStorage.getItem('cap_token');
    const username = localStorage.getItem('cap_username');
    if (token && username) {
      // Validate token against server
      fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
        .then(r => r.json())
        .then(data => {
          if (data.username) {
            auth = { loggedIn: true, username: data.username, token, isGuest: false };
            _updateAuthUI();
            showLobbyScreen();
          } else {
            localStorage.removeItem('cap_token');
            localStorage.removeItem('cap_username');
            showAuthScreen();
          }
        })
        .catch(() => showAuthScreen());
    } else {
      showAuthScreen();
    }
  }

  function _connectSocket() {
    if (socket && socket.connected) return;
    socket = io({ auth: { token: auth.token || null } });

    socket.on('connect', () => {
      _log('Connected to server.');
    });

    socket.on('disconnect', () => {
      _log('Disconnected from server.');
      _setWaitingOverlay(false);
    });

    socket.on('room:joined', ({ room, myPlayerIdx: idx }) => {
      currentRoom = room;
      myPlayerIdx = idx;
      showRoomScreen();
      _renderRoomScreen();
    });

    socket.on('room:update', ({ room }) => {
      currentRoom = room;
      if (_isOnRoomScreen()) _renderRoomScreen();
    });

    socket.on('room:list', ({ rooms }) => {
      _renderRoomList(rooms);
    });

    socket.on('room:error', ({ message }) => {
      _showError(message);
    });

    socket.on('game:started', ({ myPlayerIdx: idx, rules }) => {
      myPlayerIdx = idx;
      inOnlineGame = true;
      isSpectator = false;
      if (currentRoom) currentRoom._startRules = rules || {};
      _startOnlineGame();
    });

    socket.on('spectate:joined', ({ room, state }) => {
      currentRoom = room;
      myPlayerIdx = -1;
      inOnlineGame = true;
      isSpectator = true;
      _hideAllScreens();
      document.getElementById('screen-game').classList.add('active');
      _updateAuthUI();
      document.getElementById('online-indicator').style.display = 'flex';
      const chatToggle = document.getElementById('chat-toggle-btn');
      if (chatToggle) chatToggle.style.display = 'flex';
      if (game && state) {
        game.restore(state);
        if (ui) ui.refresh();
      }
      _setWaitingOverlay(false);
    });

    socket.on('game:state', ({ state }) => {
      if (!inOnlineGame || !game) return;
      game.restore(state);
      if (ui) ui.refresh();
      _updateWaitingOverlay();
      _resetTurnTimer();
    });

    socket.on('room:rematch', () => {
      // Server reset the room back to waiting — return to room screen
      inOnlineGame = false;
      isSpectator = false;
      _clearTurnTimer();
      _setWaitingOverlay(false);
      const chatToggle = document.getElementById('chat-toggle-btn');
      if (chatToggle) chatToggle.style.display = 'none';
      if (ui) ui.closeModal();
      showRoomScreen();
      _renderRoomScreen();
    });

    socket.on('game:player-ai', ({ playerIdx }) => {
      if (!inOnlineGame || !game) return;
      if (playerIdx >= 0 && playerIdx < game.players.length) {
        game.addLog(`⚠ ${game.players[playerIdx].name} disconnected — AI takes over.`);
        game.setPlayerAI(playerIdx);
      }
    });

    socket.on('chat:message', ({ username, text, timestamp }) => {
      _appendChatMessage(username, text, timestamp);
    });
  }

  // ---- Auth Screen ----
  function showAuthScreen() {
    _hideAllScreens();
    document.getElementById('screen-auth').classList.add('active');
  }

  function showLobbyScreen() {
    _connectSocket();
    _hideAllScreens();
    const s = document.getElementById('screen-lobby-online');
    s.classList.add('active');
    _updateAuthUI();
    socket.emit('room:list');
  }

  function showRoomScreen() {
    _hideAllScreens();
    document.getElementById('screen-room').classList.add('active');
  }

  function _hideAllScreens() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  }

  function _isOnRoomScreen() {
    return document.getElementById('screen-room').classList.contains('active');
  }

  // ---- Auth actions ----
  async function register(username, password) {
    try {
      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!r.ok) { _showError(data.error); return; }
      _saveAuth(data.token, data.username, false);
      showLobbyScreen();
    } catch (e) {
      _showError('Server error. Try again.');
    }
  }

  async function login(username, password) {
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!r.ok) { _showError(data.error); return; }
      _saveAuth(data.token, data.username, false);
      showLobbyScreen();
    } catch (e) {
      _showError('Server error. Try again.');
    }
  }

  function loginAsGuest() {
    const guestName = 'Guest-' + String(Math.floor(10000 + Math.random() * 90000));
    auth = { loggedIn: true, username: guestName, token: null, isGuest: true };
    localStorage.removeItem('cap_token');
    localStorage.removeItem('cap_username');
    showLobbyScreen();
  }

  function logout() {
    auth = { loggedIn: false, username: null, token: null, isGuest: false };
    localStorage.removeItem('cap_token');
    localStorage.removeItem('cap_username');
    if (socket) { socket.disconnect(); socket = null; }
    showAuthScreen();
  }

  function _saveAuth(token, username, isGuest) {
    auth = { loggedIn: true, username, token, isGuest };
    if (!isGuest) {
      localStorage.setItem('cap_token', token);
      localStorage.setItem('cap_username', username);
    }
    // Reconnect socket with new token
    if (socket) { socket.disconnect(); socket = null; }
  }

  function _updateAuthUI() {
    const indicator = document.getElementById('online-indicator');
    if (indicator && auth.loggedIn) {
      indicator.innerHTML = `<span class="online-dot"></span><span class="online-name">${_esc(auth.username)}</span>`;
      indicator.style.display = 'flex';
    }
  }

  // ---- Room list rendering ----
  function _renderRoomList(rooms) {
    const list = document.getElementById('room-list');
    if (!list) return;
    if (!rooms || rooms.length === 0) {
      list.innerHTML = '<div class="room-list-empty">No open rooms. Create one!</div>';
      return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-card" data-code="${_esc(r.code)}">
        <div class="room-card-name">${_esc(r.name)}</div>
        <div class="room-card-meta">
          <span class="room-code">${_esc(r.code)}</span>
          <span class="room-players">${r.players.length}/${r.maxPlayers} players</span>
        </div>
        <button class="btn btn-primary btn-sm-inline" onclick="netplay.joinRoom('${_esc(r.code)}')">Join</button>
      </div>
    `).join('');
  }

  // ---- Room screen rendering ----
  function _renderRoomScreen() {
    if (!currentRoom) return;
    const nameEl = document.getElementById('room-screen-name');
    if (nameEl) nameEl.textContent = currentRoom.name + ' [' + currentRoom.code + ']';

    const playerList = document.getElementById('room-player-list');
    if (playerList) {
      playerList.innerHTML = currentRoom.players.map((p, i) => `
        <div class="room-player-row ${p.playerIdx === myPlayerIdx ? 'me' : ''}">
          <span class="room-player-token" style="color:${_playerColor(p.playerIdx)}">${['●','■','▲','◆'][p.playerIdx] || '?'}</span>
          <span class="room-player-name">${_esc(p.username)}${p.isGuest ? ' <em>(guest)</em>' : ''}${p.playerIdx === 0 ? ' 👑' : ''}</span>
          <span class="room-player-status ${p.isReady ? 'ready' : 'not-ready'}">${p.disconnected ? '⚠ Disconnected' : p.isReady ? '✓ Ready' : 'Not Ready'}</span>
        </div>
      `).join('');
    }

    // Show/hide start button (only host sees it)
    const mySlot = currentRoom.players.find(p => p.playerIdx === myPlayerIdx);
    const isHost = mySlot && mySlot.playerIdx === 0;
    const startBtn = document.getElementById('btn-room-start');
    if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';

    // Ready button text
    const readyBtn = document.getElementById('btn-room-ready');
    if (readyBtn) {
      if (isHost) {
        readyBtn.style.display = 'none';
      } else {
        readyBtn.style.display = 'block';
        const amReady = mySlot && mySlot.isReady;
        readyBtn.textContent = amReady ? '✓ Ready (click to unready)' : 'Mark Ready';
        readyBtn.className = amReady ? 'btn btn-secondary' : 'btn btn-primary';
      }
    }

    // All ready check for start button
    if (startBtn) {
      const allReady = currentRoom.players.length >= 2 && currentRoom.players.every(p => p.isReady);
      startBtn.disabled = !allReady;
    }
  }

  // ---- Room actions ----
  function createRoom(name, maxPlayers, isPublic, rules) {
    if (!socket) return;
    socket.emit('room:create', { name, maxPlayers: parseInt(maxPlayers) || 4, isPublic: isPublic !== false, rules: rules || {} });
  }

  function joinRoom(code) {
    if (!socket) return;
    socket.emit('room:join', { code: code.toUpperCase() });
  }

  function leaveRoom() {
    if (!socket) return;
    socket.emit('room:leave');
    currentRoom = null;
    myPlayerIdx = null;
    showLobbyScreen();
    socket.emit('room:list');
  }

  function toggleReady() {
    if (!socket || !currentRoom) return;
    const mySlot = currentRoom.players.find(p => p.playerIdx === myPlayerIdx);
    const amReady = mySlot && mySlot.isReady;
    socket.emit('room:ready', { ready: !amReady });
  }

  function startRoom() {
    if (!socket) return;
    socket.emit('room:start');
  }

  function refreshRoomList() {
    if (!socket) return;
    socket.emit('room:list');
  }

  function sendChat(text) {
    if (!socket || !text.trim()) return;
    socket.emit('game:chat', { text: text.trim() });
  }

  // ---- Online game flow ----
  function _startOnlineGame() {
    if (!currentRoom) return;

    // Build player configs from room players
    const configs = currentRoom.players.map((p, i) => ({
      name: p.username,
      isAI: false,  // all human slots (AI not supported in online mode)
    }));

    // Switch to game screen
    _hideAllScreens();
    document.getElementById('screen-game').classList.add('active');

    // Show online indicator
    _updateAuthUI();
    document.getElementById('online-indicator').style.display = 'flex';

    // Show chat UI
    const chatToggle = document.getElementById('chat-toggle-btn');
    if (chatToggle) chatToggle.style.display = 'flex';

    // Init game with all-human players and house rules
    const rules = (currentRoom && currentRoom._startRules) || (currentRoom && currentRoom.rules) || {};
    if (game) {
      game.initGame(configs, rules);
      if (ui) ui.refresh();
    }

    _updateWaitingOverlay();
    _resetTurnTimer();
  }

  // ---- Spectator ----
  function spectateRoom(code) {
    if (!socket) return;
    socket.emit('room:spectate', { code: code.toUpperCase() });
  }

  function rematchRoom() {
    if (!socket) return;
    socket.emit('room:rematch');
  }

  socket && socket.on && (() => {})(); // placeholder — spectate join handled in _connectSocket

  // ---- Profile ----
  async function showProfile() {
    const backdrop = document.getElementById('backdrop-profile');
    const body = document.getElementById('profile-modal-body');
    if (!backdrop || !body) return;
    backdrop.classList.add('active');
    body.innerHTML = '<p style="color:var(--text-dim)">Loading...</p>';

    try {
      const r = await fetch('/api/profile', {
        headers: auth.token ? { Authorization: 'Bearer ' + auth.token } : {},
      });
      const data = await r.json();
      if (!r.ok) { body.innerHTML = `<p style="color:var(--danger)">${_esc(data.error || 'Error')}</p>`; return; }
      const winRate = data.games_played > 0 ? Math.round(data.games_won / data.games_played * 100) : 0;
      body.innerHTML = `
        <div class="profile-avatar">${_esc(data.username).slice(0, 1).toUpperCase()}</div>
        <div class="profile-username">${_esc(data.username)}</div>
        <div class="profile-stats-grid">
          <div class="profile-stat"><span class="profile-stat-val">${data.games_played}</span><span class="profile-stat-label">Games Played</span></div>
          <div class="profile-stat"><span class="profile-stat-val" style="color:#ffd700">${data.games_won}</span><span class="profile-stat-label">Wins</span></div>
          <div class="profile-stat"><span class="profile-stat-val" style="color:#00ffcc">${winRate}%</span><span class="profile-stat-label">Win Rate</span></div>
        </div>
        ${data.games_played > 0 ? `<div class="profile-bar-wrap"><div class="profile-bar-fill" style="width:${winRate}%"></div></div>` : ''}
      `;
    } catch {
      body.innerHTML = '<p style="color:var(--danger)">Could not load profile.</p>';
    }
  }

  // Called by game.js after every state change
  function syncState(state) {
    if (!inOnlineGame || !socket || !socket.connected) return;
    // Only send if it's our turn
    if (state.currentPlayerIdx !== myPlayerIdx) return;
    socket.emit('game:state-update', { state });
  }

  // Is it currently our turn?
  function isMyTurn() {
    if (!inOnlineGame) return true; // local game: always "your" turn
    if (isSpectator) return false;
    return myPlayerIdx === null || (game && game.currentPlayerIdx === myPlayerIdx);
  }

  function _updateWaitingOverlay() {
    if (!inOnlineGame || !game) return;
    const isMyT = isMyTurn();
    _setWaitingOverlay(!isMyT);
  }

  function _setWaitingOverlay(show) {
    let overlay = document.getElementById('waiting-overlay');
    if (!overlay) return;
    if (show && game) {
      const cp = game.players[game.currentPlayerIdx];
      const name = cp ? cp.name : '...';
      overlay.querySelector('.waiting-text').textContent = `Waiting for ${name}...`;
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }

  function endOnlineGame() {
    inOnlineGame = false;
    isSpectator = false;
    myPlayerIdx = null;
    currentRoom = null;
    _clearTurnTimer();
    _setWaitingOverlay(false);
    const chatToggle = document.getElementById('chat-toggle-btn');
    if (chatToggle) chatToggle.style.display = 'none';
  }

  // ---- Turn Timer ----
  function _resetTurnTimer() {
    _clearTurnTimer();
    if (!inOnlineGame || isSpectator) return;
    const timerEl = document.getElementById('turn-timer');
    const timerVal = document.getElementById('turn-timer-seconds');
    if (!timerEl) return;

    _turnTimerSeconds = TURN_TIME_LIMIT;
    timerEl.style.display = 'flex';
    _updateTimerDisplay();

    _turnTimerInterval = setInterval(() => {
      _turnTimerSeconds--;
      _updateTimerDisplay();
      if (_turnTimerSeconds <= 0) {
        _clearTurnTimer();
        // Auto-act if it's our turn
        if (isMyTurn() && game) {
          const g = game;
          if (g.state === 'roll_dice') g.rollDice();
          else if (g.state === 'player_actions') g.endTurn();
        }
      }
    }, 1000);
  }

  function _clearTurnTimer() {
    if (_turnTimerInterval) { clearInterval(_turnTimerInterval); _turnTimerInterval = null; }
    const timerEl = document.getElementById('turn-timer');
    if (timerEl) timerEl.style.display = 'none';
  }

  function _updateTimerDisplay() {
    const timerVal = document.getElementById('turn-timer-seconds');
    if (!timerVal) return;
    timerVal.textContent = _turnTimerSeconds;
    const timerEl = document.getElementById('turn-timer');
    if (timerEl) {
      timerEl.classList.toggle('timer-warning', _turnTimerSeconds <= 20);
      timerEl.classList.toggle('timer-critical', _turnTimerSeconds <= 10);
    }
  }

  // ---- Chat ----
  function _appendChatMessage(username, text, timestamp) {
    const chatLog = document.getElementById('in-game-chat-log');
    if (!chatLog) return;

    const entry = document.createElement('div');
    entry.className = 'chat-entry';
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    entry.innerHTML = `<span class="chat-user">${_esc(username)}</span><span class="chat-time">${time}</span><div class="chat-text">${_esc(text)}</div>`;
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;

    // Badge on chat button if closed
    const badge = document.getElementById('chat-badge');
    if (badge && !chatOpen) {
      badge.style.display = 'flex';
      badge.textContent = (parseInt(badge.textContent) || 0) + 1;
    }
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    const panel = document.getElementById('in-game-chat-panel');
    if (panel) panel.classList.toggle('open', chatOpen);
    const badge = document.getElementById('chat-badge');
    if (badge && chatOpen) { badge.style.display = 'none'; badge.textContent = '0'; }
  }

  // ---- Helpers ----
  function _playerColor(idx) {
    const colors = ['#00FFCC', '#FF4488', '#FFD700', '#FF8800'];
    return colors[idx] || '#fff';
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _showError(msg) {
    let errEl = document.getElementById('netplay-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.id = 'netplay-error';
      errEl.className = 'netplay-error-toast';
      document.body.appendChild(errEl);
    }
    errEl.textContent = msg;
    errEl.classList.add('active');
    clearTimeout(errEl._t);
    errEl._t = setTimeout(() => errEl.classList.remove('active'), 4000);
  }

  function _log(msg) {
    // console.log('[netplay]', msg);
  }

  // ---- Bind UI after DOM ready ----
  function bindUI() {
    // Auth screen: tab switching
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        const target = document.getElementById('auth-form-' + btn.dataset.tab);
        if (target) target.classList.add('active');
        const errEl = document.getElementById('netplay-error');
        if (errEl) errEl.classList.remove('active');
      });
    });

    // Register form
    const regForm = document.getElementById('auth-form-register');
    if (regForm) {
      regForm.addEventListener('submit', e => {
        e.preventDefault();
        const user = document.getElementById('reg-username').value.trim();
        const pass = document.getElementById('reg-password').value;
        if (user && pass) register(user, pass);
      });
    }

    // Login form
    const loginForm = document.getElementById('auth-form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const user = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value;
        if (user && pass) login(user, pass);
      });
    }

    // Guest button
    const guestBtn = document.getElementById('btn-play-guest');
    if (guestBtn) guestBtn.addEventListener('click', () => loginAsGuest());

    // Lobby screen
    const backToLocal = document.getElementById('btn-back-to-local');
    if (backToLocal) backToLocal.addEventListener('click', () => {
      _hideAllScreens();
      document.getElementById('screen-lobby').classList.add('active');
    });

    const refreshBtn = document.getElementById('btn-refresh-rooms');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { socket && socket.emit('room:list'); });

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => logout());

    const joinCodeBtn = document.getElementById('btn-join-code');
    if (joinCodeBtn) joinCodeBtn.addEventListener('click', () => {
      const code = (document.getElementById('join-code-input').value || '').trim().toUpperCase();
      if (code) joinRoom(code);
    });

    // Join code on Enter
    const codeInput = document.getElementById('join-code-input');
    if (codeInput) codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinCodeBtn && joinCodeBtn.click(); });

    const createRoomForm = document.getElementById('create-room-form');
    if (createRoomForm) {
      createRoomForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('new-room-name').value.trim() || (auth.username + "'s Room");
        const maxP = document.getElementById('new-room-max').value;
        const isPublic = document.getElementById('new-room-public').checked;
        const rules = {
          startingMoney: parseInt(document.getElementById('new-room-start-money')?.value || 1500),
          goSalary: parseInt(document.getElementById('new-room-go-salary')?.value || 200),
          jailFine: parseInt(document.getElementById('new-room-jail-fine')?.value || 50),
          freeParkingJackpot: document.getElementById('new-room-fp')?.checked ?? true,
          doubleSalaryOnGO: document.getElementById('new-room-double-go')?.checked ?? false,
          noRentInJail: document.getElementById('new-room-no-jail-rent')?.checked ?? false,
          auctionsEnabled: document.getElementById('new-room-auctions')?.checked ?? true,
          evenBuildRule: document.getElementById('new-room-even-build')?.checked ?? true,
        };
        createRoom(name, maxP, isPublic, rules);
      });
    }

    // Sound toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        if (typeof Sounds !== 'undefined') {
          const on = Sounds.toggle();
          soundBtn.textContent = on ? '🔊' : '🔇';
        }
      });
    }

    // Room screen
    const leaveBtn = document.getElementById('btn-room-leave');
    if (leaveBtn) leaveBtn.addEventListener('click', () => leaveRoom());

    const readyBtn = document.getElementById('btn-room-ready');
    if (readyBtn) readyBtn.addEventListener('click', () => toggleReady());

    const startBtn = document.getElementById('btn-room-start');
    if (startBtn) startBtn.addEventListener('click', () => startRoom());

    // Chat in room screen
    const roomChatForm = document.getElementById('room-chat-form');
    if (roomChatForm) {
      roomChatForm.addEventListener('submit', e => {
        e.preventDefault();
        const inp = document.getElementById('room-chat-input');
        if (inp) { sendChat(inp.value); inp.value = ''; }
      });
    }

    // In-game chat
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    if (chatToggleBtn) chatToggleBtn.addEventListener('click', () => toggleChat());

    const gameChatForm = document.getElementById('in-game-chat-form');
    if (gameChatForm) {
      gameChatForm.addEventListener('submit', e => {
        e.preventDefault();
        const inp = document.getElementById('in-game-chat-input');
        if (inp) { sendChat(inp.value); inp.value = ''; }
      });
    }

    // Online game: "New Game" button returns to online lobby
    const newGameBtn = document.getElementById('btn-new-game');
    if (newGameBtn) {
      const original = newGameBtn.onclick;
      newGameBtn.addEventListener('click', () => {
        if (inOnlineGame) {
          endOnlineGame();
          showLobbyScreen();
          socket && socket.emit('room:list');
        }
      });
    }

    // Play Online button from local lobby
    const playOnlineBtn = document.getElementById('btn-play-online');
    if (playOnlineBtn) {
      playOnlineBtn.addEventListener('click', () => {
        if (!auth.loggedIn) {
          showAuthScreen();
        } else {
          showLobbyScreen();
        }
      });
    }

    // Profile button
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) profileBtn.addEventListener('click', () => showProfile());

    const profileClose = document.getElementById('btn-profile-close');
    if (profileClose) profileClose.addEventListener('click', () => {
      document.getElementById('backdrop-profile').classList.remove('active');
    });
  }

  // ---- Public API ----
  return {
    init,
    initAuth,
    showAuthScreen,
    showLobbyScreen,
    showRoomScreen,
    register,
    login,
    loginAsGuest,
    logout,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    startRoom,
    sendChat,
    toggleChat,
    syncState,
    isMyTurn,
    spectateRoom,
    rematchRoom,
    showProfile,
    get inOnlineGame() { return inOnlineGame; },
    get isSpectator() { return isSpectator; },
    get myPlayerIdx() { return myPlayerIdx; },
    get auth() { return auth; },
    bindUI,
  };
})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { netplay.init(); netplay.bindUI(); });
} else {
  netplay.init();
  netplay.bindUI();
}
