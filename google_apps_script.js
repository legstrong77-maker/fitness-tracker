// =====================================================================
//  運動打卡網站 — Google Apps Script 後端
//  ★ 使用說明：
//    1. 新增一份空白 Google Sheets，從網址列複製試算表 ID
//       (網址中 /d/ 和 /edit 之間那段英數字)
//    2. 開啟 script.google.com，新增專案，貼上全部程式碼
//    3. 填入下方三個常數：SPREADSHEET_ID、DRIVE_FOLDER_ID
//    4. 按「部署」→「新增部署作業」→類型選「網頁應用程式」
//       - 以我的身分執行
//       - 存取權限：所有人 (Anyone, even anonymous)
//    5. 複製部署後的 URL，貼到 script.js 的 API_URL 變數
// =====================================================================

const SPREADSHEET_ID = '1Pac4pEMac3QEru2lRPpA0CLpfsESy0c_2MxzwusbGaY'; // ← ★ 填入您 Google Sheets 的試算表 ID
const DRIVE_FOLDER_ID = '1DHxk7d44WOPYuU4GCgje-y8nCwDV62o-'; // ← ★ 填入您 Google Drive 資料夾的 ID
const SHEET_NAME = '打卡紀錄';
const CONFIG_SHEET_NAME = '系統設定';

// =====================================================================
//  LINE Bot 設定 (若不使用請保持引號內空白)
// =====================================================================
const LINE_CHANNEL_ACCESS_TOKEN = ''; // ← ★ 填入您的 LINE Channel Access Token
const LINE_TARGET_ID = ''; // ← ★ 填入推播目標的 Group ID、Room ID 或 User ID

