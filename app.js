// StatementFlow App Logic - Origin CSV Transformer
// Outputs exact format matching origin-transaction-template.csv:
// Transaction Date;Merchant;Category (optional);Account;Description;Notes (optional);Amount;Tags (optional)

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
}

let transactions = [];

// Category & Merchant Auto-Detection Rules
const categoryRules = [
  { category: 'Groceries', keywords: ['walmart', 'target', 'kroger', 'trader joe', 'whole foods', 'safeway', 'aldi', 'grocery', 'supermarket', 'costco'] },
  { category: 'Dining', keywords: ['starbucks', 'mcdonald', 'uber eats', 'doordash', 'grubhub', 'cafe', 'restaurant', 'burger', 'pizza', 'dunkin', 'taco'] },
  { category: 'Subscriptions', keywords: ['netflix', 'spotify', 'apple.com', 'google', 'amazon prime', 'hulu', 'github', 'openai', 'chatgpt', 'adobe'] },
  { category: 'Financial', keywords: ['payroll', 'direct deposit', 'salary', 'stipend', 'employer', 'ach deposit', 'dividend', 'interest payment', 'origin'] },
  { category: 'Utilities', keywords: ['electric', 'water', 'gas company', 'comcast', 'verizon', 't-mobile', 'att', 'utility', 'internet', 'insurance'] },
  { category: 'Shopping', keywords: ['amazon', 'ebay', 'best buy', 'nike', 'zara', 'etsy', 'store', 'shop'] },
  { category: 'Transportation', keywords: ['chevron', 'shell', 'exxon', 'bp', 'uber', 'lyft', 'parking', 'transit', 'gasoline', 'fuel'] }
];

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEvents();
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const paneId = tab.getAttribute('data-tab');
      document.getElementById(paneId).classList.add('active');
    });
  });
}

function setupEvents() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnParseText = document.getElementById('btnParseText');
  const btnClearText = document.getElementById('btnClearText');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnAddRow = document.getElementById('btnAddRow');
  const btnSampleData = document.getElementById('btnSampleData');
  const tableSearch = document.getElementById('tableSearch');
  const selectAll = document.getElementById('selectAll');
  const defaultAccountInput = document.getElementById('defaultAccount');
  
  // Format Controls
  document.getElementById('dateFormat').addEventListener('change', renderTable);
  defaultAccountInput.addEventListener('input', () => {
    const defaultAcc = defaultAccountInput.value || 'My Bank';
    transactions.forEach(t => {
      if (!t.account || t.account === 'My Bank') t.account = defaultAcc;
    });
    renderTable();
  });

  // Date Range Controls
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const datePresetSelect = document.getElementById('datePreset');

  startDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    renderTable();
  });
  endDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    renderTable();
  });

  datePresetSelect.addEventListener('change', (e) => {
    applyDatePreset(e.target.value);
    renderTable();
  });

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  btnParseText.addEventListener('click', () => {
    const rawText = document.getElementById('rawTextInput').value;
    if (rawText.trim()) {
      parseRawText(rawText);
    } else {
      showStatus('Please paste statement text or select a file first.', 'error');
    }
  });

  btnClearText.addEventListener('click', () => {
    document.getElementById('rawTextInput').value = '';
  });

  btnExportCSV.addEventListener('click', exportToOriginCSV);

  btnAddRow.addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    const defaultAcc = document.getElementById('defaultAccount').value || 'My Bank';
    transactions.unshift({
      id: generateId(),
      date: today,
      merchant: 'New Merchant',
      category: 'Uncategorized',
      account: defaultAcc,
      description: 'Manual Entry',
      notes: '',
      amount: -10.00,
      tags: '',
      selected: true
    });
    renderTable();
  });

  btnSampleData.addEventListener('click', loadSampleData);

  tableSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    renderTable(query);
  });

  selectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    transactions.forEach(t => t.selected = isChecked);
    renderTable();
  });
}

function showStatus(msg, type = 'success') {
  const statusEl = document.getElementById('parserStatus');
  if (type === 'error') {
    statusEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    statusEl.style.color = 'var(--danger)';
  } else {
    statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
    statusEl.style.color = 'var(--success)';
  }
}

