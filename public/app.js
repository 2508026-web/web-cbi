// 全域狀態
let currentMeetingId = null;
let currentMeeting = null;
let meetingsList = [];
let feeRules = [];
let isAdmin = true;

// 初始化執行
document.addEventListener('DOMContentLoaded', async () => {
  await loadFeeRules();
  await loadMeetings();
  await loadSystemSettings();
  await loadUploadedFiles();
});

// ==========================================
// 1. 分頁切換
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });

  if (tabId === 'tab-seats') {
    renderSeatMap();
  } else if (tabId === 'tab-badges') {
    renderBadgePreviews();
  } else if (tabId === 'tab-finance') {
    renderFinanceSummary();
  }
}

// ==========================================
// 2. 會議載入與切換
// ==========================================
async function loadMeetings() {
  try {
    const res = await fetch('/api/meetings');
    meetingsList = await res.json();
    
    const select = document.getElementById('currentMeetingSelect');
    select.innerHTML = '';
    
    if (meetingsList.length === 0) {
      select.innerHTML = '<option value="">(目前無會議，請新增)</option>';
      renderEmptyMeeting();
      return;
    }

    meetingsList.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.date} - ${m.name}`;
      select.appendChild(opt);
    });

    if (!currentMeetingId && meetingsList.length > 0) {
      currentMeetingId = meetingsList[0].id;
    }
    select.value = currentMeetingId;
    await switchMeeting(currentMeetingId);
  } catch (err) {
    console.error('載入會議失敗:', err);
  }
}

async function switchMeeting(id) {
  if (!id) return;
  currentMeetingId = id;
  try {
    const res = await fetch(`/api/meetings/${id}`);
    currentMeeting = await res.json();
    renderMeetingOverview();
    renderAttendeesTable();
    renderBadgePreviews();
    renderFinanceSummary();
    renderCalendarWidget();
  } catch (err) {
    console.error('切換會議失敗:', err);
  }
}

function renderEmptyMeeting() {
  document.getElementById('meetingTitle').textContent = '目前尚無會議';
  document.getElementById('meetingDateBadge').textContent = '請先建立新會議';
  document.getElementById('attendeesTableBody').innerHTML = '<tr><td colspan="11" style="text-align:center;">尚無資料</td></tr>';
}

function renderMeetingOverview() {
  if (!currentMeeting) return;
  document.getElementById('meetingTitle').textContent = currentMeeting.name;
  document.getElementById('meetingDateBadge').textContent = currentMeeting.date;
  document.getElementById('meetingTime').textContent = currentMeeting.time || '(未設定)';
  document.getElementById('meetingLocation').textContent = currentMeeting.location || '(未設定)';
  document.getElementById('meetingChairperson').textContent = currentMeeting.chairperson || '(未設定)';
  document.getElementById('meetingDescription').textContent = currentMeeting.description || '(無議程說明)';
  document.getElementById('attendeeCountBadge').textContent = `共 ${currentMeeting.attendees ? currentMeeting.attendees.length : 0} 人`;
  document.getElementById('seatLayoutSelect').value = currentMeeting.seat_layout || 'rectangle';
}

// ==========================================
// 3. 出席人員名單管理
// ==========================================
function renderAttendeesTable() {
  const tbody = document.getElementById('attendeesTableBody');
  tbody.innerHTML = '';

  const attendees = (currentMeeting && currentMeeting.attendees) || [];
  if (attendees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:#9ca3af; padding: 24px;">尚未填寫出席人員名單，請點選上方「新增出席者」或「批次匯入名單」</td></tr>';
    return;
  }

  attendees.forEach((att, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
      <td><strong>${escapeHtml(att.department)}</strong></td>
      <td>${escapeHtml(att.name)}</td>
      <td>${escapeHtml(att.title)}</td>
      <td><span class="badge ${att.role === '審查專家' ? 'badge-primary' : 'badge-info'}">${escapeHtml(att.role || '代表')}</span></td>
      <td><span class="badge badge-outline">${escapeHtml(att.seat_number || '-')}</span></td>
      <td style="text-align:right;">$${Number(att.fee_review || 0).toLocaleString()}</td>
      <td style="text-align:right;">$${Number(att.fee_traffic || 0).toLocaleString()}</td>
      <td style="text-align:right;">$${Number(att.fee_meal || 0).toLocaleString()}</td>
      <td style="color:#6b7280; font-size:12px;">${escapeHtml(att.note || '-')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openEditAttendeeModal(${att.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAttendee(${att.id})">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddAttendeeModal() {
  if (!checkAdmin()) return;
  document.getElementById('attendeeModalTitle').textContent = '新增會議出席者';
  document.getElementById('attendeeId').value = '';
  document.getElementById('attDept').value = '';
  document.getElementById('attName').value = '';
  document.getElementById('attTitle').value = '';
  document.getElementById('attRole').value = '部會代表';
  document.getElementById('attSeat').value = '';
  document.getElementById('attFeeReview').value = '0';
  document.getElementById('attFeeTraffic').value = '0';
  document.getElementById('attFeeMeal').value = '120';
  document.getElementById('attNote').value = '';
  openModal('attendeeModal');
}

function openEditAttendeeModal(id) {
  if (!checkAdmin()) return;
  const att = currentMeeting.attendees.find(a => a.id === id);
  if (!att) return;

  document.getElementById('attendeeModalTitle').textContent = '編輯會議出席者';
  document.getElementById('attendeeId').value = att.id;
  document.getElementById('attDept').value = att.department;
  document.getElementById('attName').value = att.name;
  document.getElementById('attTitle').value = att.title;
  document.getElementById('attRole').value = att.role || '部會代表';
  document.getElementById('attSeat').value = att.seat_number || '';
  document.getElementById('attFeeReview').value = att.fee_review || 0;
  document.getElementById('attFeeTraffic').value = att.fee_traffic || 0;
  document.getElementById('attFeeMeal').value = att.fee_meal || 120;
  document.getElementById('attNote').value = att.note || '';
  openModal('attendeeModal');
}

// 根據身分角色自動套用預設費用標準
function applyDefaultFeesByRole(role) {
  const reviewRule = feeRules.find(r => r.category === 'review') || { default_amount: 2500 };
  const trafficRule = feeRules.find(r => r.category === 'traffic') || { default_amount: 1500 };
  const mealRule = feeRules.find(r => r.category === 'meal') || { default_amount: 120 };

  if (role === '審查專家') {
    document.getElementById('attFeeReview').value = reviewRule.default_amount;
    document.getElementById('attFeeTraffic').value = trafficRule.default_amount;
    document.getElementById('attFeeMeal').value = mealRule.default_amount;
  } else {
    document.getElementById('attFeeReview').value = 0;
    document.getElementById('attFeeTraffic').value = 0;
    document.getElementById('attFeeMeal').value = mealRule.default_amount;
  }
}

async function saveAttendee() {
  if (!checkAdmin()) return;
  const id = document.getElementById('attendeeId').value;
  const payload = {
    department: document.getElementById('attDept').value.trim(),
    name: document.getElementById('attName').value.trim(),
    title: document.getElementById('attTitle').value.trim(),
    role: document.getElementById('attRole').value,
    seat_number: document.getElementById('attSeat').value.trim(),
    fee_review: Number(document.getElementById('attFeeReview').value) || 0,
    fee_traffic: Number(document.getElementById('attFeeTraffic').value) || 0,
    fee_meal: Number(document.getElementById('attFeeMeal').value) || 0,
    note: document.getElementById('attNote').value.trim()
  };

  if (!payload.department || !payload.name || !payload.title) {
    alert('部會名稱、姓名與職稱為必填項目！');
    return;
  }

  const url = id ? `/api/attendees/${id}` : `/api/meetings/${currentMeetingId}/attendees`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('attendeeModal');
      await switchMeeting(currentMeetingId);
    } else {
      alert('儲存失敗: ' + (result.error || '未知錯誤'));
    }
  } catch (err) {
    alert('操作失敗: ' + err.message);
  }
}

async function deleteAttendee(id) {
  if (!checkAdmin()) return;
  if (!confirm('確定要刪除此出席者嗎？')) return;
  try {
    const res = await fetch(`/api/attendees/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      await switchMeeting(currentMeetingId);
    }
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  }
}

