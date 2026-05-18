// ============================================================
// MENU — add-on entry points
// ============================================================
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createAddonMenu()          // places it under Extensions > Phone Cleaner
    .addItem('Open Sidebar', 'showSidebar')
    .addSeparator()
    .addItem('Configure Master Sheet', 'showConfigDialog')
    .addToUi();
}

// Called once when the add-on is first installed from the marketplace / manual install
function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Phone Cleaner')
    .setWidth(340);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showConfigDialog() {
  const ui = SpreadsheetApp.getUi();
  const current = getMasterSheetId();
  const result = ui.prompt(
    'Configure Master Sheet',
    'Paste the Master Sheet URL or ID:\n(Current: ' + (current || 'not set') + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    const input = result.getResponseText().trim();
    if (input) {
      try {
        const msg = initMasterSheet(input);
        ui.alert(msg);
      } catch (e) {
        ui.alert('Error: ' + e.message);
      }
    }
  }
}

// ============================================================
// SCRIPT PROPERTIES
// ============================================================
const MASTER_ID_KEY = 'masterSheetId';

function getMasterSheetId() {
  return PropertiesService.getUserProperties().getProperty(MASTER_ID_KEY);
}

function setMasterSheetId(id) {
  PropertiesService.getUserProperties().setProperty(MASTER_ID_KEY, id);
}

// ============================================================
// MASTER SHEET INIT
// ============================================================
function initMasterSheet(urlOrId) {
  const id = extractSheetId(urlOrId);
  setMasterSheetId(id);

  const ss = SpreadsheetApp.openById(id);

  let master = ss.getSheetByName('Master');
  if (!master) {
    master = ss.insertSheet('Master');
    master.getRange(1, 1, 1, 9).setValues([[
      'number', 'country', 'region', 'batch',
      'source_sheet_id', 'first_seen', 'last_seen',
      'outreach_status', 'opt_out'
    ]]);
    master.getRange(1, 1, 1, 9).setFontWeight('bold');
  }

  let rejects = ss.getSheetByName('Rejects');
  if (!rejects) {
    rejects = ss.insertSheet('Rejects');
    rejects.getRange(1, 1, 1, 5).setValues([[
      'raw_value', 'reason', 'source_sheet_id', 'batch', 'rejected_at'
    ]]);
    rejects.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  let countries = ss.getSheetByName('Countries');
  if (!countries) {
    countries = ss.insertSheet('Countries');
    countries.getRange(1, 1, 1, 6).setValues([[
      'code', 'name', 'prefix', 'valid_lengths', 'strip_leading_zero', 'valid_leading_digits'
    ]]);
    countries.getRange(1, 1, 1, 6).setFontWeight('bold');
    const defaults = [
      ['ID', 'Indonesia',   '+62', '9,10,11,12', 'TRUE',  ''],
      ['SG', 'Singapore',   '+65', '8',          'FALSE', '8,9'],
      ['MY', 'Malaysia',    '+60', '9,10',        'TRUE',  ''],
      ['PH', 'Philippines', '+63', '10',          'TRUE',  ''],
      ['TH', 'Thailand',    '+66', '9',           'TRUE',  ''],
      ['VN', 'Vietnam',     '+84', '9,10',        'TRUE',  ''],
      ['AU', 'Australia',   '+61', '9,10',        'TRUE',  ''],
    ];
    countries.getRange(2, 1, defaults.length, 6).setValues(defaults);

    // Column notes so users know what each field means
    countries.getRange(1, 4).setNote('Comma-separated list of valid local number lengths (digits after country code).\nExample: "8" means exactly 8 digits. "9,10" means 9 or 10 digits.');
    countries.getRange(1, 5).setNote('TRUE = strip a leading 0 before matching length (e.g. 0812 → 812).\nFALSE = use number as-is after removing the country code.');
    countries.getRange(1, 6).setNote(
      'Optional. Comma-separated digits that the local number must START with.\n\n' +
      'Leave BLANK → all leading digits accepted (no restriction).\n' +
      'Set a value → only those digits are valid; anything else is rejected.\n\n' +
      'Example:\n' +
      '  SG = "8,9"  →  +6591234567 ✓  +6581234567 ✓  +6571234567 ✗\n' +
      '  blank       →  any first digit is accepted'
    );
  }

  return 'Master sheet configured. Tabs: Master, Rejects, Countries are ready.';
}

// ============================================================
// COUNTRY RULES
// ============================================================
function loadCountryRules() {
  const id = getMasterSheetId();
  if (!id) throw new Error('Master sheet not configured. Use Phone Cleaner → Configure Master Sheet.');

  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('Countries');
  if (!sheet) throw new Error('Countries tab not found in master sheet.');

  const data = sheet.getDataRange().getValues();
  const rules = {};
  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const code             = String(row[0]).trim();
    const name             = String(row[1]).trim();
    const prefix           = String(row[2]).trim();
    const validLengths     = String(row[3]).trim().split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const stripLeadingZero = String(row[4]).trim().toUpperCase() === 'TRUE';
    const leadingRaw       = String(row[5] || '').trim();
    const validLeadingDigits = leadingRaw ? leadingRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    rules[code] = { code, name, prefix, validLengths, stripLeadingZero, validLeadingDigits };
    list.push({ code, name });
  }

  return { rules, list };
}

