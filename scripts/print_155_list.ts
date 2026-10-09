import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
const sheet1 = wb.Sheets['Sheet1'];
const sheet1Rows = xlsx.utils.sheet_to_json(sheet1, { header: 1 }) as any[][];

const unitByCode = new Map<string, string>();
sheet1Rows.forEach(r => {
  const code = String(r[0]).trim();
  const raw = String(r[1]).trim();
  let name = raw;
  if (name.includes('_')) {
    name = name.split('_').slice(1).join('_').trim();
  }
  if (name.startsWith('CN ')) {
    name = 'Agribank Chi nhánh ' + name.substring(3).trim();
  } else if (name.startsWith('Chi nhánh ')) {
    name = 'Agribank ' + name;
  } else if (!name.startsWith('Agribank ')) {
    name = 'Agribank Chi nhánh ' + name;
  }
  unitByCode.set(code, name);
});

const orderedCodes = [
  // 1-25 (K01 & K02 - Miền Bắc)
  '2500', '2501', '8600', '3200', '3203', '2600', '2603', '8300', '8900', '8200',
  '2900', '2906', '2300', '2311', '2100', '2112', '2111', '3000', '2400', '2407',
  '7800', '8400', '8800', '8802', '3300',
  // 26-43
  '3303', '2700', '2707', '8000', '8003', '8090', '7900', '7902', '3400', '3401',
  '8500', '8501', '8100', '2800', '2890', '8700', '8702', '1080',
  // 44-70 (Hà Nội)
  '1440', '1500', '1507', '3140', '1504', '3120', '2200', '2203', '1505', '1401',
  '1240', '1303', '1482', '1400', '1220', '2802', '1410', '1200', '3160', '1508',
  '1506', '1300', '3180', '1305', '1302', '3100', '2208',
  // 71-97 (K04 - Bắc Trung Bộ, K05 - Duyên hải NTB & Tây Nguyên, Huế, Đà Nẵng)
  '5200', '5219', '4300', '4800', '5300', '5000', '5020', '3700', '3701', '4700',
  '5100', '5400', '5402', '3600', '3611', '3601', '4900', '4600', '3800', '3801',
  '4200', '4500', '3900', '3500', '3519', '3590', '4000',
  // 98-127 (Đà Nẵng, K07 - TP.HCM)
  '2000', '2001', '1606', '6321', '6440', '1090', '6200', '6380', '6110', '6180',
  '6420', '1602', '6170', '6300', '6120', '6280', '6140', '6421', '1603', '6160',
  '6340', '1604', '6222', '1600', '6360', '6460', '6320', '6100', '1700', '1900',
  // 128-155 (Đông Nam Bộ, ĐBSCL, Campuchia)
  '6700', '6000', '7200', '7100', '5500', '5600', '5601', '7500', '1800', '5900',
  '5990', '5911', '6500', '7000', '5590', '7700', '7709', '6600', '6612', '6603',
  '7790', '7600', '5700', '6900', '7400', '7300', '6090', '9300'
];

orderedCodes.forEach((code, idx) => {
  const name = unitByCode.get(code)!;
  console.log(`${idx + 1}\t${code}_Admin\t${name}`);
});
