// lottery.js — 獨立抽籤頁面邏輯
const API_URL = 'https://script.google.com/macros/s/AKfycbzYlSFus1TfhKpqFowLRntGFo4bw8aPFizl6_T_iui0076aypwaHeCHJvQzwNlssFqHDA/exec';

let allRecords = [];
let participants = []; // { name, days, probability }
let isSpinning = false;

// ============================================================
//  顏色調色盤 — 用於轉盤分區
// ============================================================
const WHEEL_COLORS = [
  '#6366f1', '#f43f5e', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#10b981', '#a855f7',
  '#e11d48', '#0ea5e9', '#d946ef', '#22c55e', '#eab308',
  '#3b82f6', '#ef4444', '#84cc16', '#64748b', '#c084fc',
];

// ============================================================
//  初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  loadData();
  document.getElementById('lotteryMonthSelect').addEventListener('change', onMonthChange);
  document.getElementById('spinBtn').addEventListener('click', spin);
  document.getElementById('resultCloseBtn').addEventListener('click', closeResult);
  document.getElementById('reSpinBtn').addEventListener('click', () => {
    closeResult();
    setTimeout(() => spin(), 400);
  });
});

// ============================================================
//  資料讀取（同主站邏輯）
// ============================================================
async function loadData() {
  // 先用 cache
  const cached = localStorage.getItem('ft_cached_initial_data');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      allRecords = (data.records || []).map(r => ({ ...r, date: normalizeDate(r.date) }));
      populateMonthSelect();
    } catch (e) { console.error(e); }
  }

  // 背景拉新的
  try {
    const res = await fetch(`${API_URL}?action=getInitialData&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.status === 'ok') {
      allRecords = (data.records || []).map(r => ({ ...r, date: normalizeDate(r.date) }));
      localStorage.setItem('ft_cached_initial_data', JSON.stringify(data));
      populateMonthSelect();
    }
  } catch (err) {
    console.error('資料讀取失敗', err);
  }
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return s;
}

// ============================================================
//  月份選擇器
// ============================================================
function populateMonthSelect() {
  const sel = document.getElementById('lotteryMonthSelect');
  const prev = sel.value;
  const ymSet = new Set();

  allRecords.forEach(r => {
    if (r.date && r.date.length >= 7) ymSet.add(r.date.substring(0, 7));
  });

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ymSet.add(currentYM);

  const months = [...ymSet].sort().reverse();
  sel.innerHTML = '';
  months.forEach(ym => {
    const [y, m] = ym.split('-');
    const opt = document.createElement('option');
    opt.value = ym;
    opt.textContent = `${y} 年 ${parseInt(m)} 月`;
    sel.appendChild(opt);
  });

  // 預設選上個月（通常抽獎是抽上個月的）
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastYM = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  sel.value = months.includes(lastYM) ? lastYM : (prev && months.includes(prev) ? prev : months[0]);

  onMonthChange();
}

// ============================================================
//  當月份改變 → 計算參與者和權重
// ============================================================
function onMonthChange() {
  const ym = document.getElementById('lotteryMonthSelect').value;
  if (!ym) return;

  // 計算每人不重複天數
  const countMap = {};
  for (const rec of allRecords) {
    if (!rec.date.startsWith(ym)) continue;
    if (!countMap[rec.name]) countMap[rec.name] = new Set();
    countMap[rec.name].add(rec.date);
  }

  participants = Object.entries(countMap)
    .map(([name, days]) => ({ name, days: days.size }))
    .sort((a, b) => b.days - a.days);

  const totalDays = participants.reduce((s, p) => s + p.days, 0);
  participants.forEach(p => {
    p.probability = totalDays > 0 ? p.days / totalDays : 0;
  });

  // 更新資訊
  const info = document.getElementById('participantInfo');
  if (participants.length === 0) {
    info.innerHTML = '⚠️ 該月尚無打卡紀錄';
    document.getElementById('spinBtn').disabled = true;
  } else {
    info.innerHTML = `共 <strong>${participants.length}</strong> 人參與，合計 <strong>${totalDays}</strong> 天運動天數`;
    document.getElementById('spinBtn').disabled = false;
  }

  // 畫轉盤
  drawWheel();

  // 權重表
  renderWeightTable(totalDays);
}

// ============================================================
//  轉盤繪製
// ============================================================
function drawWheel(highlightAngle = null) {
  const canvas = document.getElementById('wheelCanvas');
  const size = 500;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  ctx.clearRect(0, 0, size, size);

  if (participants.length === 0) {
    // 空轉盤
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#4a5568';
    ctx.font = '600 18px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('尚無資料', cx, cy);
    return;
  }

  let startAngle = highlightAngle !== null ? highlightAngle : -Math.PI / 2;

  participants.forEach((p, i) => {
    const sliceAngle = p.probability * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    // 扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();

    const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fillStyle = color;
    ctx.fill();

    // 分隔線
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 文字
    const textAngle = startAngle + sliceAngle / 2;
    const textR = r * 0.65;
    const tx = cx + Math.cos(textAngle) * textR;
    const ty = cy + Math.sin(textAngle) * textR;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(textAngle + (textAngle > Math.PI / 2 && textAngle < Math.PI * 1.5 ? Math.PI : 0));

    // 自適應字體大小
    const fontSize = sliceAngle > 0.4 ? 16 : sliceAngle > 0.2 ? 13 : sliceAngle > 0.1 ? 11 : 9;
    ctx.font = `800 ${fontSize}px "Noto Sans TC", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;

    // 顯示名字 + 天數
    const label = sliceAngle > 0.15 ? `${p.name} (${p.days}天)` : p.name;
    ctx.fillText(label, 0, 0);
    ctx.restore();

    startAngle = endAngle;
  });

  // 中心圓
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 28);
  grad.addColorStop(0, '#2d1b69');
  grad.addColorStop(1, '#0f0a2a');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 192, 64, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 外圈裝飾
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
  ctx.lineWidth = 5;
  ctx.stroke();
}

