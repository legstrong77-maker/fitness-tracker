/* =====================================================================
   FITNESS TRACKER — Main Application Script
   =====================================================================

   ★ 設定您的 Google Apps Script Web App 網址於下方
   ★ 請先完成 Apps Script 設定，並將部署後的 URL 填入
   ===================================================================== */

const API_URL = 'https://script.google.com/macros/s/AKfycbzA2w6Zca-WmweGNVcE6FUJXHArpETFHWKMTlVmTJYdQw9wUZGyqc_R2rL96BxDnNTBUA/exec'; // ← ★ 在此填入您的 GAS Web App 網址

/* =====================================================================
   全域狀態
   ===================================================================== */
let allRecords = [];          // 存放從 Sheets 讀取的所有打卡紀錄
let selectedDate = null;      // 日曆被點選的日期 (Date object)
let viewYear, viewMonth;      // 目前日曆顯示的年份 / 月份 (0-indexed)

function recordKey(r) { return `${r.timestamp}_${r.name}_${r.date}`; }

/* =====================================================================
   初始化
   ===================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  initAnnouncement();
  initRewards();
  initCalendarNav();
  renderCalendar();
  initModal();
  initLightbox();
  initConfig();
  initThemeToggle();
  initRandomExercise();
  initPersonalStats();
  initReminder();
  initCollapsibles();
  registerSW();

  loadData(); // 向 Google Sheets 要資料
});

/* =====================================================================
   可收合面板
   ===================================================================== */
function initCollapsibles() {
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = document.getElementById(header.dataset.target);
      if (section) section.classList.toggle('collapsed');
    });
  });
}

/* =====================================================================
   公告欄 — 雲端同步
   ===================================================================== */
function initAnnouncement() {
  const el = document.getElementById('announcementText');
  // 優先顯示全域變數中的雲端設定，若無則看本地 (過渡期)
  const remote = window.ft_configs?.announcement;
  if (remote) el.textContent = remote;
  else {
    const saved = localStorage.getItem('ft_announcement');
    if (saved) el.textContent = saved;
  }

  el.addEventListener('blur', () => {
    const val = el.textContent.trim();
    saveRemoteConfig('announcement', val);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
  });
}

/* =====================================================================
   日曆 — 導覽按鈕
   ===================================================================== */
function initCalendarNav() {
  document.getElementById('prevMonth').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  });
}

/* =====================================================================
   日曆 — 渲染
   ===================================================================== */
function renderCalendar() {
  const label = document.getElementById('currentMonthLabel');
  const grid = document.getElementById('calendarGrid');
  const today = new Date();

  label.textContent = `${viewYear} 年 ${viewMonth + 1} 月`;
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=日
  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

  // 空白格
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // 日期格
  for (let d = 1; d <= totalDays; d++) {
    const cell = document.createElement('div');
    const isToday = (d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear());
    const dayOfWeek = new Date(viewYear, viewMonth, d).getDay();

    cell.className = 'cal-day' +
      (isToday ? ' today' : '') +
      (dayOfWeek === 0 ? ' sunday' : '') +
      (dayOfWeek === 6 ? ' saturday' : '');

    const numEl = document.createElement('span');
    numEl.className = 'day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    // 放入打卡者頭像
    const avatarsEl = document.createElement('div');
    avatarsEl.className = 'day-avatars';
    cell.appendChild(avatarsEl);

    populateDayAvatars(avatarsEl, viewYear, viewMonth + 1, d);

    cell.addEventListener('click', () => openDayDetail(new Date(viewYear, viewMonth, d)));
    grid.appendChild(cell);
  }
}

/* =====================================================================
   📋 日期詳情面板
   ===================================================================== */
