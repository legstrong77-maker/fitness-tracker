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

const SPREADSHEET_ID  = ''; // ← ★ 填入您 Google Sheets 的試算表 ID
const DRIVE_FOLDER_ID = ''; // ← ★ 填入您 Google Drive 資料夾的 ID
const SHEET_NAME      = '打卡紀錄';
const CHAT_SHEET_NAME = '聊天室';

// =====================================================================
//  處理 GET 請求（讀取所有紀錄）
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

  if (action === 'getMessages') {
    try {
      const messages = getChatMessages();
      return jsonResponse({ status: 'ok', messages });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  return jsonResponse({ status: 'error', message: 'Unknown action' });
}

// =====================================================================
//  處理 POST 請求（新增打卡紀錄）
// =====================================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'addRecord') {
      const result = addRecord(payload);
      return jsonResponse(result);
    }

    if (payload.action === 'addMessage') {
      const result = addChatMessage(payload);
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
    const mimeType  = photo.split(';')[0].split(':')[1];
    const base64Data = photo.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, `${name}_${date}.jpg`);

    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 轉成可直接顯示的 URL 格式
    const fileId = file.getId();
    photoUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
  }

  // 寫入 Google Sheets
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['時間戳記', '姓名', '說明', '日期', '照片連結']);
    sheet.setFrozenRows(1);
  }

  const timestamp = new Date().toISOString();
  sheet.appendRow([timestamp, name, description || '', date, photoUrl]);

  return { status: 'ok', message: '打卡成功！' };
}

// =====================================================================
//  讀取所有紀錄（從 Sheets）
// =====================================================================
function getAllRecords() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const tz = Session.getScriptTimeZone();
  const records = [];
  for (let i = 1; i < data.length; i++) {
    const [timestamp, name, description, date, photoUrl] = data[i];
    // Sheets 會自動把日期字串轉成 Date 物件，需用 formatDate 轉回 YYYY-MM-DD
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
//  工具：回傳 JSON 並設定 CORS Header
// =====================================================================
function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// =====================================================================
//  聊天室：新增訊息
// =====================================================================
function addChatMessage(payload) {
  const { name, message } = payload;
  if (!name || !message) throw new Error('名字和訊息不得為空');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_SHEET_NAME);
    sheet.appendRow(['時間戳記', '姓名', '訊息']);
    sheet.setFrozenRows(1);
  }

  const timestamp = new Date().toISOString();
  sheet.appendRow([timestamp, name, message]);

  return { status: 'ok' };
}

// =====================================================================
//  聊天室：讀取訊息（最新 80 筆）
// =====================================================================
function getChatMessages() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  // 只取最後 80 筆
  const rows = data.slice(1).slice(-80);
  return rows.map(([timestamp, name, message]) => ({
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
    name: String(name),
    message: String(message),
  }));
}

