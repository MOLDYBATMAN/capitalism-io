// Pure-JS user store for Capitalism.io — JSON file, no native compilation needed
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

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

function createUser(username, plainPassword) {
  const data = _load();
  if (data.users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return { ok: false, error: 'Username already taken.' };
  const user = { id: data.nextId++, username, password_hash: bcrypt.hashSync(plainPassword, 10), games_played: 0, games_won: 0, created_at: Date.now() };
  data.users.push(user);
  _save(data);
  return { ok: true, id: user.id, username: user.username };
}

function verifyUser(username, plainPassword) {
  const data = _load();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { ok: false, error: 'User not found.' };
  if (!bcrypt.compareSync(plainPassword, user.password_hash)) return { ok: false, error: 'Incorrect password.' };
  return { ok: true, id: user.id, username: user.username, games_played: user.games_played, games_won: user.games_won };
}

function recordGameResult(userId, won) {
  const data = _load();
  const user = data.users.find(u => u.id === userId);
  if (!user) return;
  user.games_played++;
  if (won) user.games_won++;
  _save(data);
}

function getUserProfile(userId) {
  const data = _load();
  const user = data.users.find(u => u.id === userId);
  if (!user) return null;
  return { username: user.username, games_played: user.games_played, games_won: user.games_won, created_at: user.created_at };
}

module.exports = { createUser, verifyUser, recordGameResult, getUserProfile };