function openDayDetail(date) {
  selectedDate = date;
  const overlay = document.getElementById('dayDetailOverlay');
  const title = document.getElementById('dayDetailTitle');
  const list = document.getElementById('dayDetailList');

  const m = date.getMonth() + 1;
  const d = date.getDate();
  const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  title.textContent = `${date.getFullYear()} 年 ${m} 月 ${d} 日（${wd}）`;

  const dateStr = `${date.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayRecs = allRecords.filter(r => r.date === dateStr);

  if (!dayRecs.length) {
    list.innerHTML = '<p class="day-detail-empty">這天還沒有人打卡，來當第一個吧！ 🏃</p>';
  } else {
    list.innerHTML = '';
    dayRecs.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'day-detail-item';
      const hKey = recordKey(rec);
      const desc = rec.description ? `<span class="day-detail-desc">${escapeHtml(rec.description)}</span>` : '';
      const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
      item.innerHTML = `
        <div class="activity-avatar" style="background:${nameToColor(rec.name)};width:32px;height:32px;font-size:0.75rem;">${(rec.name || '?').charAt(0).toUpperCase()}</div>
        <div class="day-detail-info">
          <strong>${escapeHtml(rec.name)}</strong>${desc}
          ${timeStr ? `<span class="day-detail-time">${timeStr}</span>` : ''}
        </div>
        ${rec.photoUrl ? `<img class="day-detail-thumb" src="${rec.photoUrl}" alt="運動照" />` : ''}
        <button class="day-detail-delete" title="隱藏此紀錄">🗑</button>
      `;
      if (rec.photoUrl) {
        item.querySelector('.day-detail-thumb').addEventListener('click', (e) => { e.stopPropagation(); openLightbox(rec.photoUrl); });
      }
      item.querySelector('.day-detail-delete').addEventListener('click', async (e) => {
        if (!confirm(`確定要將 ${rec.name} 的這筆紀錄從資料庫徹底刪除嗎？\n（此動作無法復原喔！）`)) return;
        
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '⏳';
        
        try {
          const payload = {
            action: 'deleteRecord',
            timestamp: rec.timestamp,
            name: rec.name,
            date: rec.date
          };
          const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
          const data = await res.json();
          if (data.status === 'ok') {
            await loadData(); // 重新讀取全部資料
            openDayDetail(date); // 重新展開當天的面板
          } else {
            alert('刪除失敗：' + data.message);
          }
        } catch (err) {
          alert('刪除發生錯誤：' + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = '🗑';
        }
      });
      list.appendChild(item);
    });
  }

  overlay.classList.add('open');
}

// 關閉日期詳情
document.getElementById('dayDetailClose').addEventListener('click', () => {
  document.getElementById('dayDetailOverlay').classList.remove('open');
});
document.getElementById('dayDetailOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});
// 打卡按鈕 → 關閉詳情 → 開啟上傳 modal
document.getElementById('dayDetailCheckinBtn').addEventListener('click', () => {
  document.getElementById('dayDetailOverlay').classList.remove('open');
  openModal(selectedDate);
});

/* 將當天打卡者名字標籤插入日期格 */
function populateDayAvatars(container, year, month, day) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const recs = allRecords.filter(r => r.date === dateStr);

  // 去重 (同一天同一人只顯示一次)
  const names = [...new Set(recs.map(r => r.name))];
  const maxShow = 3;
  names.slice(0, maxShow).forEach(name => {
    const tag = document.createElement('div');
    tag.className = 'day-name-tag';
    tag.style.setProperty('--tag-hue', nameToHue(name));
    tag.title = name;
    // 超過 4 字截斷
    tag.textContent = name.length > 4 ? name.slice(0, 4) + '…' : name;
    container.appendChild(tag);
  });
  if (names.length > maxShow) {
    const more = document.createElement('div');
    more.className = 'day-name-tag day-name-more';
    more.textContent = `+${names.length - maxShow}`;
    container.appendChild(more);
  }
}

/* 根據名字產生穩定的漸層色（用於動態牆頭像等） */
function nameToColor(name) {
  let hash = 0;
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1},70%,50%), hsl(${h2},70%,45%))`;
}

/* 根據名字產生穩定的色相值（用於日曆名字標籤） */
function nameToHue(name) {
  let hash = 0;
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

/* =====================================================================
   上傳打卡 Modal
   ===================================================================== */
function initModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // 照片預覽
  const input = document.getElementById('photoInput');
  const preview = document.getElementById('uploadPreview');
  const placeholder = document.getElementById('uploadPlaceholder');
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.classList.add('visible');
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // 送出
  document.getElementById('submitBtn').addEventListener('click', submitCheckin);
}

function openModal(date) {
  selectedDate = date;
  const overlay = document.getElementById('modalOverlay');
  const label = document.getElementById('modalDateLabel');
  const result = document.getElementById('modalResult');
  const preview = document.getElementById('uploadPreview');
  const placeholder = document.getElementById('uploadPlaceholder');
  const photoInput = document.getElementById('photoInput');

  const dateStr = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  label.textContent = dateStr;
  result.textContent = '';
  preview.classList.remove('visible');
  placeholder.style.display = '';
  photoInput.value = '';
  document.getElementById('userName').value = localStorage.getItem('ft_username') || '';
  document.getElementById('exerciseDesc').value = '';

  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  selectedDate = null;
}