// =====================================================================
//  處理 GET 請求
// =====================================================================
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getRecords') {
    try {
      const records = getAllRecords();
      return jsonResponse({ status: 'ok', records });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  if (action === 'getConfigs') {
    try {
      const configs = getConfigs();
      return jsonResponse({ status: 'ok', configs });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  if (action === 'getInitialData') {
    try {
      const records = getAllRecords();
      const configs = getConfigs();
      return jsonResponse({ status: 'ok', records, configs });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  return jsonResponse({ status: 'error', message: 'Unknown action' });
}

// =====================================================================
//  處理 POST 請求
// =====================================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 若收到的是 LINE Webhook 傳來的事件，則交由 LINE 專用函式處理
    if (payload.events) {
      return handleLineWebhook(payload.events);
    }

    if (payload.action === 'addRecord') {
      const result = addRecord(payload);
      return jsonResponse(result);
    }

    if (payload.action === 'setConfig') {
      const result = setConfigValue(payload.key, payload.value);
      return jsonResponse(result);
    }

    if (payload.action === 'deleteRecord') {
      const result = deleteRecord(payload);
      return jsonResponse(result);
    }

    if (payload.action === 'generateGeminiSummary') {
      const result = generateGeminiSummary(payload);
      return jsonResponse(result);
    }

    if (payload.action === 'generateGeminiSummary') {
      const result = generateGeminiSummary(payload);
      return jsonResponse(result);
    }

    return jsonResponse({ status: 'error', message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// =====================================================================
//  新增紀錄（寫入 Sheets + 上傳照片到 Drive）
// =====================================================================
function addRecord(payload) {
  const { name, description, date, photo } = payload;

  if (!name) throw new Error('名字不能為空');

  // 上傳圖片至 Google Drive
  let photoUrl = '';
  if (photo && photo.startsWith('data:image')) {
    const mimeType = photo.split(';')[0].split(':')[1];
    const base64Data = photo.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, `${name}_${date}.jpg`);

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 轉成可直接顯示的 URL 格式
    const fileId = file.getId();
    photoUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
  }

  // 寫入 Google Sheets
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['時間戳記', '姓名', '說明', '日期', '照片連結']);
    sheet.setFrozenRows(1);
  }

  const timestamp = new Date().toISOString();
  sheet.appendRow([timestamp, name, description || '', date, photoUrl]);
  SpreadsheetApp.flush(); // 強制將剛剛新增的資料寫入試算表，避免稍後讀取時讀不到

  // 推播至 LINE
  const configs = getConfigs();
  const token = LINE_CHANNEL_ACCESS_TOKEN || configs['LINE_CHANNEL_ACCESS_TOKEN'];
  const targetId = LINE_TARGET_ID || configs['LINE_TARGET_ID'];
  let lineDebug = '等待 LINE 推播結果';

  if (token && targetId) {
    try {
      lineDebug = sendLineNotification(name, date, description, token, targetId);
    } catch (e) {
      console.log('LINE Push Error: ' + e.toString());
      lineDebug = e.toString();
    }
  } else {
    lineDebug = '未設定 Token 或 群組 ID';
  }

  return { status: 'ok', message: '打卡成功！', lineDebug: lineDebug };
}

// =====================================================================
//  讀取所有紀錄
// =====================================================================
function getAllRecords() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const tz = Session.getScriptTimeZone();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    const [timestamp, name, description, date, photoUrl] = data[i];
    const dateStr = date instanceof Date
      ? Utilities.formatDate(date, tz, 'yyyy-MM-dd')
      : String(date);
    const tsStr = timestamp instanceof Date
      ? timestamp.toISOString()
      : String(timestamp);
    records.push({
      timestamp: tsStr,
      name: String(name),
      description: String(description),
      date: dateStr,
      photoUrl: String(photoUrl),
    });
  }
  return records;
}

// =====================================================================
//  刪除紀錄（從 Sheets 移除該列）
// =====================================================================
function deleteRecord(payload) {
  const { timestamp, name, date } = payload;
  if (!timestamp || !name) throw new Error('缺少刪除所需的識別資訊');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('找不到打卡紀錄工作表');

  const data = sheet.getDataRange().getValues();
  // 尋找符合 timestamp, name, date 的列 (注意：data 索引 0 是第一列標題)
  // Sheets 中的日期與時間可能被轉為 Date 物件，需轉成字串比對
  let rowIndexToDelete = -1;
  const tz = Session.getScriptTimeZone();

  for (let i = 1; i < data.length; i++) {
    const rowTs = data[i][0] instanceof Date ? data[i][0].toISOString() : String(data[i][0]);
    const rowName = String(data[i][1]);
    const rowDate = data[i][3] instanceof Date ? Utilities.formatDate(data[i][3], tz, 'yyyy-MM-dd') : String(data[i][3]);

    // 寬鬆比對：如果 timestamp 和 name 皆吻合
    if (rowTs === timestamp && rowName === name) {
      rowIndexToDelete = i + 1; // Apps Script 的列數是從 1 開始，陣列索引 i 已經平移，但 i=1 是第 2 列
      break;
    }
  }

  if (rowIndexToDelete > 1) { // 避免刪到標題
    sheet.deleteRow(rowIndexToDelete);
    return { status: 'ok', message: '紀錄已徹底刪除' };
  } else {
    throw new Error('找不到指定的紀錄，可能已被刪除');
  }
}

// =====================================================================
//  設定儲存 (Key-Value)
// =====================================================================
function getConfigs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const configs = {};
  for (let i = 0; i < data.length; i++) {
    const [key, value] = data[i];
    if (key && typeof key === 'string') {
      const safeKey = key.trim();
      const safeValue = (typeof value === 'string') ? value.trim() : value;
      configs[safeKey] = safeValue;
    }
  }
  return configs;
}

function setConfigValue(key, value) {
  if (!key) throw new Error('Key 不能為空');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
  }

  const data = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(value);
  } else {
    sheet.appendRow([key, value]);
  }
  return { status: 'ok' };
}

