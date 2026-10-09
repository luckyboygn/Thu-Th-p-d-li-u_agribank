import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');

for (const s of wb.SheetNames) {
  const ws = wb.Sheets[s];
  const data = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  console.log(`=== Sheet: ${s} (${data.length} rows) ===`);
  // Print rows that have unit names or codes
  const sample = data.slice(0, 15);
  sample.forEach((r, idx) => {
    if (r && r.length > 0) {
      console.log(`  [${idx}]:`, r.filter((x: any) => x !== null && x !== undefined).slice(0, 5));
    }
  });
}