// ============================================================
// PHONE CLEANING
// ============================================================
function cleanNumber(raw, defaultCountryCode, rules) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { valid: false, reason: 'no_digits' };

  // Already has + prefix — try to match a known country
  if (raw.trim().startsWith('+')) {
    for (const code in rules) {
      const rule = rules[code];
      const prefixDigits = rule.prefix.replace(/\D/g, '');
      if (digits.startsWith(prefixDigits)) {
        const local = digits.slice(prefixDigits.length);
        if (!rule.validLengths.includes(local.length)) continue;
        if (rule.validLeadingDigits.length > 0 && !rule.validLeadingDigits.includes(local[0])) {
          return { valid: false, reason: 'invalid_leading_digit' };
        }
        return { valid: true, number: '+' + digits, country: code, region: rule.name };
      }
    }
    // Has + but no country matched
    return { valid: false, reason: 'ambiguous_country' };
  }

  // Starts with country prefix digits (no leading zero, no +)
  for (const code in rules) {
    const rule = rules[code];
    const prefixDigits = rule.prefix.replace(/\D/g, '');
    if (digits.startsWith(prefixDigits) && !digits.startsWith('0')) {
      const local = digits.slice(prefixDigits.length);
      if (!rule.validLengths.includes(local.length)) continue;
      if (rule.validLeadingDigits.length > 0 && !rule.validLeadingDigits.includes(local[0])) {
        return { valid: false, reason: 'invalid_leading_digit' };
      }
      return { valid: true, number: '+' + digits, country: code, region: rule.name };
    }
  }

  // Fall back to default country
  if (defaultCountryCode && rules[defaultCountryCode]) {
    const rule = rules[defaultCountryCode];
    let local = digits;
    if (rule.stripLeadingZero && local.startsWith('0')) {
      local = local.slice(1);
    }
    if (!rule.validLengths.includes(local.length)) {
      return { valid: false, reason: 'invalid_length' };
    }
    if (rule.validLeadingDigits.length > 0 && !rule.validLeadingDigits.includes(local[0])) {
      return { valid: false, reason: 'invalid_leading_digit' };
    }
    return { valid: true, number: rule.prefix + local, country: defaultCountryCode, region: rule.name };
  }

  return { valid: false, reason: 'ambiguous_country' };
}

// ============================================================
// MASTER INDEX
// ============================================================
function loadMasterIndex() {
  const id = getMasterSheetId();
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('Master');
  if (!sheet) throw new Error('Master tab not found.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const index = {};

  for (let i = 0; i < data.length; i++) {
    const num = String(data[i][0]).trim();
    if (!num) continue;
    index[num] = {
      row: i + 2,
      outreach_status: String(data[i][7]).trim(),
      opt_out: String(data[i][8]).trim().toUpperCase() === 'TRUE'
    };
  }

  return index;
}

// ============================================================
// BATCH NUMBER
// ============================================================
function getNextBatchNumber() {
  const id = getMasterSheetId();
  if (!id) return 1;
  try {
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheetByName('Master');
    if (!sheet || sheet.getLastRow() < 2) return 1;
    const data = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues();
    let max = 0;
    for (const row of data) {
      const match = String(row[0]).match(/Batch\s+(\d+)/i);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return max + 1;
  } catch (e) {
    return 1;
  }
}

// ============================================================
// SOURCE DATA
// ============================================================
function getSourceData(mode, urlOrId, colIndex) {
  if (mode === 'url') {
    const id = extractSheetId(urlOrId);
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) return { values: [], sourceId: id };
    const col = colIndex || 1;
    const data = sheet.getRange(1, col, lastRow, 1).getValues();
    return { values: data.map(r => String(r[0])), sourceId: id };
  }

  // Selected range in current sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();
  if (!range) throw new Error('No range selected. Select the phone column first, then re-open the sidebar.');
  const sourceId = SpreadsheetApp.getActiveSpreadsheet().getId();
  return { values: range.getValues().map(r => String(r[0])), sourceId };
}

function extractSheetId(urlOrId) {
  if (!urlOrId) throw new Error('URL or ID is required.');
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId.trim();
}

// ============================================================
// SIDEBAR HELPERS (called from client)
// ============================================================
function getInitialData() {
  const today    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  const todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const id = getMasterSheetId();

  if (!id) {
    return { configured: false, today, todayIso, nextBatch: 1, countries: [], selection: null };
  }

  try {
    const { list } = loadCountryRules();
    const nextBatch = getNextBatchNumber();
    const selection = getSelectionInfo();
    return { configured: true, today, todayIso, nextBatch, countries: list, selection };
  } catch (e) {
    return { configured: false, today, nextBatch: 1, countries: [], error: e.message, selection: null };
  }
}

function getSelectionInfo() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const range = sheet.getActiveRange();
    if (!range) return null;
    return {
      sheetName: sheet.getName(),
      a1: range.getA1Notation(),
      numRows: range.getNumRows(),
      colIndex: range.getColumn()
    };
  } catch (e) {
    return null;
  }
}