// 批次匯入解析
function openBatchImportModal() {
  if (!checkAdmin()) return;
  openModal('batchImportModal');
}

async function submitBatchImport() {
  const text = document.getElementById('batchInputText').value.trim();
  if (!text) {
    alert('請貼上名單資料！');
    return;
  }

  const lines = text.split('\n');
  const attendees = [];
  const reviewRule = feeRules.find(r => r.category === 'review') || { default_amount: 2500 };
  const trafficRule = feeRules.find(r => r.category === 'traffic') || { default_amount: 1500 };
  const mealRule = feeRules.find(r => r.category === 'meal') || { default_amount: 120 };

  lines.forEach(line => {
    const row = line.trim();
    if (!row) return;
    const parts = row.split(/[\t,，]+/).map(p => p.trim());
    if (parts.length >= 2) {
      const dept = parts[0];
      const name = parts[1];
      const title = parts[2] || '代表';
      const role = parts[3] || (title.includes('審查') || title.includes('教授') ? '審查專家' : '部會代表');
      
      const isExpert = role.includes('專家');
      attendees.push({
        department: dept,
        name: name,
        title: title,
        role: role,
        fee_review: isExpert ? reviewRule.default_amount : 0,
        fee_traffic: isExpert ? trafficRule.default_amount : 0,
        fee_meal: mealRule.default_amount,
        note: ''
      });
    }
  });

  if (attendees.length === 0) {
    alert('無法辨識名單格式，請確認每一行包含：部會 [Tab] 姓名 [Tab] 職稱');
    return;
  }

  try {
    const res = await fetch(`/api/meetings/${currentMeetingId}/attendees/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendees })
    });
    const result = await res.json();
    if (result.success) {
      alert(`成功匯入 ${result.count} 位出席人員！`);
      closeModal('batchImportModal');
      document.getElementById('batchInputText').value = '';
      await switchMeeting(currentMeetingId);
    }
  } catch (err) {
    alert('匯入失敗: ' + err.message);
  }
}

// ==========================================
// 4. 視覺化座位表
// ==========================================
function renderSeatMap() {
  const container = document.getElementById('seatsCanvas');
  container.innerHTML = '';
  if (!currentMeeting) return;

  const chairpersonName = currentMeeting.chairperson || '會議主席';
  document.getElementById('chairSeatName').textContent = chairpersonName;

  const layout = currentMeeting.seat_layout || 'rectangle';
  const attendees = currentMeeting.attendees || [];

  if (layout === 'rectangle' || layout === 'u_shape') {
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(2, 1fr)';
    container.style.gap = '20px';

    const leftCol = document.createElement('div');
    leftCol.className = 'seat-col';
    leftCol.innerHTML = '<div style="font-weight:bold; font-size:12px; color:#6b7280; margin-bottom:8px;">【 左側席位 (發言席) 】</div>';

    const rightCol = document.createElement('div');
    rightCol.className = 'seat-col';
    rightCol.innerHTML = '<div style="font-weight:bold; font-size:12px; color:#6b7280; margin-bottom:8px; text-align:right;">【 右側席位 (列席席) 】</div>';

    attendees.forEach((att, idx) => {
      const card = createSeatCard(att, idx + 1);
      if (idx % 2 === 0) {
        leftCol.appendChild(card);
      } else {
        rightCol.appendChild(card);
      }
    });

    container.appendChild(leftCol);
    container.appendChild(rightCol);
  } else {
    // 圓桌型
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    container.style.gap = '16px';
    attendees.forEach((att, idx) => {
      container.appendChild(createSeatCard(att, idx + 1));
    });
  }
}

function createSeatCard(att, defaultSeat) {
  const div = document.createElement('div');
  div.className = 'seat-card';
  div.innerHTML = `
    <span class="seat-num">${escapeHtml(att.seat_number || '#' + defaultSeat)}</span>
    <div class="seat-dept" title="${escapeHtml(att.department)}">${escapeHtml(att.department)}</div>
    <div class="seat-person">${escapeHtml(att.name)}</div>
    <div class="seat-title">${escapeHtml(att.title)}</div>
  `;
  div.onclick = () => {
    const newSeat = prompt(`設定 ${att.name} 的席位編號:`, att.seat_number || defaultSeat);
    if (newSeat !== null) {
      att.seat_number = newSeat;
      saveSeatAssignment(att.id, newSeat);
    }
  };
  return div;
}

async function saveSeatAssignment(attendeeId, seatNumber) {
  try {
    await fetch(`/api/meetings/${currentMeetingId}/seats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seatAssignments: [{ id: attendeeId, seat_number: seatNumber }]
      })
    });
    await switchMeeting(currentMeetingId);
  } catch (err) {
    console.error(err);
  }
}