async function submitCheckin() {
  const nameEl = document.getElementById('userName');
  const descEl = document.getElementById('exerciseDesc');
  const photoInput = document.getElementById('photoInput');
  const result = document.getElementById('modalResult');
  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('submitText');
  const spinner = document.getElementById('submitSpinner');

  const name = nameEl.value.trim();
  if (!name) { nameEl.focus(); result.textContent = '⚠️ 請填入你的名字！'; return; }
  if (!API_URL) {
    result.textContent = '⚠️ 尚未設定 API 網址，請先完成 Google Apps Script 設定。';
    return;
  }

  // 儲存常用名字
  localStorage.setItem('ft_username', name);

  const file = photoInput.files[0];
  let photoBase64 = '';

  if (file) {
    photoBase64 = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = (e) => res(e.target.result);
      reader.readAsDataURL(file);
    });
    // 壓縮圖片到 800px 以下
    photoBase64 = await compressImage(photoBase64, 800);
  }

  // 送出資料
  btn.disabled = true;
  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');
  result.textContent = '';

  const dateStr = formatDateStr(selectedDate);

  try {
    const payload = {
      action: 'addRecord',
      name,
      description: descEl.value.trim(),
      date: dateStr,
      photo: photoBase64,
    };

    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status === 'ok') {
      result.textContent = '🎉 打卡成功！繼續保持！';
      result.style.color = 'var(--accent-secondary)';
      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } else {
      throw new Error(data.message || '伺服器回傳錯誤');
    }
  } catch (err) {
    result.textContent = `❌ 打卡失敗：${err.message}`;
    result.style.color = 'var(--accent-danger)';
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

/* 壓縮圖片 */
function compressImage(base64, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
        else { width = Math.round(width * maxSize / height); height = maxSize; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = base64;
  });
}

/* =====================================================================
   Lightbox
   ===================================================================== */
function initLightbox() {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  const lbClose = document.getElementById('lightboxClose');

  lbClose.addEventListener('click', () => lb.classList.remove('open'));
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.remove('open'); });

  document.addEventListener('openLightbox', (e) => {
    lbImg.src = e.detail.src;
    lb.classList.add('open');
  });
}

function openLightbox(src) {
  document.dispatchEvent(new CustomEvent('openLightbox', { detail: { src } }));
}

/* =====================================================================
   讀取資料（GET 請求）- 包含快取優化 (Stale-while-revalidate)
   ===================================================================== */
async function loadData() {
  if (!API_URL) return;

  // 1. 先用快取資料秒開介面
  const cachedData = localStorage.getItem('ft_cached_initial_data');
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      processInitialData(data);
    } catch (e) {
      console.warn('快取解析失敗', e);
    }
  }

  // 2. 在背景非同步抓取最新資料
  try {
    const url = `${API_URL}?action=getInitialData`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'ok') {
      // 存入快取供下次使用
      localStorage.setItem('ft_cached_initial_data', JSON.stringify(data));
      // 更新介面
      processInitialData(data);
    }
  } catch (err) {
    console.error('資料讀取失敗：', err);
  }
}

function processInitialData(data) {
  if (data.configs) {
    window.ft_configs = data.configs;
    applyConfigs();
  }

  if (Array.isArray(data.records)) {
    allRecords = data.records.map(r => ({
      ...r,
      date: normalizeDate(r.date),
    }));
    renderCalendar();
    populateMonthSelectors();
    renderLeaderboard();
    renderActivityFeed();
    updateHeroStats();
    updateTeamGoal();
    populateStatsDropdown();
    renderPhotoWall();
  }
}

/* 將各種日期格式統一轉為 YYYY-MM-DD (處理 Google Sheets 的 Date 轉型問題) */
function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // 已經是 YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 嘗試用 Date 解析後格式化
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return s; // 無法解析時原樣回傳
}


/* =====================================================================
   月份選擇器 — 共用
   ===================================================================== */
