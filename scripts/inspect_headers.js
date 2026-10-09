const xlsx = require('xlsx');

function checkHeaders(f) {
  const wb = xlsx.readFile(f);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  console.log('=== FILE:', f, '===');
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i] || [];
    const text = row.join(' | ');
    if (text.toLowerCase().includes('mã') || text.toLowerCase().includes('họ') || text.toLowerCase().includes('stt')) {
      console.log(`Found candidate header at row ${i + 1}:`, row.filter(Boolean));
    }
  }
}

checkHeaders('C:/Users/NGOCNGUYEN/Documents/Danh sách cán bộ.xlsx');
checkHeaders('C:/Users/NGOCNGUYEN/Documents/DANH SACH.xlsx');
