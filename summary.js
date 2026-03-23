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
  reportSection.classList.add('hidden');

  try {
    // 1. Build Timeline
    const timelineContainer = document.getElementById('timelineContainer');
    timelineContainer.innerHTML = '';
    
    if (checkins.length === 0) {
      timelineContainer.innerHTML = '<p style="color:var(--text-secondary)">這個月沒有打卡紀錄喔！</p>';
    } else {
      const sorted = [...checkins].sort((a, b) => new Date(a.date) - new Date(b.date));
      sorted.forEach(r => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        let html = `<div class="tl-date">${r.date}</div>`;
        if (r.description) html += `<div class="tl-desc">${r.description}</div>`;
        if (r.photoUrl) html += `<img src="${r.photoUrl}" alt="打卡照" class="tl-photo">`;
        
        item.innerHTML = html;
        timelineContainer.appendChild(item);
      });
    }

    // Show the report section immediately
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