async function changeSeatLayout(layout) {
  if (!currentMeetingId) return;
  try {
    await fetch(`/api/meetings/${currentMeetingId}/seats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout })
    });
    currentMeeting.seat_layout = layout;
    renderSeatMap();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// 5. 桌牌預覽與匯出 (PPTX)
// ==========================================
function renderBadgePreviews() {
  const container = document.getElementById('badgePreviewGrid');
  container.innerHTML = '';
  const attendees = (currentMeeting && currentMeeting.attendees) || [];

  if (attendees.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af;">尚未有出席人員資料，請先新增出席名單。</p>';
    return;
  }

  const pageCount = Math.ceil(attendees.length / 2);

  for (let p = 0; p < pageCount; p++) {
    const topPerson = attendees[p * 2];
    const botPerson = attendees[p * 2 + 1];

    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'badge-page-sheet';
    pageWrapper.innerHTML = `
      <div class="sheet-header">📄 第 ${p + 1} 頁 (A4 桌牌列印紙)</div>
      
      <!-- 上半部席位 -->
      <div class="sheet-badge-half top-half">
        <span class="badge-pos-tag">▲ 〔上〕席位桌牌 (雙面)</span>
        <div class="badge-dept">${escapeHtml(topPerson.department)}</div>
        <div class="badge-name">${escapeHtml(topPerson.name)}</div>
        <div class="badge-title">${escapeHtml(topPerson.title)}</div>
      </div>

      <div class="sheet-cut-line">✂️ 裁切線 (對分線) ✂️</div>

      <!-- 下半部席位 -->
      <div class="sheet-badge-half bottom-half">
        <span class="badge-pos-tag">▼ 〔下〕席位桌牌 (雙面)</span>
        ${botPerson ? `
          <div class="badge-dept">${escapeHtml(botPerson.department)}</div>
          <div class="badge-name">${escapeHtml(botPerson.name)}</div>
          <div class="badge-title">${escapeHtml(botPerson.title)}</div>
        ` : `
          <div style="color:#9ca3af; padding: 20px 0; font-size:13px;">(此頁下半部為空白保留席)</div>
        `}
      </div>
    `;
    container.appendChild(pageWrapper);
  }
}

function exportBadgesDirect() {
  if (!currentMeetingId) {
    alert('請先選擇或建立會議！');
    return;
  }
  const downloadUrl = `/api/meetings/${currentMeetingId}/export/badges?t=${Date.now()}`;
  const meetingName = (currentMeeting && currentMeeting.name) || '會議';
  
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${meetingName}_會議桌牌.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    alert('已成功匯出桌牌！\n\n📌 檔案已下載至您的瀏覽器下載清單中。\n📌 同時已自動同步儲存至專案目錄下的「會議桌牌_最新匯出.pptx」！');
  }, 300);
}

// ==========================================
// 6. 費用計算與會後核銷 (Excel)
// ==========================================
function renderFinanceSummary() {
  const attendees = (currentMeeting && currentMeeting.attendees) || [];
  let totalReview = 0;
  let totalTraffic = 0;
  let totalMeal = 0;

  const tbody = document.getElementById('financeTableBody');
  tbody.innerHTML = '';

  attendees.forEach((att, idx) => {
    const rev = Number(att.fee_review) || 0;
    const traf = Number(att.fee_traffic) || 0;
    const meal = Number(att.fee_meal) || 0;
    const subtotal = rev + traf + meal;

    totalReview += rev;
    totalTraffic += traf;
    totalMeal += meal;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;">${idx + 1}</td>
      <td><strong>${escapeHtml(att.name)}</strong></td>
      <td>${escapeHtml(currentMeeting.date)}</td>
      <td>${escapeHtml(currentMeeting.name)}</td>
      <td style="text-align:right;">$${rev.toLocaleString()}</td>
      <td style="text-align:right;">$${traf.toLocaleString()}</td>
      <td style="text-align:right;">$${meal.toLocaleString()}</td>
      <td style="text-align:right; font-weight:bold; color:#1e40af;">$${subtotal.toLocaleString()}</td>
      <td style="color:#6b7280; font-size:12px;">${escapeHtml(att.note || '')}</td>
    `;
    tbody.appendChild(tr);
  });

  const grandTotal = totalReview + totalTraffic + totalMeal;

  // 更新 Dashboard 數字
  document.getElementById('statReviewFee').textContent = `$${totalReview.toLocaleString()}`;
  document.getElementById('statTrafficFee').textContent = `$${totalTraffic.toLocaleString()}`;
  document.getElementById('statMealFee').textContent = `$${totalMeal.toLocaleString()}`;
  document.getElementById('statTotalFee').textContent = `$${grandTotal.toLocaleString()}`;

  // 更新表格 Footer
  const tfoot = document.getElementById('financeTableFoot');
  tfoot.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center;">總計</td>
      <td style="text-align:right;">$${totalReview.toLocaleString()}</td>
      <td style="text-align:right;">$${totalTraffic.toLocaleString()}</td>
      <td style="text-align:right;">$${totalMeal.toLocaleString()}</td>
      <td style="text-align:right; font-size:16px; color:#1e40af;">$${grandTotal.toLocaleString()}</td>
      <td></td>
    </tr>
  `;
}

function exportReimbursementSingle() {
  if (!currentMeetingId) return;
  const downloadUrl = `/api/meetings/${currentMeetingId}/export/reimbursement?t=${Date.now()}`;
  const meetingName = (currentMeeting && currentMeeting.name) || '會議';
  
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${meetingName}_費用核銷明細.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openBatchReimbursementModal() {
  const container = document.getElementById('meetingCheckboxList');
  container.innerHTML = '';

  meetingsList.forEach(m => {
    const item = document.createElement('div');
    item.className = 'checkbox-item';
    item.innerHTML = `
      <input type="checkbox" id="m_cb_${m.id}" value="${m.id}" checked>
      <label for="m_cb_${m.id}"><strong>${escapeHtml(m.date)}</strong> - ${escapeHtml(m.name)}</label>
    `;
    container.appendChild(item);
  });
  openModal('batchReimbursementModal');
}

async function exportBatchReimbursement() {
  const checkboxes = document.querySelectorAll('#meetingCheckboxList input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => Number(cb.value));

  if (selectedIds.length === 0) {
    alert('請至少勾選一場會議！');
    return;
  }

  // 透過 form POST 下載檔案
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/reimbursement/batch-export';
  form.target = '_blank';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'meetingIds';
  input.value = JSON.stringify(selectedIds);
  form.appendChild(input);

  // 用 fetch 下載以支援 application/json
  try {
    const res = await fetch('/api/reimbursement/batch-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingIds: selectedIds })
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `晶創計畫_合併核銷明細表.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      closeModal('batchReimbursementModal');
    } else {
      alert('匯出失敗');
    }
  } catch (err) {
    alert('匯出失敗: ' + err.message);
  }
}

