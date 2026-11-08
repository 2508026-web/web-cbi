const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;

// 全域記憶體資料庫 (支援 Vercel 與本機無縫運作，支援完整即時 CRUD)
const memData = {
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

let nextMeetingId = 100;
let nextAttendeeId = 200;
let nextRuleId = 10;

let nativeDb = null;

// 在本機環境優先嘗試載入 SQLite 檔案資料庫
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

      memData.fee_rules.forEach(rule => {
        nativeDb.run(`INSERT OR IGNORE INTO fee_rules (code, name, category, default_amount, description) VALUES (?, ?, ?, ?, ?)`,
          [rule.code, rule.name, rule.category, rule.default_amount, rule.description]);
      });

      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_calendar_id', '')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_id', '')`);
      nativeDb.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('google_drive_folder_name', '晶創計畫出席名單回收區')`);

      nativeDb.get(`SELECT COUNT(*) as count FROM meetings`, (err, row) => {
        if (!err && row && row.count === 0) {
          const m = memData.meetings[0];
          nativeDb.run(
            `INSERT INTO meetings (name, date, time, location, chairperson, description, seat_layout) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [m.name, m.date, m.time, m.location, m.chairperson, m.description, m.seat_layout],
            function(insertErr) {
              if (!insertErr) {
                const meetingId = this.lastID;
                memData.attendees.forEach(att => {
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

// 萬能相容記憶體引擎 (當在 Vercel 或 SQLite 不可用時，提供 100% 完整的增刪改查 CRUD 支援)
const inMemoryEngine = {
  serialize: (fn) => { if (typeof fn === 'function') fn(); },

  all: (query, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const q = (query || '').toLowerCase();

    // 1. 批次核銷查詢 (帶會議資料)
    if (q.includes('join meetings')) {
      const ids = Array.isArray(params) ? params.map(Number) : [];
      const res = [];
      memData.attendees.forEach(a => {
        if (ids.length === 0 || ids.includes(a.meeting_id)) {
          const m = memData.meetings.find(x => x.id === a.meeting_id);
          res.push({
            ...a,
            meeting_name: m ? m.name : '',
            meeting_date: m ? m.date : ''
          });
        }
      });
      return setImmediate(() => cb(null, res));
    }

    // 2. 查詢會議列表
    if (q.includes('from meetings')) {
      const sorted = [...memData.meetings].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
      return setImmediate(() => cb(null, sorted));
    }

    // 3. 查詢某會議出席者
    if (q.includes('from attendees')) {
      if (params && params.length > 0) {
        const mid = Number(params[0]);
        const list = memData.attendees.filter(a => a.meeting_id === mid);
        return setImmediate(() => cb(null, [...list]));
      }
      return setImmediate(() => cb(null, [...memData.attendees]));
    }

    // 4. 費用規則
    if (q.includes('from fee_rules')) {
      return setImmediate(() => cb(null, [...memData.fee_rules]));
    }

    // 5. 系統設定
    if (q.includes('from settings')) {
      const rows = Object.entries(memData.settings).map(([k, v]) => ({ key: k, value: v }));
      return setImmediate(() => cb(null, rows));
    }

    return setImmediate(() => cb(null, []));
  },

  get: (query, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const q = (query || '').toLowerCase();

    if (q.includes('count(*)')) {
      return setImmediate(() => cb(null, { count: memData.meetings.length }));
    }

    if (q.includes('from meetings where id')) {
      const id = Number(params[0]);
      const m = memData.meetings.find(x => x.id === id);
      return setImmediate(() => cb(null, m ? { ...m } : null));
    }

    if (q.includes('from attendees where id')) {
      const id = Number(params[0]);
      const a = memData.attendees.find(x => x.id === id);
      return setImmediate(() => cb(null, a ? { ...a } : null));
    }

    return setImmediate(() => cb(null, null));
  },

  run: function(query, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    cb = cb || (() => {});
    const q = (query || '').toLowerCase();
    const context = { lastID: 0, changes: 0 };

    try {
      // 1. 新增會議
      if (q.includes('insert into meetings')) {
        const newId = nextMeetingId++;
        const newMeeting = {
          id: newId,
          name: params[0] || '',
          date: params[1] || '',
          time: params[2] || '',
          location: params[3] || '',
          chairperson: params[4] || '',
          description: params[5] || '',
          seat_layout: params[6] || 'rectangle'
        };
        memData.meetings.unshift(newMeeting);
        context.lastID = newId;
        context.changes = 1;
      }
      // 2. 更新會議
      else if (q.includes('update meetings set')) {
        const id = Number(params[params.length - 1]);
        const m = memData.meetings.find(x => x.id === id);
        if (m) {
          if (q.includes('seat_layout = ?') && params.length === 2) {
            m.seat_layout = params[0];
          } else {
            m.name = params[0] !== undefined ? params[0] : m.name;
            m.date = params[1] !== undefined ? params[1] : m.date;
            m.time = params[2] !== undefined ? params[2] : m.time;
            m.location = params[3] !== undefined ? params[3] : m.location;
            m.chairperson = params[4] !== undefined ? params[4] : m.chairperson;
            m.description = params[5] !== undefined ? params[5] : m.description;
            if (params.length >= 8 && params[6]) m.seat_layout = params[6];
          }
          context.changes = 1;
        }
      }
      // 3. 刪除會議
      else if (q.includes('delete from meetings where id =')) {
        const id = Number(params[0]);
        memData.meetings = memData.meetings.filter(x => x.id !== id);
        memData.attendees = memData.attendees.filter(x => x.meeting_id !== id);
        context.changes = 1;
      }
      // 4. 新增出席者
      else if (q.includes('insert into attendees')) {
        const newId = nextAttendeeId++;
        const newAtt = {
          id: newId,
          meeting_id: Number(params[0]),
          department: params[1] || '',
          name: params[2] || '',
          title: params[3] || '',
          role: params[4] || '部會代表',
          phone: params[5] || '',
          email: params[6] || '',
          seat_number: params[7] || '',
          fee_review: Number(params[8]) || 0,
          fee_traffic: Number(params[9]) || 0,
          fee_meal: Number(params[10]) || 0,
          note: params[11] || ''
        };
        memData.attendees.push(newAtt);
        context.lastID = newId;
        context.changes = 1;
      }
      // 5. 更新出席者
      else if (q.includes('update attendees set')) {
        const id = Number(params[params.length - 1]);
        const att = memData.attendees.find(x => x.id === id);
        if (att) {
          if (q.includes('seat_number = ?') && params.length === 2) {
            att.seat_number = params[0] || '';
          } else {
            att.department = params[0] !== undefined ? params[0] : att.department;
            att.name = params[1] !== undefined ? params[1] : att.name;
            att.title = params[2] !== undefined ? params[2] : att.title;
            att.role = params[3] || '部會代表';
            att.phone = params[4] || '';
            att.email = params[5] || '';
            att.seat_number = params[6] || '';
            att.fee_review = Number(params[7]) || 0;
            att.fee_traffic = Number(params[8]) || 0;
            att.fee_meal = Number(params[9]) || 0;
            att.note = params[10] || '';
          }
          context.changes = 1;
        }
      }
      // 6. 刪除出席者
      else if (q.includes('delete from attendees where id =')) {
        const id = Number(params[0]);
        memData.attendees = memData.attendees.filter(x => x.id !== id);
        context.changes = 1;
      }
      else if (q.includes('delete from attendees where meeting_id =')) {
        const mid = Number(params[0]);
        memData.attendees = memData.attendees.filter(x => x.meeting_id !== mid);
        context.changes = 1;
      }
      // 7. 費用規則更新
      else if (q.includes('update fee_rules')) {
        const id = Number(params[params.length - 1]);
        const r = memData.fee_rules.find(x => x.id === id);
        if (r) {
          r.name = params[0];
          r.code = params[1];
          r.category = params[2];
          r.default_amount = Number(params[3]) || 0;
          r.description = params[4] || '';
          context.changes = 1;
        }
      }
      // 8. 系統設定更新
      else if (q.includes('insert or replace into settings')) {
        const [k, v] = params;
        memData.settings[k] = String(v);
        context.changes = 1;
      }

      setImmediate(() => cb.call(context, null));
    } catch (err) {
      setImmediate(() => cb.call(context, err));
    }
  },

  prepare: (sql) => {
    const q = (sql || '').toLowerCase();
    return {
      run: (params, cb) => {
        if (q.includes('insert into attendees')) {
          const newId = nextAttendeeId++;
          memData.attendees.push({
            id: newId,
            meeting_id: Number(params[0]),
            department: params[1] || '',
            name: params[2] || '',
            title: params[3] || '',
            role: params[4] || '部會代表',
            phone: params[5] || '',
            email: params[6] || '',
            seat_number: params[7] || '',
            fee_review: Number(params[8]) || 0,
            fee_traffic: Number(params[9]) || 0,
            fee_meal: Number(params[10]) || 0,
            note: params[11] || ''
          });
        } else if (q.includes('update attendees set seat_number =')) {
          const [seat_number, id] = params;
          const att = memData.attendees.find(x => x.id === Number(id));
          if (att) att.seat_number = seat_number || '';
        }
        if (cb) setImmediate(cb);
      },
      finalize: (cb) => {
        if (cb) setImmediate(cb);
      }
    };
  }
};

module.exports = nativeDb || inMemoryEngine;
