import * as xlsx from 'xlsx';

const wb = xlsx.readFile('C:/Users/NGOCNGUYEN/Downloads/Danh sách thi nghiệp vụ vòng 2 - chốt.xlsx');
console.log('Props:', wb.Props);
const sheet = wb.Sheets['Sheet1'];
console.log('Ref:', sheet['!ref']);
console.log('Cell A1:', sheet['A1']);
console.log('Cell B1:', sheet['B1']);
