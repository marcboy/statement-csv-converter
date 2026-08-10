// StatementFlow - Origin CSV Formatter Engine v2.0
// Output Schema: Transaction Date;Merchant;Category (optional);Account;Description;Notes (optional);Amount;Tags (optional)

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let transactions = [];
let currentFileName = '';

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
  setupEvents();
});

function setupEvents() {
  const fileInput = document.getElementById('fileInput');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnSampleData = document.getElementById('btnSampleData');
  const selectAll = document.getElementById('selectAll');
  const defaultAccountInput = document.getElementById('defaultAccount');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const datePresetSelect = document.getElementById('datePreset');

  // Input file change event
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Account Name Change
  defaultAccountInput.addEventListener('input', () => {
    const defaultAcc = defaultAccountInput.value || 'My Bank';
    transactions.forEach(t => {
      t.account = defaultAcc;
    });
    renderTable();
  });

  // Date Range Listeners
  if (startDateInput) startDateInput.addEventListener('change', () => { if (datePresetSelect) datePresetSelect.value = 'custom'; renderTable(); });
  if (endDateInput) endDateInput.addEventListener('change', () => { if (datePresetSelect) datePresetSelect.value = 'custom'; renderTable(); });
  if (datePresetSelect) datePresetSelect.addEventListener('change', (e) => { applyDatePreset(e.target.value); renderTable(); });

  // Buttons
  btnExportCSV.addEventListener('click', exportToOriginCSV);
  btnSampleData.addEventListener('click', loadSampleData);

  selectAll.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    transactions.forEach(t => t.selected = isChecked);
    renderTable();
  });
}

function showStatus(msg, type = 'success') {
  const statusEl = document.getElementById('parserStatus');
  if (!statusEl) return;
  if (type === 'error') {
    statusEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    statusEl.style.color = 'var(--danger)';
  } else {
    statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
    statusEl.style.color = 'var(--success)';
  }
}

function displaySelectedFileName(fileName) {
  currentFileName = fileName;
  const fileNameText = document.getElementById('fileNameText');
  if (fileNameText) {
    fileNameText.textContent = fileName;
    fileNameText.style.color = '#06b6d4';
  }
}

async function handleFile(file) {
  displaySelectedFileName(file.name);
  showStatus(`Loaded: ${file.name}`, 'success');

  try {
    if (file.name.endsWith('.csv') || file.type === 'text/csv' || file.name.endsWith('.txt')) {
      const text = await file.text();
      parseCSVFile(text);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      await parsePDFFile(file);
    } else {
      const text = await file.text();
      parseRawText(text);
    }
  } catch (err) {
    console.error(err);
    showStatus('Error reading file contents', 'error');
  }
}

function parseCSVFile(csvText) {
  if (!csvText || !csvText.trim()) {
    showStatus('Selected file is empty', 'error');
    return;
  }

  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return;

  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes(';') && (firstLine.split(';').length >= firstLine.split(',').length)) {
    delimiter = ';';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  }

  const splitCSVRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
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
  
  let dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time') || h.includes('day'));
  let merchantIdx = headers.findIndex(h => h.includes('merchant') || h.includes('payee') || h.includes('vendor'));
  let descIdx = headers.findIndex(h => h.includes('description') || h.includes('title') || h.includes('name') || h.includes('memo') || h.includes('item') || h.includes('details') || h.includes('action'));
  let amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('total') || h.includes('price') || h.includes('cost') || h.includes('debit') || h.includes('value'));
  let catIdx = headers.findIndex(h => h.includes('category') || h.includes('type'));
  let accountIdx = headers.findIndex(h => h.includes('account'));
  let notesIdx = headers.findIndex(h => h.includes('notes') || h.includes('memo') || h.includes('comment'));
  let tagsIdx = headers.findIndex(h => h.includes('tags') || h.includes('labels'));

  const parsed = [];
  const defaultAcc = document.getElementById('defaultAccount') ? (document.getElementById('defaultAccount').value || 'My Bank') : 'My Bank';

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]);
    if (cols.length < 1 || (cols.length === 1 && !cols[0])) continue;

    let rawDate = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : '';
    if (!rawDate) {
      for (const col of cols) {
        if (col && /\d{1,4}[\/\.-]\d{1,4}/.test(col)) {
          rawDate = col;
          break;
        }
      }
    }
    if (!rawDate) rawDate = new Date().toISOString().split('T')[0];
    const normalizedDate = normalizeDate(rawDate);

    const rawDesc = descIdx >= 0 && cols[descIdx] ? cols[descIdx] : (cols[1] || cols[0] || 'Transaction');
    const merchant = merchantIdx >= 0 && cols[merchantIdx] ? cols[merchantIdx] : extractMerchantName(rawDesc);
    const category = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : autoCategorizeText(rawDesc);
    const account = accountIdx >= 0 && cols[accountIdx] ? cols[accountIdx] : defaultAcc;
    const notes = notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx] : '';
    const tags = tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx] : '';

    let amount = 0;
    if (amountIdx >= 0 && cols[amountIdx] !== undefined && cols[amountIdx] !== '') {
      const parsedNum = parseFloat(cols[amountIdx].replace(/[\$\s,]/g, ''));
      if (!isNaN(parsedNum)) amount = parsedNum;
    } else {
      for (let c = cols.length - 1; c >= 0; c--) {
        const col = cols[c];
        if (col && /^-?\$?\s*\d+(?:\.\d+)?$/.test(col.replace(/,/g, ''))) {
          const parsedNum = parseFloat(col.replace(/[\$\s,]/g, ''));
          if (!isNaN(parsedNum)) {
            amount = parsedNum;
            break;
          }
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
      tags: tags,
      selected: true
    });
  }

  if (parsed.length > 0) {
    transactions = parsed;
    renderTable();
    showStatus(`Parsed ${parsed.length} rows successfully`, 'success');
  } else {
    parseRawText(csvText);
  }
}

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

    parseRawText(fullText);
  } catch (err) {
    console.error('PDF error:', err);
    showStatus('Error reading PDF file', 'error');
  }
}

