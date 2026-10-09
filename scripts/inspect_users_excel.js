const xlsx = require('xlsx');

try {
  const wb = xlsx.readFile('sample_data/master_users.xlsx');
  console.log('Sheets:', wb.SheetNames);
  for (const s of wb.SheetNames) {
    const data = xlsx.utils.sheet_to_json(wb.Sheets[s]);
    console.log(`Sheet "${s}" has ${data.length} rows`);
    if (data.length > 0) {
      console.log('Sample row 0:', data[0]);
      console.log('Sample row 1:', data[1]);
    }
  }
} catch (e) {
  console.error('Error reading master_users.xlsx:', e.message);
}
