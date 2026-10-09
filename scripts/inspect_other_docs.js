const xlsx = require('xlsx');

function check(f) {
  try {
    const wb = xlsx.readFile(f);
    console.log(f, wb.SheetNames);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
    console.log('Rows 1-5:');
    rows.slice(0, 5).forEach((r, i) => console.log(i, r.filter(Boolean)));
  } catch(e) {
    console.log('Error reading', f, e.message);
  }
}

check('C:/Users/NGOCNGUYEN/Documents/Danh sách cán bộ.xlsx');
check('C:/Users/NGOCNGUYEN/Documents/DANH SACH.xlsx');
