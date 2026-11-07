const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Vercel Serverless 環境下僅 /tmp 可寫入
const isVercel = process.env.VERCEL === '1';
const dbDir = isVercel ? '/tmp' : path.resolve(__dirname, '../data');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'meeting_system.db');

// 若是在 Vercel 環境且 /tmp 尚無 db，嘗試複製原始示範 db
if (isVercel && !fs.existsSync(dbPath)) {
  const localDb = path.resolve(__dirname, '../data/meeting_system.db');
  if (fs.existsSync(localDb)) {
    try { fs.copyFileSync(localDb, dbPath); } catch (e) {}
  }
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 會議資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      location TEXT,
      chairperson TEXT,
      description TEXT,
      seat_layout TEXT DEFAULT 'rectangle',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 出席者資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      department TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      role TEXT DEFAULT '部會代表',
      phone TEXT,
      email TEXT,
      seat_number TEXT,
      fee_review REAL DEFAULT 0,
      fee_traffic REAL DEFAULT 0,
      fee_meal REAL DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    )
  `);

  // 費用項目與預設計算規則
  db.run(`
    CREATE TABLE IF NOT EXISTS fee_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      default_amount REAL DEFAULT 0,
      description TEXT
    )
  `);

  // 系統與 Google 整合設定
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // 預設費用規則 (若不存在)
  const defaultRules = [
    { code: '51330909', name: '審查費', category: 'review', default_amount: 2500, description: '出席專家審查費（每場次標準定額）' },
    { code: '51330906', name: '專家旅費', category: 'traffic', default_amount: 1500, description: '外縣市交通高鐵/台鐵/自用車實報實銷' },
    { code: '51330604', name: '會議費用', category: 'meal', default_amount: 120, description: '會議便當或餐點茶水' }
  ];

  defaultRules.forEach(rule => {
    db.run(
      `INSERT OR IGNORE INTO fee_rules (code, name, category, default_amount, description) VALUES (?, ?, ?, ?, ?)`,
      [rule.code, rule.name, rule.category, rule.default_amount, rule.description]
    );
  });

  // 預設密碼與設定
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_calendar_id', '')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_id', '')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_name', '晶創計畫出席名單回收區')`);

  // 檢查是否有會議
  db.get(`SELECT COUNT(*) as count FROM meetings`, (err, row) => {
    if (!err && row.count === 0) {
      db.run(
        `INSERT INTO meetings (name, date, time, location, chairperson, description, seat_layout) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          '晶創計畫第一季推動與部會協調審查會議',
          '2026-11-06',
          '14:00 - 16:30',
          '行政院科技會報第 201 會議室',
          '李政務委員',
          '討論各部會推動 IC 設計與應用創新計畫進度回顧與經費審查。',
          'u_shape'
        ],
        function(insertErr) {
          if (!insertErr) {
            const meetingId = this.lastID;
            const demoAttendees = [
              { dept: '國家科學及技術委員會', name: '張國榮', title: '特聘研究員兼審查委員', role: '審查專家', seat: '1', fee_rev: 2500, fee_traf: 1500, fee_meal: 120, note: '搭乘高鐵台北-新竹來回' },
              { dept: '數位發展部', name: '林立文', title: '司長', role: '部會代表', seat: '2', fee_rev: 0, fee_traf: 0, fee_meal: 120, note: '' },
              { dept: '經濟部產業技術司', name: '陳建銘', title: '副司長', role: '部會代表', seat: '3', fee_rev: 0, fee_traf: 0, fee_meal: 120, note: '' },
              { dept: '國立清華大學電機系', name: '王敏慧', title: '講座教授', role: '審查專家', seat: '4', fee_rev: 2500, fee_traf: 1500, fee_meal: 120, note: '專家出席審查' },
              { dept: '國科會工程技術研究發展處', name: '黃怡君', title: '研究員兼召集人', role: '審查專家', seat: '5', fee_rev: 2500, fee_traf: 0, fee_meal: 120, note: '市區出席' },
              { dept: '數位發展部數位產業署', name: '周志偉', title: '組長', role: '部會代表', seat: '6', fee_rev: 0, fee_traf: 0, fee_meal: 120, note: '' }
            ];

            demoAttendees.forEach(att => {
              db.run(
                `INSERT INTO attendees (meeting_id, department, name, title, role, seat_number, fee_review, fee_traffic, fee_meal, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [meetingId, att.dept, att.name, att.title, att.role, att.seat, att.fee_rev, att.fee_traf, att.fee_meal, att.note]
              );
            });
          }
        }
      );
    }
  });
});

module.exports = db;
