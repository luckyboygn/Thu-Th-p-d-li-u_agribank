const xlsx = require('xlsx');
const path = require('path');

function inspectFile(filePath) {
  console.log(`\n========================================`);
  console.log(`INSPECTING: ${filePath}`);
  console.log(`========================================`);
  const workbook = xlsx.readFile(filePath);
  console.log('Sheet Names:', workbook.SheetNames);

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: "${sheetName}" ---`);
    const worksheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    console.log(`Range: rows ${range.s.r + 1} to ${range.e.r + 1}, cols ${range.s.c + 1} to ${range.e.c + 1}`);

    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    console.log(`Total rows read: ${rawData.length}`);

    // Print first 15 rows to find header row and structure
    console.log('First 15 rows:');
    rawData.slice(0, 15).forEach((row, idx) => {
      // filter non-null or preview
      const nonEmpty = row.map((c, i) => c !== null ? `[Col ${i}]: ${c}` : null).filter(Boolean);
      if (nonEmpty.length > 0) {
        console.log(`Row ${idx + 1}: ${JSON.stringify(nonEmpty)}`);
      } else {
        console.log(`Row ${idx + 1}: <EMPTY>`);
      }
    });
  }
}

inspectFile(path.join(__dirname, '..', 'sample_data', 'master_users.xlsx'));
inspectFile(path.join(__dirname, '..', 'sample_data', 'unit_submission_laocai.xlsx'));