// ==========================================
// 7. Google 日曆 & Drive 回收
// ==========================================
function renderCalendarWidget() {
  if (!currentMeeting) return;
  const d = new Date(currentMeeting.date);
  const month = !isNaN(d.getTime()) ? (d.getMonth() + 1) + '月' : '11月';
  const day = !isNaN(d.getTime()) ? String(d.getDate()).padStart(2, '0') : '06';

  document.getElementById('calMonth').textContent = month;
  document.getElementById('calDay').textContent = day;
  document.getElementById('calMeetingName').textContent = currentMeeting.name;
  document.getElementById('calMeetingTime').textContent = currentMeeting.time || '14:00 - 16:30';
  document.getElementById('calMeetingLoc').textContent = currentMeeting.location || '行政院科技會報';
  document.getElementById('calChairperson').textContent = currentMeeting.chairperson || '李政務委員';
}

function addToGoogleCalendar() {
  if (!currentMeeting) return;
  const title = encodeURIComponent(currentMeeting.name);
  const location = encodeURIComponent(currentMeeting.location || '');
  const details = encodeURIComponent(`主席：${currentMeeting.chairperson || ''}\n議程說明：${currentMeeting.description || ''}`);

  // 計算 Google 日曆時間格式 YYYYMMDDTHHMMSS
  const dateStr = currentMeeting.date.replace(/-/g, '');
  const startEnd = `${dateStr}T060000Z/${dateStr}T083000Z`;

  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startEnd}&details=${details}&location=${location}`;
  window.open(url, '_blank');
}

function downloadIcsFile() {
  if (!currentMeeting) return;
  const dateStr = currentMeeting.date.replace(/-/g, '');
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Taiwan Chip Program//Meeting System//TW
BEGIN:VEVENT
SUMMARY:${currentMeeting.name}
DESCRIPTION:${currentMeeting.description || ''}
LOCATION:${currentMeeting.location || ''}
DTSTART:${dateStr}T060000Z
DTEND:${dateStr}T083000Z
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${currentMeeting.name}.ics`;
  a.click();
}

