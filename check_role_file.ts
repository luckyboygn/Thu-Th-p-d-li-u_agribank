import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Tim file chua chu 'Vai tr' tren Desktop
const desktopFiles = fs.readdirSync('C:\\Users\\NGOCNGUYEN\\Desktop');
const roleFile = desktopFiles.find(f => f.includes('Vai tr') || f.includes('vai tr'));

if (roleFile) {
  const fullPath = path.join('C:\\Users\\NGOCNGUYEN\\Desktop', roleFile);
  console.log('Found role file:', fullPath);
  const wb = xlsx.readFile(fullPath);
  console.log('Sheets:', wb.SheetNames);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('Total rows:', data.length);
  for (let i = 0; i < Math.min(15, data.length); i++) {
    console.log(`Row ${i + 1}:`, data[i]);
  }
} else {
  console.log('No role file found on desktop');
}