function populateMonthSelectors() {
  // 從所有紀錄中收集出現過的年月
  const ymSet = new Set();
  allRecords.forEach(r => {
    if (r.date && r.date.length >= 7) ymSet.add(r.date.substring(0, 7));
  });
  // 確保至少包含當月
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ymSet.add(currentYM);

  const months = [...ymSet].sort().reverse(); // 最新在前

  ['leaderboardMonthSelect', 'statsMonthSelect'].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = '';
    months.forEach(ym => {
      const [y, m] = ym.split('-');
      const opt = document.createElement('option');
      opt.value = ym;
      opt.textContent = `${y} 年 ${parseInt(m)} 月`;
      sel.appendChild(opt);
    });
    // 還原先前選的或預設當月
    sel.value = (prev && months.includes(prev)) ? prev : currentYM;
  });
}

// 排行榜月份切換
document.getElementById('leaderboardMonthSelect').addEventListener('change', () => renderLeaderboard());
// 統計月份切換 → 重新填充成員 + 清空統計
document.getElementById('statsMonthSelect').addEventListener('change', () => {
  populateStatsDropdown();
  document.getElementById('personalStatsBody').innerHTML = '<p class="activity-placeholder">選擇成員即可查看個人資料 📋</p>';
});

/* =====================================================================
   排行榜 — 依選的月份統計
   ===================================================================== */
function renderLeaderboard() {
  const list = document.getElementById('leaderboardList');
  list.innerHTML = '';

  const ym = document.getElementById('leaderboardMonthSelect').value;

  // 計算每人在該月的不重複打卡天數
  const countMap = {};
  for (const rec of allRecords) {
    if (!rec.date.startsWith(ym)) continue;
    if (!countMap[rec.name]) countMap[rec.name] = new Set();
    countMap[rec.name].add(rec.date);
  }

  const sorted = Object.entries(countMap)
    .map(([name, days]) => ({ name, count: days.size }))
    .sort((a, b) => b.count - a.count);

  if (!sorted.length) {
    list.innerHTML = '<li class="leaderboard-placeholder">該月尚無打卡紀錄 🌟</li>';
    return;
  }

  sorted.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-item';

    const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-n';
    const rankText = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;

    li.innerHTML = `
      <div class="rank-badge ${rankClass}">${rankText}</div>
      <span class="rank-name">${escapeHtml(item.name)}</span>
      <span class="rank-count">${item.count}</span>
      <span class="rank-unit">天</span>
    `;
    list.appendChild(li);
  });

}

/* =====================================================================
   即時動態 — 最新 30 筆
   ===================================================================== */
function renderActivityFeed() {
  const feed = document.getElementById('activityFeed');
  feed.innerHTML = '';

  const sorted = [...allRecords].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

  if (!sorted.length) {
    feed.innerHTML = '<li class="activity-placeholder">尚無打卡動態 💤</li>';
    return;
  }

  sorted.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'activity-item';

    const initial = (rec.name || '?').charAt(0).toUpperCase();
    const timeStr = formatRelativeTime(new Date(rec.timestamp));
    const desc = rec.description ? `・${escapeHtml(rec.description)}` : '';
    const hKey = recordKey(rec);

    li.innerHTML = `
      <div class="activity-avatar" style="background:${nameToColor(rec.name)}">${initial}</div>
      <div class="activity-content">
        <p class="activity-text">
          <strong>${escapeHtml(rec.name)}</strong> 完成了今日運動
          <span class="activity-plus">+1</span>${desc}
        </p>
        <p class="activity-time">${timeStr} · ${rec.date || ''}</p>
      </div>
      ${rec.photoUrl ? `<img class="activity-thumb" src="${rec.photoUrl}" alt="打卡照" loading="lazy" />` : ''}
      <button class="activity-delete-icon" data-hkey="${hKey}" title="隱藏此紀錄">🗑</button>
    `;

    if (rec.photoUrl) {
      li.querySelector('.activity-thumb').addEventListener('click', () => openLightbox(rec.photoUrl));
    }

    // 刪除按鈕
    li.querySelector('.activity-delete-icon').addEventListener('click', async (e) => {
      if (!confirm(`確定要將 ${rec.name} 在 ${rec.date} 的打卡徹底刪除嗎？\n（資料庫檔案會被移除）`)) return;
      
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = '⏳';
      
      try {
        const payload = {
          action: 'deleteRecord',
          timestamp: rec.timestamp,
          name: rec.name,
          date: rec.date
        };
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        
        if (data.status === 'ok') {
          await loadData(); // 重新讀取全部資料
        } else {
          alert('刪除失敗：' + data.message);
        }
      } catch (err) {
        alert('刪除發生錯誤：' + err.message);
      } finally {
        if(btn) { btn.disabled = false; btn.textContent = '🗑'; }
      }
    });

    feed.appendChild(li);
  });
}