function parseRawText(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  const defaultAcc = document.getElementById('defaultAccount') ? (document.getElementById('defaultAccount').value || 'My Bank') : 'My Bank';
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
        let isDebit = numVal < 0 || line.includes('-') || line.toUpperCase().includes('DR') || line.toUpperCase().includes('DEBIT');
        if (line.toUpperCase().includes('CREDIT') || line.toUpperCase().includes('DEPOSIT') || line.includes('+')) {
          isDebit = false;
        }

        numVal = Math.abs(numVal);
        if (isDebit) numVal = -numVal;

        let desc = line.replace(rawDate, '').replace(amtStr, '').replace(/\s+/g, ' ').trim();
        desc = desc.replace(/^[-\:\,\s]+|[规律-\:\,\s]+$/g, '');
        if (!desc) desc = 'Transaction';

        parsed.push({
          id: generateId(),
          date: normalizedDate,
          merchant: extractMerchantName(desc),
          category: autoCategorizeText(desc),
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
    showStatus(`Extracted ${parsed.length} transactions`, 'success');
  }
}

function extractMerchantName(desc) {
  let cleaned = (desc || '').replace(/#\d+|\bSQ\b|\bTST\b|\bPAYPAL\b|\bINC\b|\bLLC\b|\bSTORE\b/gi, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Merchant';
}

function autoCategorizeText(desc) {
  const lower = (desc || '').toLowerCase();
  for (const rule of categoryRules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return rule.category;
      }
    }
  }
  return 'Financial';
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

function applyDatePreset(preset) {
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  if (!startDateInput || !endDateInput) return;

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

function getFilteredTransactions() {
  const startDateVal = document.getElementById('startDate') ? document.getElementById('startDate').value : '';
  const endDateVal = document.getElementById('endDate') ? document.getElementById('endDate').value : '';

  return transactions.filter(t => {
    if (startDateVal && t.date && t.date < startDateVal) return false;
    if (endDateVal && t.date && t.date > endDateVal) return false;
    return true;
  });
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = getFilteredTransactions();
  const txCount = document.getElementById('txCount');
  if (txCount) txCount.textContent = `${filtered.length} transactions`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="10">
          <div class="empty-message">
            <i class="fa-solid fa-filter"></i>
            <p>No transactions match the selected filters or file.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  filtered.forEach(t => {
    const tr = document.createElement('tr');
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
        <input type="text" class="cell-input" value="${escapeHtml(t.notes)}" data-field="notes" data-id="${t.id}">
      </td>
      <td>
        <input type="number" step="0.01" class="cell-input mono ${amountColorClass}" value="${t.amount}" data-field="amount" data-id="${t.id}">
      </td>
      <td>
        <input type="text" class="cell-input" value="${escapeHtml(t.tags)}" data-field="tags" data-id="${t.id}">
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
        renderTable();
      }
    });
  });

  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const tx = transactions.find(item => item.id === id);
      if (tx) tx.selected = e.target.checked;
    });
  });

  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      transactions = transactions.filter(t => t.id !== id);
      renderTable();
    });
  });
}

// Export strictly matching origin-transaction-template.csv
function exportToOriginCSV() {
  if (!transactions || transactions.length === 0) {
    alert('Please select or upload a CSV file first before exporting!');
    return;
  }

  const filtered = getFilteredTransactions();
  const selectedTx = filtered.filter(t => t.selected !== false);
  
  if (selectedTx.length === 0) {
    alert('No transactions match the current date filter!');
    return;
  }

  let csvRows = [];
  csvRows.push('Transaction Date;Merchant;Category (optional);Account;Description;Notes (optional);Amount;Tags (optional)');

  selectedTx.forEach(t => {
    const formattedDate = t.date || '';
    const merchant = (t.merchant || '').replace(/"/g, '""');
    const category = (t.category || '').replace(/"/g, '""');
    const account = (t.account || 'My Bank').replace(/"/g, '""');
    const description = (t.description || '').replace(/"/g, '""');
    const notes = (t.notes || '').replace(/"/g, '""');
    const amount = (typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0).toFixed(2);
    const tags = (t.tags || '').replace(/"/g, '""');

    csvRows.push(`${formattedDate};"${merchant}";"${category}";"${account}";"${description}";"${notes}";${amount};"${tags}"`);
  });

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'origin-transaction-template.csv');
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);

  showStatus(`Exported ${selectedTx.length} rows to Origin format!`, 'success');
}

function loadSampleData() {
  displaySelectedFileName('demo-sample-statement.csv');
  const sampleCSV = `Date,Description,Amount
2026-08-01,WALMART GROCERY STORE #142,-124.50
2026-08-02,TECH CORP PAYROLL DIRECT DEPOSIT,3250.00
2026-08-03,STARBUCKS COFFEE,-5.75
2026-08-04,NETFLIX MONTHLY SUBSCRIPTION,-15.99
2026-08-05,SHELL GAS STATION,-45.00
2026-08-06,ORIGIN SUBSCRIPTION,-12.99`;
  
  parseCSVFile(sampleCSV);
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
