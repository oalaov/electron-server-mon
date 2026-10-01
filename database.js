const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'monitoring.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      cpu REAL,
      ram REAL,
      swap REAL,
      disk REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      level TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id)
    );
  `);

  console.log('БД инициализирована:', dbPath);
}


function addServer(server) {
  const stmt = db.prepare(`
    INSERT INTO servers (name, host, port, username, password)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    server.name,
    server.host,
    server.port || 22,
    server.username,
    server.password || null
  );
  return result.lastInsertRowid;
}

function getServers() {
  return db.prepare('SELECT * FROM servers ORDER BY created_at DESC').all();
}

function deleteServer(id) {
  return db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}


function saveMetric(serverId, metrics) {
  const stmt = db.prepare(`
    INSERT INTO metrics (server_id, cpu, ram, swap, disk)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(
    serverId,
    metrics.cpu || 0,
    metrics.ram?.percent || 0,
    metrics.swap?.percent || 0,
    metrics.disk?.percent || 0
  );
}

function getMetricsHistory(serverId, limit = 30) {
  return db.prepare(`
    SELECT * FROM metrics
    WHERE server_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(serverId, limit).reverse();  
}

function cleanOldMetrics() {
  db.exec(`
    DELETE FROM metrics
    WHERE id NOT IN (
      SELECT id FROM metrics
      ORDER BY timestamp DESC
      LIMIT 1000
    )
  `);
}


function addEvent(serverId, level, message) {
  const stmt = db.prepare(`
    INSERT INTO events (server_id, level, message)
    VALUES (?, ?, ?)
  `);
  return stmt.run(serverId, level, message);
}

function getEvents(limit = 50) {
  return db.prepare(`
    SELECT * FROM events
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit);
}

function closeDB() {
  db.close();
}

module.exports = {
  initDB,
  addServer,
  getServers,
  deleteServer,
  saveMetric,
  getMetricsHistory,
  cleanOldMetrics,
  addEvent,
  getEvents,
  closeDB
};