// Drive 上傳處理
async function handleFileUpload(file) {
  if (!file) return;
  const uploader = document.getElementById('uploaderName').value.trim() || '計畫窗口';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploader', uploader);
  formData.append('meeting_name', currentMeeting ? currentMeeting.name : '');

  try {
    const res = await fetch('/api/drive/upload', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await loadUploadedFiles();
    } else {
      alert('上傳失敗: ' + result.error);
    }
  } catch (err) {
    alert('上傳發生錯誤: ' + err.message);
  }
}

async function loadUploadedFiles() {
  try {
    const res = await fetch('/api/drive/files');
    const files = await res.json();
    const ul = document.getElementById('uploadedFilesUl');
    ul.innerHTML = '';
    if (files.length === 0) {
      ul.innerHTML = '<li style="color:#9ca3af;">尚無上傳的名單檔案</li>';
      return;
    }

    files.forEach(f => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <strong>📄 ${escapeHtml(f.original_name)}</strong>
          <div style="font-size:11px; color:#6b7280;">上傳窗口：${escapeHtml(f.uploader)} ｜ 時間：${escapeHtml(f.uploaded_at)}</div>
        </div>
        <a href="${f.download_url}" class="btn btn-outline btn-sm" download>⬇️ 下載</a>
      `;
      ul.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// 8. 費用規則自訂管理
// ==========================================
async function loadFeeRules() {
  try {
    const res = await fetch('/api/fee-rules');
    feeRules = await res.json();
    const tbody = document.getElementById('feeRulesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    feeRules.forEach(rule => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(rule.name)}</strong></td>
        <td><code>${escapeHtml(rule.code)}</code></td>
        <td><span class="badge badge-info">${escapeHtml(rule.category)}</span></td>
        <td>$${Number(rule.default_amount).toLocaleString()}</td>
        <td style="color:#6b7280; font-size:12px;">${escapeHtml(rule.description || '')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editFeeRule(${rule.id})">✏️ 編輯</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function editFeeRule(id) {
  if (!checkAdmin()) return;
  const rule = feeRules.find(r => r.id === id);
  if (!rule) return;

  const newAmount = prompt(`請輸入「${rule.name}」的預設金額 (元):`, rule.default_amount);
  if (newAmount !== null && !isNaN(newAmount)) {
    try {
      await fetch(`/api/fee-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rule,
          default_amount: Number(newAmount)
        })
      });
      await loadFeeRules();
    } catch (err) {
      alert('更新失敗: ' + err.message);
    }
  }
}

