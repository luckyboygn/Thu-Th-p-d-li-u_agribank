import * as xlsx from 'xlsx';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('=====================================================');
console.log('   TEST: BÓC TÁCH CHÍNH XÁC MẪU TRẮNG KHẢO SÁT CHUẨN CỦA AGRIBANK');
console.log('=====================================================\n');

function normalizeName(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Giả lập nội dung thực tế do đơn vị điền trên mẫu trắng Agribank
const rawOfficialCsv = `PHỤ LỤC I. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI TẤT CẢ CÁC ĐƠN VỊ,,,,,,,,,,,,,
PHỤ LỤC I.1. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI NGƯỜI LAO ĐỘNG THỬ VIỆC,,,,,,,,,,,,,
,,,,,,,,,,,,,
STT,"Vị trí chức danh",Tên chuyên đề,Hình thức đào tạo,Thời lượng đào tạo,Lộ trình đào tạo ,Năng lực,"Hoàn thành các chuyên đề đào tạo","Đáp ứng chứng chỉ/chứng nhận đào tạo",Đã học,Đăng ký học năm 2027,,,
1,LĐTV,Tổng quan Agribank (*),Trực tuyến,1 giờ,0-2 tháng thử việc, NLC,Tổng quan Agribank,Người lao động thử việc,,15,,,
2,LĐTV,Điều lệ Agribank,Trực tuyến,1 giờ,, NLC,Điều lệ Agribank,,,20,,,
3,LĐTV,Nội quy lao động,Trực tuyến,1 giờ,, NLC,Nội quy lao động,,,,,,
Tổng thời gian đào tạo,,,,6,5 giờ,,,,,,,,,
"(*)Tổng quan Agribank gồm: Lịch sử hình thành, Mô hình tổ chức, Quy chế tổ chức và hoạt động Chi nhánh, Phòng giao dịch",,,,,,,,,,,,,
,,,,,,,,,,,,,
PHỤ LỤC I.3. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHUNG ĐỐI VỚI NHÂN VIÊN,,,,,,,,,,,,,
,,,,,,,,,,,,,
STT,"Vị trí chức danh",Tên chuyên đề,"Hình thức đào tạo","Thời lượng đào tạo","Lộ trình đào tạo ",Năng lực,"Chứng chỉ/chứng nhận đào tạo","Chứng chỉ/chứng nhận đào tạo khi quy hoạch ở vị trí cao hơn","Chứng chỉ/chứng nhận đào tạo khi bổ nhiệm ở vị trí cao hơn","Chứng chỉ/chứng nhận đào tạo khi bổ nhiệm lại",Đã học (số lượng),Đăng ký học năm 2027 (số lượng),Đăng ký học năm 2027 (họ tên)
1,NVC,Kỹ năng lập kế hoạch và tổ chức công việc,Trực tuyến,1 giờ,0-1 năm,NLC,Kỹ năng lập kế hoạch và tổ chức công việc,x,x,,,12,"Nguyễn Văn A, Trần Văn B"
2,NVC,Kỹ năng bán hàng và chăm sóc khách hàng chuyên nghiệp thời kỳ chuyển đổi số ,"Trực tuyến/ Trực tiếp/ Kết hợp","Tối thiểu 2 giờ/Tối đa 2 ngày",0-1 năm,NLC,Kỹ năng bán hàng và chăm sóc khách hàng chuyên nghiệp thời kỳ chuyển đổi số ,x,x,,,8,"Lê Thị C"
PHỤ LỤC II.38. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO THEO VỊ TRÍ CHỨC DANH TRƯỜNG ĐÀO TẠO CÁN BỘ,,,,,,,,,,,,,
STT,"Vị trí chức danh",Tên chuyên đề,"Hình thức đào tạo",Thời lượng đào tạo,"Lộ trình đào tạo ",Năng lực,"Chứng chỉ/chứng nhận đào tạo","Chứng chỉ/chứng nhận đào tạo khi quy hoạch ở vị trí cao hơn","Chứng chỉ/chứng nhận đào tạo khi bổ nhiệm ở vị trí cao hơn","Chứng chỉ/chứng nhận đào tạo khi bổ nhiệm lại",Đã học,Đăng ký học năm 2027,Đăng ký học năm 2027 (họ tên)
1,"TĐTCB. NV, LĐP CHUNG","Phương pháp xây dựng, triển khai kế hoạch đào tạo và cải tiến quy trình đào tạo",Trực tiếp,1 ngày,0-1 năm,NLCM,"Phương pháp xây dựng, triển khai kế hoạch đào tạo và cải tiến quy trình đào tạo",x,x,x,,5,"Phạm Văn D"
`;

// Tải CSDL
const allOfficialPrograms = db.prepare('SELECT id, code, name FROM training_programs').all() as any[];
const allOfficialTopics = db.prepare(`
  SELECT t.id, t.program_id, t.topic_name, p.code as program_code, p.name as program_name
  FROM training_program_topics t
  JOIN training_programs p ON t.program_id = p.id
`).all() as any[];

const topicMapByNorm = new Map<string, any[]>();
for (const t of allOfficialTopics) {
  const k = normalizeName(t.topic_name);
  if (!topicMapByNorm.has(k)) topicMapByNorm.set(k, []);
  topicMapByNorm.get(k)!.push(t);
}

// Parser đa năng hỗ trợ cả dạng bảng đơn lẫn dạng nhiều block xếp chồng
function parseRawSheetMatrix(matrix: any[][]) {
  let currentProgramId: number | null = null;
  let currentProgramObj: any = null;
  let colMap: any = null;
  const parsedRecords: any[] = [];

  for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
    const row = matrix[rIdx];
    if (!Array.isArray(row) || row.length === 0) continue;
    console.log(`[ROW ${rIdx}]`, row);

    const rowStr = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');
    if (!rowStr) continue;

    // 1. Kiểm tra dòng Tiêu đề Khung Chương trình / Phụ lục
    const firstCell = String(row[0] || row[1] || '').trim();
    const upperFirst = firstCell.toUpperCase();
    if (upperFirst.includes('PHỤ LỤC') || upperFirst.includes('PHU LUC')) {
      // Tìm trong allOfficialPrograms
      const normCell = normalizeName(firstCell);
      const matchedProg = allOfficialPrograms.find(p => {
        const normPName = normalizeName(p.name);
        const normPCode = normalizeName(p.code);
        return normCell.includes(normPCode) || normPName.includes(normCell) || normCell.includes(normPName);
      });

      if (matchedProg) {
        currentProgramId = matchedProg.id;
        currentProgramObj = matchedProg;
        colMap = null; // reset header mapping cho block mới
        continue;
      }
    }

    // 2. Kiểm tra dòng Header của block (chứa 'Tên chuyên đề')
    const isHeaderRow = row.some(cell => {
      const nCell = normalizeName(String(cell));
      return nCell.includes('ten chuyen de') || nCell.includes('chuyen de dao tao');
    });

    if (isHeaderRow) {
      colMap = {};
      row.forEach((cell, idx) => {
        const nCell = normalizeName(String(cell));
        if ((nCell.includes('ten chuyen de') || nCell === 'chuyen de') && !nCell.includes('hoan thanh') && !nCell.includes('chung chi')) {
          colMap.topicIdx = idx;
        } else if (nCell.includes('dang ky') && (nCell.includes('2027') || nCell.includes('so luong')) && !nCell.includes('ho ten') && !nCell.includes('danh sach')) {
          colMap.countIdx = idx;
        } else if (nCell.includes('ho ten') || nCell.includes('danh sach')) {
          colMap.namesIdx = idx;
        } else if (nCell.includes('da hoc')) {
          colMap.completedIdx = idx;
        }
      });
      continue;
    }

    // 3. Xử lý dòng dữ liệu chuyên đề
    if (colMap && colMap.topicIdx !== undefined) {
      const rawTopicName = String(row[colMap.topicIdx] || '').trim();
      if (!rawTopicName) continue;

      // Bỏ qua dòng tổng kết hoặc chú thích (CHỈ bỏ qua dòng tổng thời gian đào tạo, tổng cộng, không bỏ qua các chuyên đề 'Tổng quan...')
      const nRaw = normalizeName(rawTopicName);
      if (
        nRaw.startsWith('tong thoi gian') ||
        nRaw.startsWith('tong cong') ||
        nRaw.startsWith('tong so ') ||
        nRaw === 'tong' ||
        nRaw.startsWith('ghi chu') ||
        nRaw.startsWith('chu thich') ||
        rawTopicName.startsWith('(*)')
      ) continue;

      // Lấy số lượng đăng ký
      let count = 0;
      if (colMap.countIdx !== undefined && row[colMap.countIdx] !== undefined) {
        const parsed = parseInt(String(row[colMap.countIdx]).replace(/[^0-9]/g, ''));
        if (!isNaN(parsed) && parsed > 0) count = parsed;
      }

      console.log(`[DEBUG rIdx ${rIdx}] Topic: "${rawTopicName}" | countVal: "${row[colMap.countIdx]}" | parsedCount: ${count}`);

      const attendees = colMap.namesIdx !== undefined ? String(row[colMap.namesIdx] || '').trim() : '';

      if (count > 0) {
        // Tìm chuyên đề chuẩn
        const matchedList = topicMapByNorm.get(nRaw);
        let targetTopic: any = null;

        if (matchedList && matchedList.length > 0) {
          if (matchedList.length === 1) {
            targetTopic = matchedList[0];
          } else if (currentProgramId) {
            targetTopic = matchedList.find(t => t.program_id === currentProgramId) || matchedList[0];
          } else {
            targetTopic = matchedList[0];
          }
        }

        parsedRecords.push({
          rawTopicName,
          count,
          attendees,
          programId: targetTopic ? targetTopic.program_id : (currentProgramId || null),
          programCode: targetTopic ? targetTopic.program_code : (currentProgramObj?.code || ''),
          topicId: targetTopic ? targetTopic.id : null,
          isOfficial: !!targetTopic
        });
      }
    }
  }

  return parsedRecords;
}

const wb = xlsx.read(rawOfficialCsv, { type: 'string' });
const ws = wb.Sheets[wb.SheetNames[0]];
const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
const records = parseRawSheetMatrix(matrix);

console.log('Kết quả bóc tách:');
console.log(JSON.stringify(records, null, 2));

let totalParticipants = 0;
records.forEach(r => { totalParticipants += r.count; });
console.log(`\nTổng số chuyên đề có đăng ký: ${records.length}`);
console.log(`Tổng lượt học viên: ${totalParticipants} lượt`);

if (records.length === 5 && totalParticipants === 60) {
  console.log('🎉 BÓC TÁCH 100% CHÍNH XÁC THEO MẪU TRẮNG CHUẨN AGRIBANK!');
  process.exit(0);
} else {
  console.error('❌ Kết quả chưa đạt kỳ vọng!');
  process.exit(1);
}
