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

  const name = document.getElementById('nameSelect').value;
  const month = document.getElementById('monthSelect').value;
  const filename = `${name}_${month}_轉檔回顧.pdf`;
  
  const checkins = allRecords.filter(r => r.name === name && r.date.startsWith(month));
  const sorted = [...checkins].sort((a, b) => new Date(a.date) - new Date(b.date));

  // 建立乾淨、無特效的 DOM 專供 PDF 輸出 (避免 html2canvas 渲染玻璃特效失敗變灰塊)
  const printContainer = document.createElement('div');
  printContainer.style.width = '800px';
  printContainer.style.padding = '40px 60px';
  printContainer.style.background = '#ffffff';
  printContainer.style.color = '#1e293b';
  printContainer.style.fontFamily = 'sans-serif';
  
  let html = `<h1 style="text-align: center; color: #0f172a; margin-bottom: 40px; font-size: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px;">${name} 的運動回顧 (${month.replace('-',' 年 ')} 月)</h1>`;
  
  if (sorted.length === 0) {
    html += `<p style="text-align: center; color: #64748b; font-size: 18px;">這個月沒有任何打卡紀錄喔！</p>`;
  } else {
    sorted.forEach(r => {
      html += `
        <div style="margin-bottom: 40px; border-left: 4px solid #6366f1; padding-left: 20px; page-break-inside: avoid; background: #f8fafc; padding: 20px; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin: 0 0 10px 0; font-size: 22px;">${r.date}</h2>
          <p style="margin: 0 0 15px 0; font-size: 16px; line-height: 1.6; color: #334155;">${r.description || '無特別說明'}</p>
          ${r.photoUrl ? `<img src="${r.photoUrl}" crossorigin="anonymous" style="max-width: 100%; height: auto; max-height: 400px; border-radius: 8px; display: block; margin-top: 10px;">` : ''}
        </div>
      `;
    });
  }

  printContainer.innerHTML = html;
  
  // 掛載到畫面上才能畫出來
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.appendChild(printContainer);
  document.body.appendChild(wrapper);

  const opt = {
    margin:       15,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    // 預載圖片確保不會破圖
    const imgs = printContainer.querySelectorAll('img');
    for (let i = 0; i < imgs.length; i++) {
        await new Promise((resolve) => {
            if (imgs[i].complete) resolve();
            else {
                imgs[i].onload = resolve;
                imgs[i].onerror = resolve; // 即使出錯也繼續
            }
        });
    }

    // 1. 取得 Base64
    const pdfBase64 = await html2pdf().set(opt).from(printContainer).outputPdf('datauristring');
    
    // 2. 默默背景上傳
    const payload = {
      action: 'uploadPDF',
      name: name,
      month: month,
      pdfBase64: pdfBase64
    };
    
    // 不用 await，也不 alert
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    }).catch(e => console.log('Silent upload error', e));

    // 3. 觸發本地下載
    await html2pdf().set(opt).from(printContainer).save();

  } catch(err) {
    console.error(err);
    alert('匯出 PDF 發生錯誤: ' + err.message);
  } finally {
    document.body.removeChild(wrapper);
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}