/* =====================================================================
   Hero 統計
   ===================================================================== */
function updateHeroStats() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = formatDateStr(now);

  const monthRecs = allRecords.filter(r => r.date && r.date.startsWith(ym));
  const todayRecs = allRecords.filter(r => r.date === today);
  const allNames = new Set(allRecords.map(r => r.name));

  animateNumber('totalCheckins', monthRecs.length);
  animateNumber('totalMembers', allNames.size);
  animateNumber('todayCheckins', todayRecs.length);
}

/* 數字跳動動畫 */
function animateNumber(id, target) {
  const el = document.getElementById(id);
  const start = parseInt(el.textContent) || 0;
  const steps = 20;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(start + (target - start) * (step / steps));
    if (step >= steps) clearInterval(timer);
  }, 20);
}

/* =====================================================================
   Refresh Button
   ===================================================================== */
document.getElementById('refreshBtn').addEventListener('click', loadData);

/* =====================================================================
   Config Notice（API 未設定時提示）
   ===================================================================== */
function initConfig() {
  const notice = document.getElementById('configNotice');
  if (!API_URL) {
    notice.classList.add('open');
    document.getElementById('configNoticeClose').addEventListener('click', () => {
      notice.classList.remove('open');
    });
  }
}

/* =====================================================================
   工具函式
   ===================================================================== */
function formatDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* =====================================================================
   獎勵欄 — 雲端同步
   ===================================================================== */
function initRewards() {
  const el = document.getElementById('rewardsBody');
  const remote = window.ft_configs?.rewards;
  if (remote) el.innerHTML = remote;
  else {
    const saved = localStorage.getItem('ft_rewards');
    if (saved) el.innerHTML = saved;
  }

  el.addEventListener('blur', () => {
    saveRemoteConfig('rewards', el.innerHTML);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.blur();
  });
}

function applyConfigs() {
  if (!window.ft_configs) return;
  const ann = window.ft_configs.announcement;
  const rew = window.ft_configs.rewards;
  if (ann) document.getElementById('announcementText').textContent = ann;
  if (rew) document.getElementById('rewardsBody').innerHTML = rew;
}

async function saveRemoteConfig(key, value) {
  if (!API_URL) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'setConfig', key, value }),
    });
  } catch (e) {
    console.error(`設定儲存失敗 (${key}):`, e);
  }
}

/* =====================================================================
   🌙 深色/淺色模式切換
   ===================================================================== */
function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  const saved = localStorage.getItem('ft_theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    btn.textContent = '☀️';
  }

  btn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    btn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('ft_theme', isLight ? 'light' : 'dark');
  });
}

/* =====================================================================
   🎲 隨機運動推薦
   ===================================================================== */
const EXERCISES = [
  { icon: '🏃', title: '慢跑 20 分鐘', desc: '到附近的公園或河堤跑跑步，讓心跳加速！' },
  { icon: '🧘', title: '瑜珈伸展 15 分鐘', desc: '放鬆身心，做幾組拜日式和下犬式。' },
  { icon: '🏋️', title: '居家重訓 30 分鐘', desc: '深蹲、伏地挺身、棒式，三組循環。' },
  { icon: '🚴', title: '騎腳踏車 30 分鐘', desc: '到附近騎一圈，享受微風。' },
  { icon: '🏊', title: '游泳 30 分鐘', desc: '來個全身有氧，也不傷膝蓋！' },
  { icon: '🤸', title: '跳繩 500 下', desc: '高效燃脂運動，分五組完成。' },
  { icon: '🧗', title: '攀岩 1 小時', desc: '鍛鍊上肢和核心的好選擇！' },
  { icon: '🏸', title: '打羽球 30 分鐘', desc: '找朋友來場快節奏的比賽吧！' },
  { icon: '💃', title: '跳舞 20 分鐘', desc: '播放你最愛的音樂盡情舞動！' },
  { icon: '🚶', title: '快走 40 分鐘', desc: '戴上耳機邊走邊聽 Podcast。' },
  { icon: '🥊', title: '拳擊有氧 20 分鐘', desc: '對空揮拳加上步伐移動，超舒壓！' },
  { icon: '🏐', title: '打排球 1 小時', desc: '約朋友來場沙灘排球或室內排球！' },
  { icon: '⚽', title: '踢足球 45 分鐘', desc: '跑跑跳跳，最好的團隊運動之一！' },
  { icon: '🎾', title: '打網球 30 分鐘', desc: '練習揮拍和步伐移動。' },
  { icon: '🧎', title: '深蹲 100 下', desc: '分五組，每組 20 下，臀腿燃燒！' },
  { icon: '🤾', title: '波比跳 50 下', desc: '分五組，每組 10 下，全身爆炸！' },
  { icon: '🪜', title: '爬樓梯 15 分鐘', desc: '找棟大樓上下爬幾趟，燃脂效率超高！' },
  { icon: '🏄', title: '核心訓練 15 分鐘', desc: '棒式、死蟲式、捲腹三組循環。' },
  { icon: '🎿', title: '登山健行', desc: '找條步道走走，擁抱大自然！' },
  { icon: '🤽', title: '仰臥起坐 100 下', desc: '分五組做完，核心穩穩的！' },
];