// Handle Uploaded File (CSV, TXT, or PDF)
async function handleFile(file) {
  showStatus(`Processing file: ${file.name}...`, 'success');
  if (file.name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    parseCSVFile(text);
  } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    await parsePDFFile(file);
  } else {
    const text = await file.text();
    parseRawText(text);
  }
}

// Parse existing CSV Files (Amex, Apple Card, Chase, standard bank CSVs)
function parseCSVFile(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return;

  // Auto-detect delimiter (, or ;)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  
  // Helper to split CSV row handling quotes
  const splitCSVRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase());
  
  // Find column indices
  let dateIdx = headers.findIndex(h => h.includes('date'));
  let descIdx = headers.findIndex(h => h.includes('description') || h.includes('payee') || h.includes('name') || h.includes('title') || h.includes('transaction'));
  let merchantIdx = headers.findIndex(h => h.includes('merchant'));
  let amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('total') || h.includes('debit') || h.includes('value'));
  let catIdx = headers.findIndex(h => h.includes('category'));
  let accountIdx = headers.findIndex(h => h.includes('account'));
  let notesIdx = headers.findIndex(h => h.includes('notes') || h.includes('memo'));

  const parsed = [];
  const defaultAcc = document.getElementById('defaultAccount').value || 'My Bank';

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split('T')[0];
    const normalizedDate = normalizeDate(rawDate);

    const rawDesc = descIdx >= 0 && cols[descIdx] ? cols[descIdx] : (cols[1] || 'Transaction');
    const merchant = merchantIdx >= 0 && cols[merchantIdx] ? cols[merchantIdx] : extractMerchantName(rawDesc);
    const category = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : autoCategorizeText(rawDesc);
    const account = accountIdx >= 0 && cols[accountIdx] ? cols[accountIdx] : defaultAcc;
    const notes = notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx] : '';

    let amount = 0;
    if (amountIdx >= 0 && cols[amountIdx]) {
      amount = parseFloat(cols[amountIdx].replace(/[\$\s,]/g, '')) || 0;
    } else {
      // search for numerical value in cols
      for (const col of cols) {
        const parsedNum = parseFloat(col.replace(/[\$\s,]/g, ''));
        if (!isNaN(parsedNum) && col.includes('.')) {
          amount = parsedNum;
          break;
        }
      }
    }

    parsed.push({
      id: generateId(),
      date: normalizedDate,
      merchant: merchant,
      category: category,
      account: account,
      description: rawDesc,
      notes: notes,
      amount: amount,
      tags: '',
      selected: true
    });
  }

  if (parsed.length > 0) {
    transactions = parsed;
    renderTable();
    showStatus(`Successfully parsed ${parsed.length} rows from CSV!`, 'success');
  } else {
    // Fallback to text parsing if column parsing didn't match
    parseRawText(csvText);
  }
}

// PDF Parser using PDF.js
async function parsePDFFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      let lastY = null;
      let pageText = '';

      for (const item of textContent.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      fullText += pageText + '\n';
    }

    document.getElementById('rawTextInput').value = fullText;
    parseRawText(fullText);
    showStatus(`Successfully extracted text from ${pdf.numPages} PDF pages`, 'success');
  } catch (err) {
    console.error('PDF parsing error:', err);
    showStatus('Failed to read PDF. Try copying & pasting into Text tab.', 'error');
  }
}

// Parse Raw Text
function parseRawText(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  const defaultAcc = document.getElementById('defaultAccount').value || 'My Bank';

  const dateRegex = /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?)\b/i;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.length < 5) continue;

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const rawDate = dateMatch[0];
      const normalizedDate = normalizeDate(rawDate);

      const amounts = Array.from(line.matchAll(/[\+\-]?\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}\b/g));
      
      if (amounts.length > 0) {
        const amtStr = amounts[0][0];
        let numVal = parseFloat(amtStr.replace(/[\$\s,]/g, ''));

        let isDebit = numVal < 0 || line.includes('-') || line.toUpperCase().includes('DR') || line.toUpperCase().includes('DEBIT') || line.toUpperCase().includes('PAYMENT');
        if (line.toUpperCase().includes('CREDIT') || line.toUpperCase().includes('DEPOSIT') || line.includes('+')) {
          isDebit = false;
        }

        numVal = Math.abs(numVal);
        if (isDebit) numVal = -numVal;

        let desc = line.replace(rawDate, '').replace(amtStr, '').replace(/\s+/g, ' ').trim();
        desc = desc.replace(/^[-\:\,\s]+|[规律-\:\,\s]+$/g, '');
        if (!desc) desc = 'Transaction';

        const merchant = extractMerchantName(desc);
        const category = autoCategorizeText(desc);

        parsed.push({
          id: generateId(),
          date: normalizedDate,
          merchant: merchant,
          category: category,
          account: defaultAcc,
          description: desc,
          notes: '',
          amount: numVal,
          tags: '',
          selected: true
        });
      }
    }
  }

  if (parsed.length > 0) {
    transactions = parsed;
    renderTable();
    showStatus(`Extracted ${parsed.length} transactions successfully!`, 'success');
  } else {
    showStatus('Could not parse text. Ensure text includes dates and amounts.', 'error');
  }
}