function openAddFeeRuleModal() {
  if (!checkAdmin()) return;
  const name = prompt('請輸入新增的費用項目名稱 (例如: 交通津貼、撰稿費):');
  if (!name) return;
  const code = prompt('請輸入該項目的會計科目編號 (例如: 51330999):', '51330999');
  const amount = prompt('請輸入預設金額 (元):', '1000');

  fetch('/api/fee-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      code,
      category: 'other',
      default_amount: Number(amount) || 0,
      description: '管理員自訂費用項目'
    })
  }).then(() => loadFeeRules());
}

// ==========================================
// 9. 系統設定
// ==========================================
async function loadSystemSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    if (settings.google_drive_folder_name) {
      document.getElementById('settingDriveFolderName').value = settings.google_drive_folder_name;
    }
    if (settings.google_drive_folder_id) {
      document.getElementById('settingDriveFolderId').value = settings.google_drive_folder_id;
    }
  } catch (err) {}
}

async function saveSystemSettings() {
  if (!checkAdmin()) return;
  const payload = {
    google_drive_folder_name: document.getElementById('settingDriveFolderName').value.trim(),
    google_drive_folder_id: document.getElementById('settingDriveFolderId').value.trim()
  };
  const pwd = document.getElementById('settingAdminPassword').value.trim();
  if (pwd) payload.admin_password = pwd;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert('系統設定已成功儲存！');
    }
  } catch (err) {
    alert('儲存失敗: ' + err.message);
  }
}

