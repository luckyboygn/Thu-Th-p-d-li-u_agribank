import * as xlsx from 'xlsx';

function test(p: string) {
  try {
    const wb = xlsx.readFile(p);
    console.log('File:', p);
    console.log('Sheets:', wb.SheetNames);
    for (const s of wb.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[s], { header: 1 }) as any[][];
      console.log(`Sheet "${s}" has ${rows.length} rows`);
      if (rows.length > 0) {
        console.log('Row 0:', rows[0]);
        console.log('Row 1:', rows[1]);
        if (rows.length > 2) console.log('Row 2:', rows[2]);
      }
    }
  } catch (e: any) {
    console.error(p, 'Error:', e.message);
  }
}

test('C:/Users/NGOCNGUYEN/Documents/Book1.xlsx');
test('C:/Users/NGOCNGUYEN/Documents/DANH SACH.xlsx');
test('C:/Users/NGOCNGUYEN/Documents/833.xlsx');