// =====================================================================
//  工具：回饋 JSON
// =====================================================================
function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// =====================================================================
//  傳送 LINE 推播訊息
// =====================================================================
function sendLineNotification(name, date, description, token, targetId) {
  // 1. 取得統計資料 (第幾位打卡、連續幾天)
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let todayCount = 0;
  const userDates = {}; 
  const tz = 'Asia/Taipei'; // 強制使用台北時區，避免 Google 預設紐約時區導致日期減一天
  
  // 從 i=1 開始跳過標題行
  for (let i = 1; i < data.length; i++) {
    const rName = String(data[i][1]).trim();
    const rDateRaw = data[i][3];
    let rDateStr = '';
    
    if (rDateRaw) {
      // 終極無敵防呆日期轉換
      const parsedDate = new Date(rDateRaw);
      if (!isNaN(parsedDate.getTime())) {
        rDateStr = Utilities.formatDate(parsedDate, 'Asia/Taipei', 'yyyy-MM-dd');
      } else {
        rDateStr = String(rDateRaw).trim().replace(/\//g, '-').substring(0, 10);
      }
    }
    
    // 如果日期相同，計入今日打卡人數
    if (rDateStr === date) {
      todayCount++;
    }
    
    // 記錄這個人的打卡日期 (算連續天數用)
    if (rName === name) {
      userDates[rDateStr] = true;
    }
  }
  
  // 以防萬一，確保今天的日期有被記錄
  if (!userDates[date]) {
    userDates[date] = true;
  }
  
  // 計算連續天數 (由今天往回推算)
  let consecutiveDays = 0;
  // 將字串手動轉換成 Date，避免時區問題
  const parts = date.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const checkDate = new Date(y, m - 1, d);
  
  while (true) {
    const checkStr = Utilities.formatDate(checkDate, tz, 'yyyy-MM-dd');
    if (userDates[checkStr]) {
      consecutiveDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // 2. 格式化日期與星期 (例如: 3/19 (四))
  let shortDate = `${m}/${d}`;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekdayObj = new Date(y, m - 1, d);
  let weekdayStr = `(${weekdays[weekdayObj.getDay()]})`;

  // 3. 隨機鼓勵小語
  const encouragements = [
    "表現很好喔！繼續保持 🔥",
    "太讚啦！請收下我的膝蓋 🙇‍♂️",
    "無能人敵！你是今天的運動達人 🏆",
    "持之以恆就是勝利！💪",
    "這意志力太驚人了！🚀",
    "汗水是不會背叛你的！💦"
  ];
  const randEncourage = encouragements[Math.floor(Math.random() * encouragements.length)];

  // 4. 組合最終訊息內容
  // 格式範例：3/19 (四) 今天第4位打卡為 泥鰍 跑步30min。 連續3天運動，表現很好喔
  const descText = description ? ` ${description}` : '';
  const textMsg = `${shortDate} ${weekdayStr} 今天第${todayCount}位打卡為 ${name}${descText}。\n連續${consecutiveDays}天運動，${randEncourage}`;

  const targetIds = String(targetId).split(',').map(id => id.trim()).filter(id => id);
  let finalResponse = '';

  for (const tid of targetIds) {
    const payload = {
      to: tid,
      messages: [{ type: 'text', text: textMsg }]
    };

    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
    finalResponse += response.getContentText() + '\n';
  }
  return finalResponse.trim();
}

// =====================================================================
//  處理 LINE Webhook (自動綁定群組 ID)
// =====================================================================
function handleLineWebhook(events) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'message' && event.message.type === 'text') {
      const source = event.source;
      let targetId = '';
      if (source.type === 'group') targetId = source.groupId;
      else if (source.type === 'room') targetId = source.roomId;
      else targetId = source.userId;

      // 當使用者在群組說「綁定打卡」，就自動記錄這個 ID
      if (event.message.text === '綁定打卡') {
        const configs = getConfigs();
        const currentTargetsStr = String(configs['LINE_TARGET_ID'] || '').trim();
        let targets = currentTargetsStr ? currentTargetsStr.split(',').map(id => id.trim()).filter(id => id) : [];
        
        let replyMsg = '';
        if (!targets.includes(targetId)) {
          targets.push(targetId);
          setConfigValue('LINE_TARGET_ID', targets.join(','));
          replyMsg = `✅ 群組綁定成功！此群組已加入推播清單。目前共有 ${targets.length} 個群組接收通知。`;
        } else {
          replyMsg = `✅ 此群組之前已經在綁定名單中囉！目前共有 ${targets.length} 個群組接收通知。`;
        }
        
        const token = LINE_CHANNEL_ACCESS_TOKEN || configs['LINE_CHANNEL_ACCESS_TOKEN'];
        const replyToken = event.replyToken;
        
        if (token && replyToken) {
          UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            payload: JSON.stringify({
              replyToken: replyToken,
              messages: [{ type: 'text', text: replyMsg }]
            }),
            muteHttpExceptions: true
          });
        }
      } else if (event.message.text === '解除綁定') {
        const configs = getConfigs();
        const currentTargetsStr = String(configs['LINE_TARGET_ID'] || '').trim();
        let targets = currentTargetsStr ? currentTargetsStr.split(',').map(id => id.trim()).filter(id => id) : [];
        
        let replyMsg = '';
        if (targets.includes(targetId)) {
          targets = targets.filter(id => id !== targetId);
          setConfigValue('LINE_TARGET_ID', targets.join(','));
          replyMsg = `🚫 已成功解除綁定！這個群組將不再接收打卡推播。目前剩餘 ${targets.length} 個群組接收通知。`;
        } else {
          replyMsg = `🚫 這個群組目前沒有綁定推播紀錄喔！`;
        }
        
        const token = LINE_CHANNEL_ACCESS_TOKEN || configs['LINE_CHANNEL_ACCESS_TOKEN'];
        const replyToken = event.replyToken;
        
        if (token && replyToken) {
          UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'post',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            payload: JSON.stringify({
              replyToken: replyToken,
              messages: [{ type: 'text', text: replyMsg }]
            }),
            muteHttpExceptions: true
          });
        }
      }
    }
  }
  return ContentService.createTextOutput('OK');
}

