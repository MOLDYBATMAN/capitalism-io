// Socket.io event handlers for Capitalism.io multiplayer
'use strict';

const jwt = require('jsonwebtoken');
const { recordGameResult } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'capitalism-io-secret-2026';

// In-memory room store: code -> room object
const rooms = {};
// In-memory spectator store: socketId -> roomCode
const spectators = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

function generateGuestName() {
  return 'Guest-' + String(Math.floor(10000 + Math.random() * 90000));
}

// Decode JWT or treat as guest
function resolveIdentity(token) {
  if (!token) return { username: generateGuestName(), isGuest: true, userId: null };
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { username: payload.username, isGuest: false, userId: payload.id };
  } catch {
    return { username: generateGuestName(), isGuest: true, userId: null };
  }
}

// Strip out socket-level internals before sending room to clients
function sanitizeRoom(room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    maxPlayers: room.maxPlayers,
    isPublic: room.isPublic,
    status: room.status,
    rules: room.rules || {},
    players: room.players.map(p => ({
      username: p.username,
      isGuest: p.isGuest,
      isReady: p.isReady,
      playerIdx: p.playerIdx,
      disconnected: p.disconnected || false,
    })),
    currentPlayerIdx: room.currentPlayerIdx,
    createdAt: room.createdAt,
  };
}

function getPublicRooms() {
  return Object.values(rooms)
    .filter(r => r.isPublic && r.status === 'waiting' && r.players.length < r.maxPlayers)
    .map(sanitizeRoom);
}

// Find which room a socket is in
function findRoomBySocket(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId)) || null;
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Resolve identity from handshake auth token
    const identity = resolveIdentity(socket.handshake.auth && socket.handshake.auth.token);
    socket.data.username = identity.username;
    socket.data.isGuest = identity.isGuest;
    socket.data.userId = identity.userId;

    // ---- room:create ----
    socket.on('room:create', ({ name, maxPlayers, isPublic, rules } = {}) => {
      const existingRoom = findRoomBySocket(socket.id);
      if (existingRoom) {
        socket.emit('room:error', { message: 'You are already in a room. Leave first.' });
        return;
      }

      const code = generateCode();
      const room = {
        id: code,
        code,
        name: (name || `${socket.data.username}'s Room`).slice(0, 40),
        host: socket.id,
        maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 4),
        isPublic: isPublic !== false,
        status: 'waiting',
        players: [],
        currentPlayerIdx: 0,
        createdAt: Date.now(),
        rules: rules || {},
      };
      rooms[code] = room;

      _addPlayerToRoom(room, socket, 0);
      socket.join(code);

      socket.emit('room:joined', { room: sanitizeRoom(room), myPlayerIdx: 0 });
      io.to(code).emit('room:update', { room: sanitizeRoom(room) });
    });

    // ---- room:join ----
    socket.on('room:join', ({ code } = {}) => {
      if (!code) { socket.emit('room:error', { message: 'Room code required.' }); return; }
      const room = rooms[code.toUpperCase()];
      if (!room) { socket.emit('room:error', { message: 'Room not found.' }); return; }
      if (room.status !== 'waiting') { socket.emit('room:error', { message: 'Game already in progress.' }); return; }

      // Check if this socket is reconnecting as a disconnected player
      const disconnectedSlot = room.players.find(p => p.disconnected && p.username === socket.data.username);
      if (disconnectedSlot) {
        // Reconnect
        clearTimeout(disconnectedSlot._reconnectTimer);
        disconnectedSlot.socketId = socket.id;
        disconnectedSlot.disconnected = false;
        socket.join(code);
        socket.emit('room:joined', { room: sanitizeRoom(room), myPlayerIdx: disconnectedSlot.playerIdx });
        io.to(code).emit('room:update', { room: sanitizeRoom(room) });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('room:error', { message: 'Room is full.' });
        return;
      }

      const existingRoom = findRoomBySocket(socket.id);
      if (existingRoom) {
        socket.emit('room:error', { message: 'You are already in a room.' });
        return;
      }

      const playerIdx = room.players.length;
      _addPlayerToRoom(room, socket, playerIdx);
      socket.join(code);

      socket.emit('room:joined', { room: sanitizeRoom(room), myPlayerIdx: playerIdx });
      io.to(code).emit('room:update', { room: sanitizeRoom(room) });
    });

    // ---- room:leave ----
    socket.on('room:leave', () => {
      _handleLeave(socket, io);
    });

    // ---- room:list ----
    socket.on('room:list', () => {
      socket.emit('room:list', { rooms: getPublicRooms() });
    });

    // ---- room:spectate ----
    socket.on('room:spectate', ({ code } = {}) => {
      if (!code) { socket.emit('room:error', { message: 'Room code required.' }); return; }
      const room = rooms[code.toUpperCase()];
      if (!room) { socket.emit('room:error', { message: 'Room not found.' }); return; }
      if (room.status !== 'playing') { socket.emit('room:error', { message: 'Game has not started yet.' }); return; }
      spectators[socket.id] = room.code;
      socket.join(room.code);
      socket.emit('spectate:joined', {
        room: sanitizeRoom(room),
        state: room._lastState || null,
      });
    });

    // ---- room:ready ----
    socket.on('room:ready', ({ ready } = {}) => {
      const room = findRoomBySocket(socket.id);
      if (!room) { socket.emit('room:error', { message: 'Not in a room.' }); return; }
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      // Host is always ready
      if (player.socketId === room.host) {
        player.isReady = true;
      } else {
        player.isReady = ready !== false;
      }

      io.to(room.code).emit('room:update', { room: sanitizeRoom(room) });
    });

    // ---- room:start ----
    socket.on('room:start', () => {
      const room = findRoomBySocket(socket.id);
      if (!room) { socket.emit('room:error', { message: 'Not in a room.' }); return; }
      if (room.host !== socket.id) { socket.emit('room:error', { message: 'Only the host can start the game.' }); return; }
      if (room.players.length < 2) { socket.emit('room:error', { message: 'Need at least 2 players to start.' }); return; }
      if (!room.players.every(p => p.isReady)) { socket.emit('room:error', { message: 'All players must be ready.' }); return; }

      room.status = 'playing';
      room.currentPlayerIdx = 0;

      // Send each player their index and room rules
      room.players.forEach(p => {
        io.to(p.socketId).emit('game:started', { myPlayerIdx: p.playerIdx, rules: room.rules || {} });
      });

      io.to(room.code).emit('room:update', { room: sanitizeRoom(room) });
    });

    // ---- game:state-update ----
    socket.on('game:state-update', ({ state } = {}) => {
      const room = findRoomBySocket(socket.id);
      if (!room || room.status !== 'playing') return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      // Validate it's this player's turn
      if (player.playerIdx !== room.currentPlayerIdx) {
        socket.emit('room:error', { message: 'Not your turn.' });
        return;
      }

      // Update server-side current player from the incoming state
      if (state && typeof state.currentPlayerIdx === 'number') {
        room.currentPlayerIdx = state.currentPlayerIdx;
      }

      // Check for game over and record stats
      if (state && state.winner !== null && state.winner !== undefined) {
        room.status = 'finished';
        room.players.forEach((p, idx) => {
          if (p.userId) {
            const won = state.winner && state.winner.id === p.playerIdx;
            recordGameResult(p.userId, won);
          }
        });
      }

      // Cache latest state so spectators can catch up
      room._lastState = state;

      // Broadcast state to all OTHER players in room
      socket.to(room.code).emit('game:state', { state });
    });

    // ---- game:chat ----
    socket.on('game:chat', ({ text } = {}) => {
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const safeText = String(text || '').slice(0, 200).trim();
      if (!safeText) return;

      io.to(room.code).emit('chat:message', {
        username: player.username,
        text: safeText,
        timestamp: Date.now(),
      });
    });

    // ---- disconnect ----
    socket.on('disconnect', () => {
      // Clean up spectator
      if (spectators[socket.id]) {
        delete spectators[socket.id];
        return;
      }

      const room = findRoomBySocket(socket.id);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      if (room.status === 'waiting') {
        // In lobby: remove player immediately
        _removePlayerFromRoom(room, socket.id, io);
      } else {
        // In game: mark disconnected, give 60s to reconnect
        player.disconnected = true;
        io.to(room.code).emit('room:update', { room: sanitizeRoom(room) });

        player._reconnectTimer = setTimeout(() => {
          _removePlayerFromRoom(room, socket.id, io);
        }, 60000);
      }
    });
  });
}

