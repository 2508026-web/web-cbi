const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');
const { generateNameBadges } = require('./services/pptxService');
const { generateReimbursementExcel } = require('./services/excelService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 確保上傳與資料目錄存在 (Vercel 相容 /tmp)
const isVercel = process.env.VERCEL === '1';
const uploadDir = isVercel ? '/tmp/uploads/drive' : path.resolve(__dirname, '../uploads/drive');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // 支援 UTF-8 中文檔名
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${timestamp}_${originalName}`);
  }
});
const upload = multer({ storage });

// 提供上傳檔案靜態下載
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// 託管前端靜態資源
const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));


// =======================
// 1. 權限與設定 API
// =======================
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  db.get("SELECT value FROM settings WHERE key = 'admin_password'", (err, row) => {
    if (err) return res.status(500).json({ error: '資料庫錯誤' });
    const correctPassword = row ? row.value : 'admin123';
    if (password === correctPassword) {
      return res.json({ success: true, token: 'admin_token_' + Date.now() });
    }
    return res.status(401).json({ error: '密碼錯誤，請輸入正確的管理員密碼' });
  });
});

app.get('/api/settings', (req, res) => {
  db.all("SELECT key, value FROM settings", (err, rows) => {
    if (err) return res.status(500).json({ error: '無法取得設定' });
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  });
});

app.post('/api/settings', (req, res) => {
  const updates = req.body;
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(updates)) {
    stmt.run(k, String(v));
  }
  stmt.finalize(() => {
    res.json({ success: true, message: '設定已更新' });
  });
});

// =======================
// 2. 會議管理 API
// =======================
app.get('/api/meetings', (req, res) => {
  db.all("SELECT * FROM meetings ORDER BY date DESC, id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/meetings/:id', (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM meetings WHERE id = ?", [id], (err, meeting) => {
    if (err || !meeting) return res.status(404).json({ error: '找不到該會議' });
    
    db.all("SELECT * FROM attendees WHERE meeting_id = ? ORDER BY id ASC", [id], (err2, attendees) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ ...meeting, attendees });
    });
  });
});

app.post('/api/meetings', (req, res) => {
  const { name, date, time, location, chairperson, description, seat_layout } = req.body;
  if (!name || !date) {
    return res.status(400).json({ error: '會議名稱與日期為必填欄位' });
  }

  db.run(
    `INSERT INTO meetings (name, date, time, location, chairperson, description, seat_layout)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, date, time || '', location || '', chairperson || '', description || '', seat_layout || 'rectangle'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.put('/api/meetings/:id', (req, res) => {
  const { name, date, time, location, chairperson, description, seat_layout } = req.body;
  db.run(
    `UPDATE meetings SET name = ?, date = ?, time = ?, location = ?, chairperson = ?, description = ?, seat_layout = ?
     WHERE id = ?`,
    [name, date, time || '', location || '', chairperson || '', description || '', seat_layout || 'rectangle', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/meetings/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM attendees WHERE meeting_id = ?", [id], () => {
    db.run("DELETE FROM meetings WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// =======================
// 3. 出席者管理 API
// =======================
app.post('/api/meetings/:id/attendees', (req, res) => {
  const meetingId = req.params.id;
  const { department, name, title, role, phone, email, seat_number, fee_review, fee_traffic, fee_meal, note } = req.body;

  if (!department || !name || !title) {
    return res.status(400).json({ error: '部會名稱、姓名與職稱為必填欄位' });
  }

  db.run(
    `INSERT INTO attendees (meeting_id, department, name, title, role, phone, email, seat_number, fee_review, fee_traffic, fee_meal, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [meetingId, department, name, title, role || '部會代表', phone || '', email || '', seat_number || '', fee_review || 0, fee_traffic || 0, fee_meal || 0, note || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.put('/api/attendees/:id', (req, res) => {
  const { department, name, title, role, phone, email, seat_number, fee_review, fee_traffic, fee_meal, note } = req.body;
  db.run(
    `UPDATE attendees SET department = ?, name = ?, title = ?, role = ?, phone = ?, email = ?, seat_number = ?, fee_review = ?, fee_traffic = ?, fee_meal = ?, note = ?
     WHERE id = ?`,
    [department, name, title, role, phone, email, seat_number, fee_review, fee_traffic, fee_meal, note, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/attendees/:id', (req, res) => {
  db.run("DELETE FROM attendees WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 批次匯入出席者
app.post('/api/meetings/:id/attendees/batch', (req, res) => {
  const meetingId = req.params.id;
  const { attendees } = req.body;
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return res.status(400).json({ error: '匯入名單不可為空' });
  }

  const stmt = db.prepare(`
    INSERT INTO attendees (meeting_id, department, name, title, role, phone, email, seat_number, fee_review, fee_traffic, fee_meal, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  attendees.forEach(att => {
    stmt.run([
      meetingId,
      att.department || '',
      att.name || '',
      att.title || '',
      att.role || '部會代表',
      att.phone || '',
      att.email || '',
      att.seat_number || '',
      att.fee_review || 0,
      att.fee_traffic || 0,
      att.fee_meal || 0,
      att.note || ''
    ]);
  });

  stmt.finalize(() => {
    res.json({ success: true, count: attendees.length });
  });
});

// 批次更新座位表配置
app.put('/api/meetings/:id/seats', (req, res) => {
  const { seatAssignments, layout } = req.body;
  
  if (layout) {
    db.run("UPDATE meetings SET seat_layout = ? WHERE id = ?", [layout, req.params.id]);
  }

  if (Array.isArray(seatAssignments)) {
    const stmt = db.prepare("UPDATE attendees SET seat_number = ? WHERE id = ?");
    seatAssignments.forEach(s => {
      stmt.run([s.seat_number || '', s.id]);
    });
    stmt.finalize(() => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

// =======================
// 4. 費用規則自訂管理 API
// =======================
app.get('/api/fee-rules', (req, res) => {
  db.all("SELECT * FROM fee_rules ORDER BY id ASC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/fee-rules/:id', (req, res) => {
  const { name, code, category, default_amount, description } = req.body;
  db.run(
    `UPDATE fee_rules SET name = ?, code = ?, category = ?, default_amount = ?, description = ? WHERE id = ?`,
    [name, code, category, default_amount, description, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.post('/api/fee-rules', (req, res) => {
  const { name, code, category, default_amount, description } = req.body;
  db.run(
    `INSERT INTO fee_rules (name, code, category, default_amount, description) VALUES (?, ?, ?, ?, ?)`,
    [name, code, category, default_amount || 0, description || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

app.delete('/api/fee-rules/:id', (req, res) => {
  db.run("DELETE FROM fee_rules WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// =======================
// 5. 桌牌 PPTX 自動匯出
// =======================
app.get('/api/meetings/:id/export/badges', (req, res) => {
  const meetingId = req.params.id;
  db.get("SELECT name FROM meetings WHERE id = ?", [meetingId], (err, meeting) => {
    if (err || !meeting) return res.status(404).send('會議不存在');

    db.all("SELECT department, name, title FROM attendees WHERE meeting_id = ? ORDER BY id ASC", [meetingId], (err2, attendees) => {
      if (err2 || attendees.length === 0) {
        return res.status(400).send('目前無出席人員可產出桌牌');
      }

      const templatePath = path.resolve(__dirname, '../範例/桌牌格式.pptx');
      
      // 本機環境下額外儲存一份備份至專案目錄
      if (!isVercel) {
        const exportDir = path.resolve(__dirname, '../產出檔案');
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }
        const rootBackup = path.resolve(__dirname, '../會議桌牌_最新匯出.pptx');
        const backupPath = path.resolve(exportDir, `${meeting.name}_會議桌牌.pptx`);
        try {
          generateNameBadges(attendees, templatePath, rootBackup);
          fs.copyFileSync(rootBackup, backupPath);
        } catch (e) {}
      }

      const buffer = generateNameBadges(attendees, templatePath);

      const filename = encodeURIComponent(`${meeting.name}_會議桌牌.pptx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(buffer);
    });
  });
});

// =======================
// 6. 會後核銷明細 Excel 匯出
// =======================
// 單場會議匯出
app.get('/api/meetings/:id/export/reimbursement', (req, res) => {
  const meetingId = req.params.id;
  db.get("SELECT name, date FROM meetings WHERE id = ?", [meetingId], (err, meeting) => {
    if (err || !meeting) return res.status(404).send('會議不存在');

    db.all("SELECT * FROM attendees WHERE meeting_id = ? ORDER BY id ASC", [meetingId], async (err2, attendees) => {
      if (err2) return res.status(500).send(err2.message);

      const records = attendees.map(att => ({
        name: att.name,
        date: meeting.date,
        meeting_name: meeting.name,
        fee_review: att.fee_review,
        fee_traffic: att.fee_traffic,
        fee_meal: att.fee_meal,
        note: att.note
      }));

      try {
        const buffer = await generateReimbursementExcel(records, meeting.name);
        const filename = encodeURIComponent(`${meeting.name}_費用核銷明細.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
        res.send(buffer);
      } catch (e) {
        console.error(e);
        res.status(500).send('產生 Excel 失敗: ' + e.message);
      }
    });
  });
});

// 批次多場會議匯出（依照會議日期、會議名稱排列）
app.post('/api/reimbursement/batch-export', (req, res) => {
  const { meetingIds } = req.body;
  if (!Array.isArray(meetingIds) || meetingIds.length === 0) {
    return res.status(400).send('請選擇欲核銷匯出的會議');
  }

  const placeholders = meetingIds.map(() => '?').join(',');
  const query = `
    SELECT a.*, m.name as meeting_name, m.date as meeting_date
    FROM attendees a
    JOIN meetings m ON a.meeting_id = m.id
    WHERE m.id IN (${placeholders})
    ORDER BY m.date ASC, m.name ASC, a.id ASC
  `;

  db.all(query, meetingIds, async (err, rows) => {
    if (err) return res.status(500).send(err.message);

    const records = rows.map(r => ({
      name: r.name,
      date: r.meeting_date,
      meeting_name: r.meeting_name,
      fee_review: r.fee_review,
      fee_traffic: r.fee_traffic,
      fee_meal: r.fee_meal,
      note: r.note
    }));

    try {
      const buffer = await generateReimbursementExcel(records, '合併批次');
      const filename = encodeURIComponent(`晶創計畫_合併費用核銷明細表.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.send(buffer);
    } catch (e) {
      console.error(e);
      res.status(500).send('產生 Excel 失敗: ' + e.message);
    }
  });
});

// =======================
// 7. Google Drive 名單回收專區 API
// =======================
app.post('/api/drive/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請選擇上傳檔案' });
  }

  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const uploaderName = req.body.uploader || '計畫窗口';
  const meetingName = req.body.meeting_name || '未指定會議';

  // 儲存上傳紀錄到記錄清單
  const metaPath = path.join(uploadDir, 'uploads_meta.json');
  let meta = [];
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) {}
  }

  meta.unshift({
    id: Date.now(),
    filename: req.file.filename,
    original_name: originalName,
    size: req.file.size,
    uploader: uploaderName,
    meeting_name: meetingName,
    uploaded_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    download_url: `/uploads/drive/${encodeURIComponent(req.file.filename)}`
  });

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  res.json({
    success: true,
    message: '出席名單已成功上傳至指定共同資料夾位置！',
    file: meta[0]
  });
});

app.get('/api/drive/files', (req, res) => {
  const metaPath = path.join(uploadDir, 'uploads_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return res.json(meta);
    } catch (e) {}
  }
  res.json([]);
});

// 啟動伺服器 (本機模式)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`會議管理與核銷系統後端已成功在 port ${PORT} 啟動！`);
    console.log(`===============================================`);
  });
}

module.exports = app;