function initRandomExercise() {
  const fab = document.getElementById('randomExerciseFab');
  const popup = document.getElementById('randomExercisePopup');
  const closeBtn = document.getElementById('randomExerciseClose');
  const rerollBtn = document.getElementById('randomExerciseReroll');

  const roll = () => {
    const ex = EXERCISES[Math.floor(Math.random() * EXERCISES.length)];
    document.getElementById('randomExerciseIcon').textContent = ex.icon;
    document.getElementById('randomExerciseTitle').textContent = ex.title;
    document.getElementById('randomExerciseDesc').textContent = ex.desc;
  };

  fab.addEventListener('click', () => { roll(); popup.classList.add('open'); });
  closeBtn.addEventListener('click', () => popup.classList.remove('open'));
  popup.addEventListener('click', (e) => { if (e.target === popup) popup.classList.remove('open'); });
  rerollBtn.addEventListener('click', roll);
}

/* =====================================================================
   🎯 團隊目標進度
   ===================================================================== */
let teamGoal = parseInt(localStorage.getItem('ft_team_goal')) || 100;

function updateTeamGoal() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthRecs = allRecords.filter(r => r.date && r.date.startsWith(ym));
  const count = monthRecs.length;
  const pct = Math.min(100, Math.round(count / teamGoal * 100));

  document.getElementById('teamGoalLabel').textContent = `${count} / ${teamGoal} 次`;
  document.getElementById('teamGoalFill').style.width = `${pct}%`;
}

// +/- 按鈕事件
document.getElementById('goalPlus').addEventListener('click', () => {
  teamGoal += 10;
  localStorage.setItem('ft_team_goal', teamGoal);
  updateTeamGoal();
});
document.getElementById('goalMinus').addEventListener('click', () => {
  teamGoal = Math.max(10, teamGoal - 10);
  localStorage.setItem('ft_team_goal', teamGoal);
  updateTeamGoal();
});

/* =====================================================================
   📸 照片牆
   ===================================================================== */
function renderPhotoWall() {
  const grid = document.getElementById('photoWallGrid');
  const withPhotos = allRecords.filter(r => r.photoUrl);

  if (!withPhotos.length) {
    grid.innerHTML = '<p class="activity-placeholder">還沒有運動照片 📷</p>';
    return;
  }

  grid.innerHTML = '';
  // 最新的照片在前
  [...withPhotos].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(rec => {
    const div = document.createElement('div');
    div.className = 'photo-wall-item';
    div.innerHTML = `
      <img src="${rec.photoUrl}" alt="${escapeHtml(rec.name)} 的運動照" loading="lazy" />
      <div class="pw-overlay">${escapeHtml(rec.name)} · ${rec.date}</div>
    `;
    div.addEventListener('click', () => openLightbox(rec.photoUrl));
    grid.appendChild(div);
  });
}

/* =====================================================================
   📊 個人統計 + 🏆 成就徽章
   ===================================================================== */
function initPersonalStats() {
  const select = document.getElementById('statsNameSelect');
  select.addEventListener('change', () => {
    renderPersonalStats(select.value);
  });
}

