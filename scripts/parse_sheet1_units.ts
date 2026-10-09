import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const sheet1 = wb.Sheets['Sheet1'];
const sheet1Rows = xlsx.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];

console.log('Total units in Sheet1:', sheet1Rows.length);

// Parse all 155 units from Sheet1
const units = sheet1Rows.map(r => {
  const code = String(r[0]).trim();
  const rawName = String(r[1]).trim();
  // Name format is often "5400_CN Lâm Đồng" or "9300_Cambodia Branch" or "1090_Chi nhánh Bến Thành"
  let name = rawName;
  if (name.includes('_')) {
    name = name.split('_').slice(1).join('_').trim();
  }
  // Standardize name to "Agribank Chi nhánh ..."
  if (name.startsWith('CN ')) {
    name = 'Agribank Chi nhánh ' + name.substring(3).trim();
  } else if (name.startsWith('Chi nhánh ')) {
    name = 'Agribank ' + name;
  } else if (!name.startsWith('Agribank ')) {
    name = 'Agribank Chi nhánh ' + name;
  }
  return {
    code,
    rawName,
    standardName: name,
    account: `${code}_Admin`
  };
});

console.log('Sample parsed:');
units.slice(0, 10).forEach(u => console.log(u));