// ==========================================
// 10. 會議新增、編輯與刪除
// ==========================================
function openNewMeetingModal() {
  if (!checkAdmin()) return;
  document.getElementById('meetingModalTitle').textContent = '新增會議';
  document.getElementById('editMeetingId').value = '';
  document.getElementById('mName').value = '';
  document.getElementById('mDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('mTime').value = '14:00 - 16:30';
  document.getElementById('mLocation').value = '行政院科技會報第 201 會議室';
  document.getElementById('mChairperson').value = '李政務委員';
  document.getElementById('mDescription').value = '';
  openModal('meetingModal');
}

function openEditMeetingModal() {
  if (!checkAdmin()) return;
  if (!currentMeeting) return;
  document.getElementById('meetingModalTitle').textContent = '編輯會議資訊';
  document.getElementById('editMeetingId').value = currentMeeting.id;
  document.getElementById('mName').value = currentMeeting.name;
  document.getElementById('mDate').value = currentMeeting.date;
  document.getElementById('mTime').value = currentMeeting.time || '';
  document.getElementById('mLocation').value = currentMeeting.location || '';
  document.getElementById('mChairperson').value = currentMeeting.chairperson || '';
  document.getElementById('mDescription').value = currentMeeting.description || '';
  openModal('meetingModal');
}

async function saveMeeting() {
  if (!checkAdmin()) return;
  const id = document.getElementById('editMeetingId').value;
  const payload = {
    name: document.getElementById('mName').value.trim(),
    date: document.getElementById('mDate').value,
    time: document.getElementById('mTime').value.trim(),
    location: document.getElementById('mLocation').value.trim(),
    chairperson: document.getElementById('mChairperson').value.trim(),
    description: document.getElementById('mDescription').value.trim()
  };

  if (!payload.name || !payload.date) {
    alert('請填寫會議名稱與日期！');
    return;
  }

  const url = id ? `/api/meetings/${id}` : '/api/meetings';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('meetingModal');
      await loadMeetings();
      if (!id && result.id) {
        await switchMeeting(result.id);
      }
    }
  } catch (err) {
    alert('儲存失敗: ' + err.message);
  }
}

async function deleteCurrentMeeting() {
  if (!checkAdmin()) return;
  if (!confirm(`確定要刪除「${currentMeeting.name}」及其所有名單嗎？此動作無法復原！`)) return;
  try {
    const res = await fetch(`/api/meetings/${currentMeetingId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      currentMeetingId = null;
      await loadMeetings();
    }
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  }
}

// ==========================================
// 11. 輔助函數與權限控制
// ==========================================
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function checkAdmin() {
  if (!isAdmin) {
    alert('目前處於鎖定瀏覽模式，請先解鎖管理員權限！');
    return false;
  }
  return true;
}

function toggleAuth() {
  if (isAdmin) {
    isAdmin = false;
    document.getElementById('adminBadge').className = 'badge badge-primary';
    document.getElementById('adminBadge').textContent = '🔒 唯讀瀏覽模式';
    document.getElementById('authBtn').textContent = '解鎖編輯';
  } else {
    const pwd = prompt('請輸入管理員密碼 (預設 admin123):');
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    }).then(res => res.json()).then(res => {
      if (res.success) {
        isAdmin = true;
        document.getElementById('adminBadge').className = 'badge badge-success';
        document.getElementById('adminBadge').textContent = '🔓 管理員已登入';
        document.getElementById('authBtn').textContent = '鎖定編輯';
      } else {
        alert(res.error || '密碼錯誤');
      }
    });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
