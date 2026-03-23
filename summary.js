// summary.js
const API_URL = 'https://script.google.com/macros/s/AKfycbzYlSFus1TfhKpqFowLRntGFo4bw8aPFizl6_T_iui0076aypwaHeCHJvQzwNlssFqHDA/exec';

document.addEventListener('DOMContentLoaded', () => {
  initSummaryData();
});

let allRecords = [];

async function initSummaryData() {
  const cachedData = localStorage.getItem('ft_cached_initial_data');
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      allRecords = data.records || [];
      populateDropdowns();
    } catch (e) {
      console.error('Cache read error:', e);
    }
  }

  // Refetch to ensure we have the latest
  try {
    const res = await fetch(`${API_URL}?action=getInitialData&_t=${new Date().getTime()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.status === 'ok') {
      allRecords = data.records || [];
      localStorage.setItem('ft_cached_initial_data', JSON.stringify(data));
      populateDropdowns();
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

function populateDropdowns() {
  const nameSelect = document.getElementById('nameSelect');
  const monthSelect = document.getElementById('monthSelect');
  
  // Keep current selection if any
  const currentName = nameSelect.value;
  const currentMonth = monthSelect.value;

  const names = [...new Set(allRecords.map(r => r.name))].filter(n => n).sort();
  const months = [...new Set(allRecords.map(r => r.date.substring(0, 7)))].filter(m => m).sort((a,b) => b.localeCompare(a)); 

  let nameHtml = '<option value="">— 選擇成員 —</option>';
  nameHtml += names.map(n => `<option value="${n}">${n}</option>`).join('');
  nameSelect.innerHTML = nameHtml;

  let monthHtml = '<option value="">— 選擇月份 —</option>';
  monthHtml += months.map(m => `<option value="${m}">${m.replace('-', ' 年 ')} 月</option>`).join('');
  monthSelect.innerHTML = monthHtml;

  if (names.includes(currentName)) nameSelect.value = currentName;
  if (months.includes(currentMonth)) monthSelect.value = currentMonth;

  // Add event listener only once
  if (!document.getElementById('generateBtn').dataset.bound) {
    document.getElementById('generateBtn').addEventListener('click', generateReport);
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadAndUploadPDF);
    document.getElementById('generateBtn').dataset.bound = 'true';
  }
}

async function generateReport() {
  const name = document.getElementById('nameSelect').value;
  const month = document.getElementById('monthSelect').value;
  
  if (!name || !month) return alert('請先選擇成員與月份！');

  const btn = document.getElementById('generateBtn');
  const loading = document.getElementById('loadingIndicator');
  const reportSection = document.getElementById('reportSection');
  
  const checkins = allRecords.filter(r => r.name === name && r.date.startsWith(month));

  btn.disabled = true;
  loading.classList.remove('hidden');
  document.getElementById('reportActions').classList.add('hidden');
  reportSection.classList.add('hidden');

  try {
    // 1. Build Timeline
    const timelineContainer = document.getElementById('timelineContainer');
    timelineContainer.innerHTML = '';
    
    if (checkins.length === 0) {
      timelineContainer.innerHTML = '<p style="color:var(--text-secondary)">這個月沒有打卡紀錄喔！</p>';
    } else {
      const sorted = [...checkins].sort((a, b) => new Date(a.date) - new Date(b.date));
      sorted.forEach((r, idx) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.style.animationDelay = `${idx * 0.15}s`;
        
        let html = `<div class="tl-date">${r.date}</div>`;
        if (r.description) html += `<div class="tl-desc">${r.description}</div>`;
        if (r.photoUrl) html += `<img src="${r.photoUrl}" alt="打卡照" class="tl-photo">`;
        
        item.innerHTML = html;
        timelineContainer.appendChild(item);
      });
    }

    // Show the report section immediately
    document.getElementById('reportActions').classList.remove('hidden');
    reportSection.classList.remove('hidden');

  } catch (err) {
    alert('發生錯誤：' + err.message);
  } finally {
    btn.disabled = false;
    loading.classList.add('hidden');
  }
}

function parseMarkdown(text) {
  let html = text
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>');
    
  return `<p>${html}</p>`;
}

async function downloadAndUploadPDF() {
  const btn = document.getElementById('downloadPdfBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ 處理中...';
  btn.disabled = true;

  const element = document.getElementById('reportSection');
  const name = document.getElementById('nameSelect').value;
  const month = document.getElementById('monthSelect').value;
  const filename = `${name}_${month}_轉檔回顧.pdf`;

  const opt = {
    margin:       10,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0f172a' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    // 1. Generate base64
    const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
    
    // 2. Upload to Drive
    btn.innerHTML = '☁️ 正在上傳至 Google Drive...';
    const payload = {
      action: 'uploadPDF',
      name: name,
      month: month,
      pdfBase64: pdfBase64
    };
    
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (data.status === 'ok') {
      alert('已成功備份至 Google Drive！\\n您可以前往 Drive 查看。\\n即將下載檔案至您的裝置。');
    } else {
      console.warn('上傳失敗:', data);
      alert('備份至 Google Drive 失敗（可能是憑證問題），但您仍可下載檔案。');
    }

    // 3. Trigger user download
    btn.innerHTML = '⬇️ 下載中...';
    await html2pdf().set(opt).from(element).save();

  } catch(err) {
    console.error(err);
    alert('匯出 PDF 發生錯誤: ' + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}