// =====================================================================
//  呼叫 Gemini AI 產生每月回顧
// =====================================================================
function generateGeminiSummary(payload) {
  const { name, month, records } = payload;
  if (!name || !month || !records) {
    throw new Error('缺少產生回顧所需的參數(name, month, records)');
  }

  const configs = getConfigs();
  const apiKey = configs['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('系統尚未設定 GEMINI_API_KEY，無法呼叫 AI 產生評語。');
  }

  // 組合 Prompt
  let promptText = `請你扮演一位專業且熱情的健身教練。以下是 ${name} 在 ${month} 月份每一天的運動打卡紀錄（包含日期與說明）：\n\n`;
  
  if (records.length === 0) {
    promptText += "這個月沒有任何打卡紀錄。\n";
  } else {
    records.sort((a, b) => new Date(a.date) - new Date(b.date));
    records.forEach((r, idx) => {
      promptText += `${idx + 1}. 日期: ${r.date}, 紀錄: ${r.description || '無特別說明'}\n`;
    });
  }

  promptText += `\n請根據這些打卡內容，寫下一段給 ${name} 的月底評語。評語應包含：
1. 本月運動表現總結與肯定
2. 針對此運動情況給予具體的專業建議
3. 溫暖且充滿幹勁的鼓勵話語
請使用繁體中文，語氣自然、誠懇且充滿活力，並直接稱呼對方，使用 markdown 語法加強排版。`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey;
  const requestBody = {
    contents: [{
      parts: [{
        text: promptText
      }]
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error('Gemini API 錯誤: ' + json.error.message);
  }

  let advice = '';
  if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
    advice = json.candidates[0].content.parts[0].text;
  } else {
    throw new Error('無法從 Gemini 取得有效的建議。');
  }

  return { status: 'ok', advice: advice };
}
