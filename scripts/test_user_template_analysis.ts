import * as xlsx from 'xlsx';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('--- TEST PARSER THỰC TẾ TRÊN MẪU CỦA USER ---');

const sampleCsv = `PHỤ LỤC I. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI TẤT CẢ CÁC ĐƠN VỊ,,,,,,,,,,,,,
PHỤ LỤC I.1. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI NGƯỜI LAO ĐỘNG THỬ VIỆC,,,,,,,,,,,,,
,,,,,,,,,,,,,
STT,"Vị trí \nchức danh",Tên chuyên đề,Hình thức đào tạo,Thời lượng đào tạo,Lộ trình đào tạo ,Năng lực,"Hoàn thành \ncác chuyên đề đào tạo","Đáp ứng chứng chỉ/chứng nhận\nđào tạo",Đã học,Đăng ký học năm 2027,,,
1,LĐTV,Tổng quan Agribank (*),Trực tuyến,1 giờ,0-2 tháng thử việc, NLC,Tổng quan Agribank,"Người lao động\nthử việc",,15,,,
2,LĐTV,Điều lệ Agribank,Trực tuyến,1 giờ,, NLC,Điều lệ Agribank,,,20,,,
Tổng thời gian đào tạo,,,,6,5 giờ,,,,,,,,,
PHỤ LỤC I.3. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI NHÂN VIÊN,,,,,,,,,,,,,
STT,"Vị trí \nchức danh",Tên chuyên đề,"Hình thức\nđào tạo","Thời lượng\nđào tạo","Lộ trình\nđào tạo ",Năng lực,"Chứng chỉ/chứng nhận \nđào tạo","Chứng chỉ/\nchứng nhận đào tạo khi quy hoạch ở vị trí cao hơn","Chứng chỉ/\nchứng nhận đào tạo khi bổ nhiệm ở vị trí cao hơn","Chứng chỉ/\nchứng nhận đào tạo khi bổ nhiệm lại",Đã học (số lượng),Đăng ký học năm 2027 (số lượng),Đăng ký học năm 2027 (họ tên)
1,NVC,Kỹ năng lập kế hoạch và tổ chức công việc,Trực tuyến,1 giờ,0-1 năm,NLC,Kỹ năng lập kế hoạch và tổ chức công việc,x,x ,,,,25,"Nguyễn Văn A, Trần Thị B"
`;

const wb = xlsx.read(sampleCsv, { type: 'string' });
const ws = wb.Sheets[wb.SheetNames[0]];
const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

let currentProgram = '';
let colMap: any = null;
const detectedTopics: any[] = [];

for (const row of matrix) {
  if (!Array.isArray(row) || row.length === 0) continue;
  const rowStr = row.map(c => String(c).trim()).filter(Boolean).join(' ');
  if (!rowStr) continue;

  // Kiểm tra dòng tiêu đề Phụ Lục (Khung chương trình)
  if (rowStr.toUpperCase().includes('PHỤ LỤC') || rowStr.toUpperCase().includes('PHU LUC')) {
    const firstCell = String(row[0] || row[1] || '').trim();
    if (firstCell.toUpperCase().startsWith('PHỤ LỤC') || firstCell.toUpperCase().startsWith('PHU LUC')) {
      currentProgram = firstCell;
      colMap = null; // reset header map for new block
      continue;
    }
  }

  // Kiểm tra dòng Header cột (chứa 'Tên chuyên đề')
  const isHeaderRow = row.some(c => String(c).toLowerCase().includes('tên chuyên đề') || String(c).toLowerCase().includes('ten chuyen de'));
  if (isHeaderRow) {
    colMap = {};
    row.forEach((cell, idx) => {
      const cellLower = String(cell).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
      if (cellLower.includes('ten chuyen de') || cellLower.includes('chuyen de')) colMap.topicIdx = idx;
      if (cellLower.includes('vi tri') || cellLower.includes('chuc danh')) colMap.positionIdx = idx;
      if (cellLower.includes('dang ky') && (cellLower.includes('so luong') || cellLower.includes('2027')) && !cellLower.includes('ho ten') && !cellLower.includes('danh sach')) {
        colMap.countIdx = idx;
      }
      if (cellLower.includes('ho ten') || cellLower.includes('danh sach')) colMap.namesIdx = idx;
      if (cellLower.includes('da hoc')) colMap.completedIdx = idx;
    });
    continue;
  }

  // Nếu đang trong block có colMap và có topicIdx
  if (colMap && colMap.topicIdx !== undefined) {
    const topicName = String(row[colMap.topicIdx] || '').trim();
    // Bỏ qua dòng tổng cộng hoặc rỗng
    if (!topicName || topicName.toLowerCase().startsWith('tổng') || topicName.toLowerCase().startsWith('tong')) continue;

    const countVal = colMap.countIdx !== undefined ? row[colMap.countIdx] : '';
    const countNum = parseInt(String(countVal).replace(/[^0-9]/g, '')) || 0;
    const namesVal = colMap.namesIdx !== undefined ? String(row[colMap.namesIdx] || '').trim() : '';

    if (countNum > 0) {
      detectedTopics.push({
        program: currentProgram,
        topicName,
        count: countNum,
        attendees: namesVal
      });
    }
  }
}

console.log('Detected topics from user raw template:');
console.log(JSON.stringify(detectedTopics, null, 2));

// Kiểm tra khớp với CSDL
for (const dt of detectedTopics) {
  const matched = db.prepare('SELECT id, program_id, topic_name FROM training_program_topics WHERE LOWER(topic_name) = ?').get(dt.topicName.toLowerCase()) as any;
  if (matched) {
    console.log(`✅ Khớp CSDL: Topic ID ${matched.id} - ${matched.topic_name} (Số lượng: ${dt.count})`);
  } else {
    console.log(`❌ Chưa khớp CSDL: ${dt.topicName}`);
  }
}