// ============================================================
//  權重表
// ============================================================
function renderWeightTable(totalDays) {
  const tbody = document.getElementById('weightTableBody');
  const card = document.getElementById('weightTable');

  if (participants.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  tbody.innerHTML = '';

  const maxProb = Math.max(...participants.map(p => p.probability));

  participants.forEach((p, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const pct = (p.probability * 100).toFixed(1);
    const barWidth = maxProb > 0 ? (p.probability / maxProb * 100) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-emoji">${rank}</span></td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${p.days} 天</td>
      <td>
        <div class="prob-bar-wrap">
          <div class="prob-bar">
            <div class="prob-bar-fill" style="width: ${barWidth}%"></div>
          </div>
          <span class="prob-text">${pct}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
//  加權抽籤核心
// ============================================================
function weightedRandom() {
  const totalWeight = participants.reduce((s, p) => s + p.days, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < participants.length; i++) {
    rand -= participants[i].days;
    if (rand <= 0) return i;
  }
  return participants.length - 1;
}

// ============================================================
//  轉盤旋轉動畫
// ============================================================
function spin() {
  if (isSpinning || participants.length === 0) return;
  isSpinning = true;

  const btn = document.getElementById('spinBtn');
  btn.querySelector('.spin-btn-text').classList.add('hidden');
  btn.querySelector('.spin-btn-loading').classList.remove('hidden');
  btn.disabled = true;

  // 決定贏家
  const winnerIndex = weightedRandom();

  // 計算贏家在轉盤上的角度範圍
  let winnerStartAngle = 0;
  for (let i = 0; i < winnerIndex; i++) {
    winnerStartAngle += participants[i].probability * 360;
  }
  const winnerEndAngle = winnerStartAngle + participants[winnerIndex].probability * 360;
  const winnerMiddle = winnerStartAngle + (winnerEndAngle - winnerStartAngle) / 2;

  // 指標固定在12點鐘方向（頂部）
  // 轉盤從12點鐘開始畫，winnerMiddle 是從頂部順時針算的角度
  // CSS rotate(X deg) 順時針旋轉後，指標指向原始 (360 - X%360)° 的位置
  // 所以要讓指標指向 winnerMiddle，需要 totalRotation % 360 = (360 - winnerMiddle)
  const randomOffset = (Math.random() - 0.5) * (participants[winnerIndex].probability * 360 * 0.6);
  const targetDeg = 360 - winnerMiddle + randomOffset;

  // 至少轉 5 到 8 圈
  const extraSpins = (5 + Math.floor(Math.random() * 4)) * 360;
  const totalRotation = extraSpins + ((targetDeg % 360) + 360) % 360;

  // 用 CSS animation 驅動旋轉
  const canvas = document.getElementById('wheelCanvas');
  canvas.style.transition = 'none';
  canvas.style.transform = 'rotate(0deg)';

  // Force reflow
  canvas.offsetHeight;

  // 開始旋轉
  canvas.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
  canvas.style.transform = `rotate(${totalRotation}deg)`;

  // 旋轉中加入音效般的震動感
  const spinSound = setInterval(() => {
    if (!isSpinning) { clearInterval(spinSound); return; }
  }, 100);

  // 5秒後顯示結果
  setTimeout(() => {
    clearInterval(spinSound);
    isSpinning = false;

    btn.querySelector('.spin-btn-text').classList.remove('hidden');
    btn.querySelector('.spin-btn-loading').classList.add('hidden');
    btn.disabled = false;

    showResult(participants[winnerIndex]);
  }, 5200);
}

// ============================================================
//  顯示中獎結果
// ============================================================
function showResult(winner) {
  const overlay = document.getElementById('resultOverlay');
  document.getElementById('winnerName').textContent = winner.name;
  document.getElementById('winnerStats').innerHTML =
    `本月運動 <strong style="color:#f0c040;">${winner.days}</strong> 天<br>` +
    `中籤機率：<strong style="color:#00f0ff;">${(winner.probability * 100).toFixed(1)}%</strong>`;

  overlay.classList.add('open');
  spawnConfetti();
}

function closeResult() {
  document.getElementById('resultOverlay').classList.remove('open');
  document.getElementById('confettiContainer').innerHTML = '';
}

// ============================================================
//  🎊 碎紙花特效
// ============================================================
function spawnConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#f0c040', '#ff3070', '#00f0ff', '#8b5cf6', '#34d399', '#f59e0b', '#ec4899'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.width = `${6 + Math.random() * 10}px`;
    piece.style.height = `${6 + Math.random() * 10}px`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDelay = `${Math.random() * 1.5}s`;
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    container.appendChild(piece);
  }
}

// ============================================================
//  背景粒子動畫
// ============================================================
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let w, h;
  const particles = [];
  const PARTICLE_COUNT = 60;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1 + Math.random() * 2,
      alpha: 0.1 + Math.random() * 0.3,
      hue: Math.random() * 360,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${p.alpha})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ============================================================
//  工具
// ============================================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
