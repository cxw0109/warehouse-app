const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'warehouse.db');

// 确保 data 目录存在
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL 模式，提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表结构
db.exec(`
  -- 工装档案
  CREATE TABLE IF NOT EXISTS tool_archive (
    qr_id       TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    spec        TEXT DEFAULT '',
    responsible_person TEXT DEFAULT '',
    image_url   TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 库位表
  CREATE TABLE IF NOT EXISTS location_table (
    location_code    TEXT PRIMARY KEY,
    occupied_tool_id TEXT DEFAULT NULL,
    status           TEXT DEFAULT 'vacant' CHECK(status IN ('occupied', 'vacant')),
    zone             TEXT GENERATED ALWAYS AS (substr(location_code, 1, 1)) STORED,
    created_at       TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (occupied_tool_id) REFERENCES tool_archive(qr_id)
  );

  -- 流水表
  CREATE TABLE IF NOT EXISTS transaction_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_id         TEXT NOT NULL,
    action        TEXT NOT NULL CHECK(action IN ('in', 'out')),
    location_code TEXT NOT NULL,
    operator_id   TEXT NOT NULL,
    operator_name TEXT DEFAULT '',
    timestamp     TEXT DEFAULT (datetime('now', 'localtime')),
    note          TEXT DEFAULT ''
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_location_occupied ON location_table(occupied_tool_id);
  CREATE INDEX IF NOT EXISTS idx_transaction_qr ON transaction_log(qr_id);
  CREATE INDEX IF NOT EXISTS idx_transaction_time ON transaction_log(timestamp);
`);

module.exports = db;