function populateStatsDropdown() {
  const select = document.getElementById('statsNameSelect');
  const ym = document.getElementById('statsMonthSelect').value;
  const monthRecs = allRecords.filter(r => r.date && r.date.startsWith(ym));

  // 取得該月有運動的人，依打卡次數排序
  const countMap = {};
  monthRecs.forEach(r => { countMap[r.name] = (countMap[r.name] || 0) + 1; });
  const names = Object.keys(countMap).sort((a, b) => countMap[b] - countMap[a]);

  const current = select.value;
  select.innerHTML = '<option value="">— 選擇成員 —</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name}（${countMap[name]} 次）`;
    select.appendChild(opt);
  });
  if (current && names.includes(current)) {
    select.value = current;
  }
}

function renderPersonalStats(name) {
  const body = document.getElementById('personalStatsBody');
  if (!name) { body.innerHTML = '<p class="activity-placeholder">請選擇成員 📋</p>'; return; }

  const recs = allRecords.filter(r => r.name === name);
  if (!recs.length) { body.innerHTML = `<p class="activity-placeholder">${escapeHtml(name)} 尚無打卡紀錄</p>`; return; }

  const ym = document.getElementById('statsMonthSelect').value;
  const monthRecs = recs.filter(r => r.date && r.date.startsWith(ym));
  const uniqueDays = new Set(recs.map(r => r.date));
  const monthUniqueDays = new Set(monthRecs.map(r => r.date));

  // 計算最長連續打卡天數
  const streak = calcStreak(recs);

  // 最常做的運動
  const descMap = {};
  recs.forEach(r => { if (r.description) descMap[r.description] = (descMap[r.description] || 0) + 1; });
  const topDesc = Object.entries(descMap).sort((a, b) => b[1] - a[1])[0];
  const topExercise = topDesc ? topDesc[0] : '—';

  // 徽章
  const BADGES = [
    { icon: '🌱', label: '新芽 (3天)', need: 3 },
    { icon: '🌿', label: '茁壯 (7天)', need: 7 },
    { icon: '🌳', label: '大樹 (14天)', need: 14 },
    { icon: '👑', label: '傳說 (30天)', need: 30 },
  ];

  const totalDays = uniqueDays.size;

  body.innerHTML = `
    <div class="stats-grid">
      <div class="stats-item">
        <span class="stats-value">${monthUniqueDays.size}</span>
        <span class="stats-label">本月打卡天數</span>
      </div>
      <div class="stats-item">
        <span class="stats-value">${totalDays}</span>
        <span class="stats-label">總打卡天數</span>
      </div>
      <div class="stats-item">
        <span class="stats-value">${streak}</span>
        <span class="stats-label">最長連續天數 🔥</span>
      </div>
      <div class="stats-item">
        <span class="stats-value" style="font-size:0.9rem;line-height:1.8">${escapeHtml(topExercise)}</span>
        <span class="stats-label">最常做的運動</span>
      </div>
    </div>
    <div class="stats-badges">
      ${BADGES.map(b =>
    `<span class="badge-tag ${totalDays >= b.need ? '' : 'locked'}">${b.icon} ${b.label}</span>`
  ).join('')}
    </div>
  `;
}

function calcStreak(recs) {
  const days = [...new Set(recs.map(r => r.date))].sort();
  if (!days.length) return 0;
  let maxStreak = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else { cur = 1; }
  }
  return maxStreak;
}

/* =====================================================================
   🔔 打卡提醒（瀏覽器通知）
   ===================================================================== */
function initReminder() {
  const btn = document.getElementById('reminderBtn');
  btn.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      alert('您的瀏覽器不支援通知功能');
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      alert('✅ 提醒已開啟！每天晚上 8 點會提醒您打卡。');
      scheduleReminder();
    } else {
      alert('❌ 通知權限被拒絕，請在瀏覽器設定中開啟。');
    }
  });

  // 如果已經授權，啟動排程
  if (Notification.permission === 'granted') {
    scheduleReminder();
  }
}

function scheduleReminder() {
  // 每分鐘檢查一次是否到了 20:00
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 20 && now.getMinutes() === 0 && now.getSeconds() < 30) {
      new Notification('💪 運動打卡提醒', {
        body: '今天運動了嗎？快上來打卡吧！',
        icon: '🏆',
      });
    }
  }, 30000);
}

/* =====================================================================
   📱 PWA — Service Worker 註冊
   ===================================================================== */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
}