// Extract Merchant Name from Raw Description
function extractMerchantName(desc) {
  let cleaned = desc.replace(/#\d+|\bSQ\b|\bTST\b|\bPAYPAL\b|\bINC\b|\bLLC\b|\bSTORE\b/gi, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Merchant';
}

function autoCategorizeText(desc) {
  const lower = desc.toLowerCase();
  for (const rule of categoryRules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return rule.category;
      }
    }
  }
  return 'Uncategorized';
}

function normalizeDate(raw) {
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr, format) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const [yyyy, mm, dd] = parts;
  switch (format) {
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'YYYY-MM-DD':
    default:
      return dateStr;
  }
}

// Helper for Date Presets
function applyDatePreset(preset) {
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');

  if (preset === 'all') {
    startDateInput.value = '';
    endDateInput.value = '';
    return;
  }

  const now = new Date();
  let start = new Date();
  let end = new Date();

  switch (preset) {
    case 'this-month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last-month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'this-year':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    case 'last-30':
      start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      end = now;
      break;
    case 'last-90':
      start = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
      end = now;
      break;
  }

  startDateInput.value = start.toISOString().split('T')[0];
  endDateInput.value = end.toISOString().split('T')[0];
}

// Filter transactions by query & date range
function getFilteredTransactions(filterQuery = '') {
  const startDateVal = document.getElementById('startDate') ? document.getElementById('startDate').value : '';
  const endDateVal = document.getElementById('endDate') ? document.getElementById('endDate').value : '';

  return transactions.filter(t => {
    // Text search query
    if (filterQuery) {
      const matchText = t.merchant.toLowerCase().includes(filterQuery) ||
                        t.description.toLowerCase().includes(filterQuery) ||
                        t.category.toLowerCase().includes(filterQuery) ||
                        t.account.toLowerCase().includes(filterQuery) ||
                        t.date.includes(filterQuery);
      if (!matchText) return false;
    }

    // Date range filtering
    if (startDateVal && t.date < startDateVal) return false;
    if (endDateVal && t.date > endDateVal) return false;

    return true;
  });
}

// Render Transactions Table for Origin Template
function renderTable(filterQuery = '') {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  const dateFormatSetting = document.getElementById('dateFormat').value;

  const filtered = getFilteredTransactions(filterQuery);

  document.getElementById('txCount').textContent = `${filtered.length} transactions`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="8">
          <div class="empty-message">
            <i class="fa-solid fa-filter"></i>
            <p>No transactions found matching the selected date range or search filter.</p>
          </div>
        </td>
      </tr>`;
    updateSummary([]);
    return;
  }

  filtered.forEach(t => {
    const tr = document.createElement('tr');
    const displayAmount = (t.amount >= 0 ? '+' : '') + '$' + Math.abs(t.amount).toFixed(2);
    const amountColorClass = t.amount < 0 ? 'text-danger' : 'text-success';

    tr.innerHTML = `
      <td>
        <input type="checkbox" class="row-checkbox" ${t.selected ? 'checked' : ''} data-id="${t.id}">
      </td>
      <td>
        <input type="date" class="cell-input mono" value="${t.date}" data-field="date" data-id="${t.id}">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(t.merchant)}" data-field="merchant" data-id="${t.id}">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(t.category)}" data-field="category" data-id="${t.id}">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(t.account)}" data-field="account" data-id="${t.id}">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(t.description)}" data-field="description" data-id="${t.id}">
      </td>
      <td>
        <input type="number" step="0.01" class="cell-input mono ${amountColorClass}" value="${t.amount}" data-field="amount" data-id="${t.id}">
      </td>
      <td>
        <button class="btn-icon btn-delete" data-id="${t.id}" title="Delete Row">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach Inline Edit Handlers
  tbody.querySelectorAll('.cell-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const field = e.target.getAttribute('data-field');
      let val = e.target.value;

      const tx = transactions.find(item => item.id === id);
      if (tx) {
        if (field === 'amount') {
          tx.amount = parseFloat(val) || 0;
        } else {
          tx[field] = val;
        }
        renderTable(filterQuery);
      }
    });
  });

  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const tx = transactions.find(item => item.id === id);
      if (tx) tx.selected = e.target.checked;
      updateSummary(filtered);
    });
  });

  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      transactions = transactions.filter(t => t.id !== id);
      renderTable(filterQuery);
    });
  });

  updateSummary(filtered);
}