// ============================================================
// PREVIEW
// ============================================================
function runPreview(params) {
  const { mode, urlOrId, colIndex, defaultCountry, batchLabel } = params;

  const { rules } = loadCountryRules();
  const masterIndex = loadMasterIndex();
  const { values, sourceId } = getSourceData(mode, urlOrId, parseInt(colIndex, 10) || 1);

  const valid = [];
  const rejected = [];
  const seenInBatch = {};

  for (const raw of values) {
    if (!raw || !raw.trim()) continue;

    const parts = raw.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const result = cleanNumber(trimmed, defaultCountry, rules);

      if (!result.valid) {
        rejected.push({ raw: trimmed, reason: result.reason });
        continue;
      }

      const num = result.number;
      if (seenInBatch[num]) continue;
      seenInBatch[num] = true;

      if (masterIndex[num]) {
        if (masterIndex[num].opt_out) continue;
        valid.push({ number: num, country: result.country, region: result.region, status: 'dup' });
      } else {
        valid.push({ number: num, country: result.country, region: result.region, status: 'new' });
      }
    }
  }

  const newCount = valid.filter(v => v.status === 'new').length;
  const dupCount = valid.filter(v => v.status === 'dup').length;
  const total    = valid.length + rejected.length;

  return {
    valid,
    rejected,
    newCount,
    dupCount,
    rejectedCount: rejected.length,
    sourceId,
    warning: total > 5000 ? 'Large batch (' + total + ' numbers) — sync may take several minutes.' : null
  };
}

// ============================================================
// SYNC
// ============================================================
function syncToMaster(params) {
  const { previewData, batchLabel, sourceId } = params;
  const { valid, rejected } = previewData;

  const id = getMasterSheetId();
  const ss = SpreadsheetApp.openById(id);
  const masterSheet  = ss.getSheetByName('Master');
  const rejectsSheet = ss.getSheetByName('Rejects');

  // Reload index fresh to avoid stale row references
  const masterIndex = loadMasterIndex();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  const newRows    = [];
  const dupUpdates = [];

  for (const entry of valid) {
    if (entry.status === 'new') {
      newRows.push([
        entry.number, entry.country, entry.region, batchLabel,
        sourceId, today, today, 'not_sent', 'FALSE'
      ]);
    } else if (entry.status === 'dup') {
      const existing = masterIndex[entry.number];
      if (existing && !existing.opt_out) {
        dupUpdates.push({ row: existing.row, lastSeen: today });
      }
    }
  }

  if (newRows.length > 0) {
    const startRow = masterSheet.getLastRow() + 1;
    masterSheet.getRange(startRow, 1, newRows.length, 9).setValues(newRows);
  }

  for (const upd of dupUpdates) {
    masterSheet.getRange(upd.row, 7).setValue(upd.lastSeen);
  }

  if (rejected.length > 0) {
    const rejRows  = rejected.map(r => [r.raw, r.reason, sourceId, batchLabel, today]);
    const startRow = rejectsSheet.getLastRow() + 1;
    rejectsSheet.getRange(startRow, 1, rejRows.length, 5).setValues(rejRows);
  }

  return {
    newAdded:     newRows.length,
    dupsUpdated:  dupUpdates.length,
    rejectsLogged: rejected.length
  };
}
