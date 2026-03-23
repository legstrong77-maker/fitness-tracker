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

  // 讀取網址的參數
  const urlParams = new URLSearchParams(window.location.search);
  const paramName = urlParams.get('name');
  const paramMonth = urlParams.get('month');

  let shouldAutoGenerate = false;
  
  if (paramName && names.includes(paramName)) {
    nameSelect.value = paramName;
    shouldAutoGenerate = true;
  }
  if (paramMonth && months.includes(paramMonth)) {
    monthSelect.value = paramMonth;
    shouldAutoGenerate = true;
  }

  // Add event listener only once
  if (!document.getElementById('generateBtn').dataset.bound) {
    document.getElementById('generateBtn').addEventListener('click', generateReport);
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadAndUploadPDF);
    document.getElementById('shareLineBtn').addEventListener('click', shareToLine); // LINE Share Hook
    document.getElementById('generateBtn').dataset.bound = 'true';
  }

  // 如果有帶入 URL 參數，自動觸發產生報告
  if (shouldAutoGenerate && nameSelect.value && monthSelect.value) {
    generateReport();
  }
}

// 實作分享至 LINE 邏輯
function shareToLine() {
  const currentUrl = encodeURIComponent(window.location.href);
  const name = document.getElementById('nameSelect').value;
  const text = encodeURIComponent(`快來看看 ${name} 的每月運動成果回顧！✨\n`);
  
  // 開啟 LINE 分享指定畫面
  window.open(`https://line.me/R/msg/text/?${text}${currentUrl}`, '_blank');
}

async function generateReport() {
  const name = document.getElementById('nameSelect').value;
  const month = document.getElementById('monthSelect').value;
  
  if (!name || !month) return alert('請先選擇成員與月份！');

  // 更新網址列以供分享，但不重新整理網頁
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('name', name);
  newUrl.searchParams.set('month', month);
  window.history.pushState({path: newUrl.href}, '', newUrl.href);

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
  
  // 暫時加上匯出模式，關閉毛玻璃以免渲染成灰塊，並給予實體深色底
  document.body.classList.add('pdf-export-mode');
  document.documentElement.classList.add('pdf-export-mode');
  element.style.background = '#0f172a';
  element.style.padding = '30px';
  element.style.borderRadius = '16px';

  // 解決 PDF 截斷問題 (捲動到頂部重設 viewport 高度)
  window.scrollTo(0, 0);
  const elementWidth = element.scrollWidth;
  const elementHeight = element.scrollHeight;

  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     filename,
    image:        { type: 'jpeg', quality: 1 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      backgroundColor: '#0f172a', 
      logging: false,
      scrollY: 0,
      width: elementWidth,
      height: elementHeight,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    // 預載圖片以防空白，並且使用安全的圖片 Proxy 繞過 Google Drive 跨域限制
    const imgs = element.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img => {
      const originalSrc = img.src;
      img.dataset.originalSrc = originalSrc; // 記住原本的網址，以利事後復原
      
      // 替換為 wsrv.nl 專門用來處理圖片跨域的穩定服務
      if (originalSrc.includes('drive.google.com') && !originalSrc.includes('wsrv.nl')) {
        img.crossOrigin = "anonymous";
        img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(originalSrc);
      }

      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = () => {
          img.src = originalSrc; // 失敗時退回原位
          resolve();
        };
      });
    }));

    // 1. 取得 Base64
    const pdfBase64 = await html2pdf().set(opt).from(element).outputPdf('datauristring');
    
    // 2. 默默背景上傳
    const payload = {
      action: 'uploadPDF',
      name: name,
      month: month,
      pdfBase64: pdfBase64
    };
    
    // 完全不跳出警告、不等待完成 (默默儲存)
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    }).catch(e => console.log(e));

    // 3. 觸發本地下載
    btn.innerHTML = '⬇️ 下載中...';
    await html2pdf().set(opt).from(element).save();

  } catch(err) {
    console.error(err);
  } finally {
    // 復原 DOM 的樣式與圖片網址，確保網頁維持正常運作
    document.body.classList.remove('pdf-export-mode');
    document.documentElement.classList.remove('pdf-export-mode');
    element.style.background = '';
    element.style.padding = '';
    element.style.borderRadius = '';
    
    const imgs = element.querySelectorAll('img');
    imgs.forEach(img => {
      if (img.dataset.originalSrc) {
        img.removeAttribute('crossorigin');
        img.src = img.dataset.originalSrc;
      }
    });

    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}