function updateSummary(list) {
  let debits = 0;
  let credits = 0;

  list.forEach(t => {
    if (t.selected) {
      if (t.amount < 0) debits += Math.abs(t.amount);
      else credits += t.amount;
    }
  });

  const net = credits - debits;

  document.getElementById('sumDebits').textContent = '-$' + debits.toFixed(2);
  document.getElementById('sumCredits').textContent = '+$' + credits.toFixed(2);
  
  const netEl = document.getElementById('netBalance');
  netEl.textContent = (net >= 0 ? '+' : '-') + '$' + Math.abs(net).toFixed(2);
  netEl.className = 'stat-value ' + (net >= 0 ? 'text-success' : 'text-danger');
}

// Export strictly in Origin Template Format for currently filtered date range & selected rows:
function exportToOriginCSV() {
  const query = document.getElementById('tableSearch') ? document.getElementById('tableSearch').value.toLowerCase() : '';
  const filteredList = getFilteredTransactions(query);
  const selectedTx = filteredList.filter(t => t.selected);

  if (selectedTx.length === 0) {
    alert('No transactions selected within the chosen date range to export!');
    return;
  }

  const delimiter = document.getElementById('csvDelimiter').value || ';';
  const dateFormat = document.getElementById('dateFormat').value || 'YYYY-MM-DD';

  let csvRows = [];

  // Header
  csvRows.push(['Transaction Date', 'Merchant', 'Category (optional)', 'Account', 'Description', 'Notes (optional)', 'Amount', 'Tags (optional)'].join(delimiter));

  selectedTx.forEach(t => {
    const formattedDate = formatDate(t.date, dateFormat);
    const merchant = `"${(t.merchant || '').replace(/"/g, '""')}"`;
    const category = `"${(t.category || '').replace(/"/g, '""')}"`;
    const account = `"${(t.account || 'My Bank').replace(/"/g, '""')}"`;
    const description = `"${(t.description || '').replace(/"/g, '""')}"`;
    const notes = `"${(t.notes || '').replace(/"/g, '""')}"`;
    const amount = t.amount.toFixed(2);
    const tags = `"${(t.tags || '').replace(/"/g, '""')}"`;

    csvRows.push([formattedDate, merchant, category, account, description, notes, amount, tags].join(delimiter));
  });

  const startDateVal = document.getElementById('startDate').value;
  const endDateVal = document.getElementById('endDate').value;
  let dateTag = 'all_dates';
  if (startDateVal || endDateVal) {
    dateTag = `${startDateVal || 'start'}_to_${endDateVal || 'end'}`;
  }

  const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
  const link = document.createElement('a');
  link.setAttribute('href', csvContent);
  link.setAttribute('download', `origin_transactions_${dateTag}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showStatus(`Exported ${selectedTx.length} transactions (${dateTag}) to Origin CSV!`, 'success');
}

function loadSampleData() {
  const sampleCSV = `Date,Description,Amount
08/01/2026,WALMART GROCERY STORE #142,-124.50
08/02/2026,TECH CORP PAYROLL DIRECT DEPOSIT,3250.00
08/03/2026,STARBUCKS COFFEE,-5.75
08/04/2026,NETFLIX MONTHLY SUBSCRIPTION,-15.99
08/05/2026,SHELL GAS STATION,-45.00
08/06/2026,ORIGIN SUBSCRIPTION,-12.99`;
  
  parseCSVFile(sampleCSV);
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
