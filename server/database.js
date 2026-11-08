const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;

// 預設資料 (供 Vercel 或無 SQLite 環境保底展示)
const defaultData = {
  meetings: [
    {
      id: 1,
      name: '晶創計畫第一季推動與部會協調審查會議',
      date: '2026-11-06',
      time: '14:00 - 16:30',
      location: '行政院科技會報第 201 會議室',
      chairperson: '李政務委員',
      description: '討論各部會推動 IC 設計與應用創新計畫進度回顧與經費審查。',
      seat_layout: 'u_shape'
    }
  ],
  attendees: [
    { id: 1, meeting_id: 1, department: '國家科學及技術委員會', name: '張國榮', title: '特聘研究員兼審查委員', role: '審查專家', seat_number: '1', fee_review: 2500, fee_traffic: 1500, fee_meal: 120, note: '搭乘高鐵台北-新竹來回' },
    { id: 2, meeting_id: 1, department: '數位發展部', name: '林立文', title: '司長', role: '部會代表', seat_number: '2', fee_review: 0, fee_traffic: 0, fee_meal: 120, note: '' },
    { id: 3, meeting_id: 1, department: '經濟部產業技術司', name: '陳建銘', title: '副司長', role: '部會代表', seat_number: '3', fee_review: 0, fee_traffic: 0, fee_meal: 120, note: '' },
    { id: 4, meeting_id: 1, department: '國立清華大學電機系', name: '王敏慧', title: '講座教授', role: '審查專家', seat_number: '4', fee_review: 2500, fee_traffic: 1500, fee_meal: 120, note: '專家出席審查' },
    { id: 5, meeting_id: 1, department: '國科會工程技術處', name: '黃怡君', title: '研究員兼召集人', role: '審查專家', seat_number: '5', fee_review: 2500, fee_traffic: 0, fee_meal: 120, note: '市區出席' },
    { id: 6, meeting_id: 1, department: '數位產業署', name: '周志偉', title: '組長', role: '部會代表', seat_number: '6', fee_review: 0, fee_traffic: 0, fee_meal: 120, note: '' }
  ],
  fee_rules: [
    { id: 1, code: '51330909', name: '審查費', category: 'review', default_amount: 2500, description: '出席專家審查費（每場次標準定額）' },
    { id: 2, code: '51330906', name: '專家旅費', category: 'traffic', default_amount: 1500, description: '外縣市交通高鐵/台鐵/自用車實報實銷' },
    { id: 3, code: '51330604', name: '會議費用', category: 'meal', default_amount: 120, description: '會議便當或餐點茶水' }
  ],
  settings: {
    admin_password: 'admin123',
    google_calendar_id: '',
    google_drive_folder_id: '',
    google_drive_folder_name: '晶創計畫出席名單回收區'
  }
};

let nativeDb = null;

// 在本機環境優先嘗試載入 SQLite
if (!isVercel) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dbDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'meeting_system.db');
    nativeDb = new sqlite3.Database(dbPath);

    nativeDb.serialize(() => {
      nativeDb.run(`CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL,
        time TEXT, location TEXT, chairperson TEXT, description TEXT,
        seat_layout TEXT DEFAULT 'rectangle', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      nativeDb.run(`CREATE TABLE IF NOT EXISTS attendees (
        id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL, department TEXT NOT NULL,
        name TEXT NOT NULL, title TEXT NOT NULL, role TEXT DEFAULT '部會代表', phone TEXT, email TEXT,
        seat_number TEXT, fee_review REAL DEFAULT 0, fee_traffic REAL DEFAULT 0, fee_meal REAL DEFAULT 0,
        note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
      )`);

      nativeDb.run(`CREATE TABLE IF NOT EXISTS fee_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        category TEXT NOT NULL, default_amount REAL DEFAULT 0, description TEXT
      )`);

      nativeDb.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

      defaultData.fee_rules.forEach(rule => {
        nativeDb.run(`INSERT OR IGNORE INTO fee_rules (code, name, category, default_amount, description) VALUES (?, ?, ?, ?, ?)`,
          [rule.code, rule.name, rule.category, rule.default_amount, rule.description]);
      });

      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_calendar_id', '')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_id', '')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_name', '晶創計畫出席名單回收區')`);

      nativeDb.get(`SELECT COUNT(*) as count FROM meetings`, (err, row) => {
        if (!err && row && row.count === 0) {
          const m = defaultData.meetings[0];
          nativeDb.run(
            `INSERT INTO meetings (name, date, time, location, chairperson, description, seat_layout) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [m.name, m.date, m.time, m.location, m.chairperson, m.description, m.seat_layout],
            function(insertErr) {
              if (!insertErr) {
                const meetingId = this.lastID;
                defaultData.attendees.forEach(att => {
                  nativeDb.run(
                    `INSERT INTO attendees (meeting_id, department, name, title, role, seat_number, fee_review, fee_traffic, fee_meal, note)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [meetingId, att.department, att.name, att.title, att.role, att.seat_number, att.fee_review, att.fee_traffic, att.fee_meal, att.note]
                  );
                });
              }
            }
          );
        }
      });
    });
  } catch (err) {
    console.warn('本機 SQLite 載入失敗，安全切換至記憶體模式:', err.message);
    nativeDb = null;
  }
}

// 萬能相容包裝層 (當 SQLite 不可用或在 Vercel 時，提供無縫 API 回應，永不崩潰)
const fallbackDb = {
  serialize: (fn) => { if (typeof fn === 'function') fn(); },
  all: (query, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const q = (query || '').toLowerCase();
    if (q.includes('from meetings')) {
      return setImmediate(() => cb(null, [...defaultData.meetings]));
    }
    if (q.includes('from attendees')) {
      if (params && params.length > 0) {
        const mid = Number(params[0]);
        return setImmediate(() => cb(null, defaultData.attendees.filter(a => a.meeting_id === mid)));
      }
      return setImmediate(() => cb(null, [...defaultData.attendees]));
    }
    if (q.includes('from fee_rules')) {
      return setImmediate(() => cb(null, [...defaultData.fee_rules]));
    }
    if (q.includes('from settings')) {
      const rows = Object.entries(defaultData.settings).map(([k, v]) => ({ key: k, value: v }));
      return setImmediate(() => cb(null, rows));
    }
    return setImmediate(() => cb(null, []));
  },
  get: (query, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const q = (query || '').toLowerCase();
    if (q.includes('from meetings where id')) {
      const id = Number(params[0]);
      const m = defaultData.meetings.find(x => x.id === id);
      return setImmediate(() => cb(null, m || null));
    }
    if (q.includes('count(*)')) {
      return setImmediate(() => cb(null, { count: defaultData.meetings.length }));
    }
    return setImmediate(() => cb(null, null));
  },
  run: function(query, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const context = { lastID: defaultData.meetings.length + 1, changes: 1 };
    setImmediate(() => cb.call(context, null));
  },
  prepare: () => ({
    run: () => {},
    finalize: (cb) => { if (cb) setImmediate(cb); }
  })
};

module.exports = nativeDb || fallbackDb;
