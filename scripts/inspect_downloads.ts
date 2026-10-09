import * as xlsx from 'xlsx';
import path from 'path';

function inspect(filePath: string) {
  try {
    console.log('=== Inspecting:', filePath);
    const wb = xlsx.readFile(filePath);
    console.log('Sheets:', wb.SheetNames);
    for (const s of wb.SheetNames) {
      const data = xlsx.utils.sheet_to_json(wb.Sheets[s], { header: 1 }) as any[][];
      console.log(`Sheet "${s}": ${data.length} rows`);
      for (let i = 0; i < Math.min(10, data.length); i++) {
        if (data[i] && data[i].length > 0) {
          console.log(`  Row ${i}:`, JSON.stringify(data[i].slice(0, 8)));
        }
      }
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

inspect('C:/Users/NGOCNGUYEN/Downloads/Mẫu số 05.xlsx');
inspect('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
