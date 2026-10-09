import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');

for (const s of wb.SheetNames) {
  const ws = wb.Sheets[s];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const unitCodes = new Set<string>();
  data.forEach(r => {
    r.forEach((cell: any) => {
      if (typeof cell === 'number' && cell >= 1000 && cell <= 9999) {
        unitCodes.add(String(cell));
      } else if (typeof cell === 'string') {
        const m = cell.match(/\b([1-9][0-9]{3})\b/);
        if (m) unitCodes.add(m[1]);
      }
    });
  });
  console.log(`Sheet "${s}": ${unitCodes.size} unique 4-digit codes`);
}
