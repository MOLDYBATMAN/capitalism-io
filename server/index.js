// Capitalism.io — Node.js multiplayer server
'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createUser, verifyUser, getUserProfile } = require('./db');
const { setupSocketHandlers } = require('./socketHandler');

const PORT = process.env.PORT || 3737;
const JWT_SECRET = process.env.JWT_SECRET || 'capitalism-io-secret-2026';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

app.use(express.json());

// Serve static files from project root
app.use(express.static(path.join(__dirname, '..')));

// ---- REST: Register ----
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || typeof username !== 'string' || username.trim().length < 2)
      return res.status(400).json({ error: 'Username must be at least 2 characters.' });
    if (!password || typeof password !== 'string' || password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });

    const cleanName = username.trim().slice(0, 24);
    if (/^guest-/i.test(cleanName))
      return res.status(400).json({ error: 'Username cannot start with "Guest-".' });

    const result = await createUser(cleanName, password);
    if (!result.ok) return res.status(409).json({ error: result.error });

    const token = jwt.sign({ id: result.id, username: result.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: result.username });
  } catch (e) {
    console.error('/api/register error:', e);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ---- REST: Login ----
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required.' });

    const result = await verifyUser(username.trim(), password);
    if (!result.ok) return res.status(401).json({ error: result.error });

    const token = jwt.sign({ id: result.id, username: result.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: result.username,
               games_played: result.games_played, games_won: result.games_won });
  } catch (e) {
    console.error('/api/login error:', e);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ---- REST: Validate token ----
app.get('/api/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ id: payload.id, username: payload.username });
  } catch {
    res.status(401).json({ error: 'Invalid token.' });
  }
});

// ---- REST: Profile ----
app.get('/api/profile', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const profile = await getUserProfile(payload.id);
    if (!profile) return res.status(404).json({ error: 'User not found.' });
    res.json(profile);
  } catch (e) {
    if (e.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token.' });
    console.error('/api/profile error:', e);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ---- Socket.io ----
setupSocketHandlers(io);

// ---- Start ----
httpServer.listen(PORT, () => {
  console.log(`Capitalism.io server running at http://localhost:${PORT}`);
});
