const fs = require('fs');
const path = require('path');

/**
 * Utility script to transform any bank CSV directly into Origin format via Node.js
 * Usage: node convert-to-origin.js <input-csv-path> [output-csv-path] [default-account-name]
 */

function parseCSVLine(line, delimiter) {
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
}

function extractMerchantName(desc) {
  let cleaned = (desc || '').replace(/#\d+|\bSQ\b|\bTST\b|\bPAYPAL\b|\bINC\b|\bLLC\b|\bSTORE\b/gi, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 3).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Merchant';
}

function convertToOriginCSV(inputFilePath, outputFilePath, accountName = 'My Bank') {
  if (!fs.existsSync(inputFilePath)) {
    console.error(`Input file not found: ${inputFilePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFilePath, 'utf-8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l);

  if (lines.length === 0) {
    console.error('File is empty');
    process.exit(1);
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase());

  let dateIdx = headers.findIndex(h => h.includes('date'));
  let descIdx = headers.findIndex(h => h.includes('description') || h.includes('payee') || h.includes('name') || h.includes('title') || h.includes('transaction'));
  let merchantIdx = headers.findIndex(h => h.includes('merchant'));
  let amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('total') || h.includes('debit') || h.includes('value'));
  let catIdx = headers.findIndex(h => h.includes('category'));

  const outputRows = [];
  // Origin exact header:
  outputRows.push('Transaction Date;Merchant;Category (optional);Account;Description;Notes (optional);Amount;Tags (optional)');

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter);
    if (cols.length < 2) continue;

    const rawDate = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split('T')[0];
    const desc = descIdx >= 0 && cols[descIdx] ? cols[descIdx] : (cols[1] || 'Transaction');
    const merchant = merchantIdx >= 0 && cols[merchantIdx] ? cols[merchantIdx] : extractMerchantName(desc);
    const category = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : 'Financial';
    
    let amount = 0;
    if (amountIdx >= 0 && cols[amountIdx]) {
      amount = parseFloat(cols[amountIdx].replace(/[\$\s,]/g, '')) || 0;
    }

    const formattedRow = [
      rawDate,
      `"${merchant.replace(/"/g, '""')}"`,
      `"${category.replace(/"/g, '""')}"`,
      `"${accountName.replace(/"/g, '""')}"`,
      `"${desc.replace(/"/g, '""')}"`,
      '""',
      amount.toFixed(2),
      '""'
    ].join(';');

    outputRows.push(formattedRow);
  }

  const defaultOutPath = outputFilePath || path.join(path.dirname(inputFilePath), `origin-converted-${path.basename(inputFilePath)}`);
  fs.writeFileSync(defaultOutPath, outputRows.join('\n'), 'utf-8');
  console.log(`Successfully converted ${outputRows.length - 1} transactions to Origin format: ${defaultOutPath}`);
}

const args = process.argv.slice(2);
if (args.length > 0) {
  convertToOriginCSV(args[0], args[1], args[2]);
}

module.exports = { convertToOriginCSV };
