// User store for Capitalism.io
// Uses MongoDB Atlas when MONGODB_URI env var is set; falls back to JSON file for local dev.
'use strict';

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// ─── JSON file backend (local dev fallback) ───────────────────────────────────
const DB_PATH = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'users.json')
  : path.join(__dirname, '..', 'users.json');

function _load() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: [], nextId: 1 }; }
}
function _save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ─── MongoDB backend ──────────────────────────────────────────────────────────
const USE_MONGO = !!process.env.MONGODB_URI;
let UserModel = null;
let CounterModel = null;

if (USE_MONGO) {
  const mongoose = require('mongoose');

  const userSchema = new mongoose.Schema({
    userId:        { type: Number, unique: true },
    username:      { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    games_played:  { type: Number, default: 0 },
    games_won:     { type: Number, default: 0 },
    created_at:    { type: Number, default: () => Date.now() },
  });

  const counterSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 },
  });

  UserModel    = mongoose.models.User    || mongoose.model('User',    userSchema);
  CounterModel = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas connected.'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));
}

async function _nextId() {
  const counter = await CounterModel.findByIdAndUpdate(
    'userId',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

// ─── Public API (always async) ────────────────────────────────────────────────

async function createUser(username, plainPassword) {
  if (USE_MONGO) {
    const existing = await UserModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (existing) return { ok: false, error: 'Username already taken.' };
    const userId = await _nextId();
    const password_hash = bcrypt.hashSync(plainPassword, 10);
    await UserModel.create({ userId, username, password_hash });
    return { ok: true, id: userId, username };
  }

  // JSON fallback
  const data = _load();
  if (data.users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return { ok: false, error: 'Username already taken.' };
  const user = {
    id: data.nextId++, username,
    password_hash: bcrypt.hashSync(plainPassword, 10),
    games_played: 0, games_won: 0, created_at: Date.now(),
  };
  data.users.push(user);
  _save(data);
  return { ok: true, id: user.id, username: user.username };
}

async function verifyUser(username, plainPassword) {
  if (USE_MONGO) {
    const user = await UserModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return { ok: false, error: 'User not found.' };
    if (!bcrypt.compareSync(plainPassword, user.password_hash))
      return { ok: false, error: 'Incorrect password.' };
    return { ok: true, id: user.userId, username: user.username,
             games_played: user.games_played, games_won: user.games_won };
  }

  // JSON fallback
  const data = _load();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, error: 'User not found.' };
  if (!bcrypt.compareSync(plainPassword, user.password_hash))
    return { ok: false, error: 'Incorrect password.' };
  return { ok: true, id: user.id, username: user.username,
           games_played: user.games_played, games_won: user.games_won };
}

async function recordGameResult(userId, won) {
  if (USE_MONGO) {
    await UserModel.updateOne(
      { userId },
      { $inc: { games_played: 1, ...(won ? { games_won: 1 } : {}) } }
    );
    return;
  }

  // JSON fallback
  const data = _load();
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  user.games_played++;
  if (won) user.games_won++;
  _save(data);
}

async function getUserProfile(userId) {
  if (USE_MONGO) {
    const user = await UserModel.findOne({ userId });
    if (!user) return null;
    return { username: user.username, games_played: user.games_played,
             games_won: user.games_won, created_at: user.created_at };
  }

  // JSON fallback
  const data = _load();
  const user = data.users.find(u => u.id === userId);
  if (!user) return null;
  return { username: user.username, games_played: user.games_played,
           games_won: user.games_won, created_at: user.created_at };
}

module.exports = { createUser, verifyUser, recordGameResult, getUserProfile };