function _addPlayerToRoom(room, socket, playerIdx) {
  // Host is auto-ready
  const isHost = room.players.length === 0;
  room.players.push({
    socketId: socket.id,
    username: socket.data.username,
    isGuest: socket.data.isGuest,
    userId: socket.data.userId,
    isReady: isHost,
    playerIdx,
    disconnected: false,
    _reconnectTimer: null,
  });
}

function _removePlayerFromRoom(room, socketId, io) {
  const idx = room.players.findIndex(p => p.socketId === socketId);
  if (idx === -1) return;

  const wasPlaying = room.status === 'playing';
  const originalPlayerIdx = room.players[idx].playerIdx;
  const wasHost = room.players[idx].socketId === room.host;

  // Notify remaining players to assign AI for this slot (in-game only)
  if (wasPlaying) {
    io.to(room.code).emit('game:player-ai', { playerIdx: originalPlayerIdx });
  }

  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    delete rooms[room.code];
    return;
  }

  if (wasHost && room.status === 'waiting') {
    room.host = room.players[0].socketId;
    room.players[0].isReady = true;
  }

  // Re-index player indices
  room.players.forEach((p, i) => { p.playerIdx = i; });

  io.to(room.code).emit('room:update', { room: sanitizeRoom(room) });
}

function _handleLeave(socket, io) {
  const room = findRoomBySocket(socket.id);
  if (!room) return;
  _removePlayerFromRoom(room, socket.id, io);
  socket.leave(room.code);
}

module.exports = { setupSocketHandlers };
