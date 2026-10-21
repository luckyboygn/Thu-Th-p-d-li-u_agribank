import * as xlsx from 'xlsx';
import { normalizeText } from './unit-matcher';

export interface ParsedTopicData {
  count: number;
  completedCount?: number;
  topicInfo: any;
  attendees?: string;
  notes?: string;
}

export interface ParsedProgramData {
  program: any;
  topics: Map<number, ParsedTopicData>;
}

export interface ParsedProposal {
  proposal_name: string;
  target_audience?: string;
  expected_duration?: string;
  participant_count: number;
  delivery_method?: string;
  faculty_source?: string;
  notes?: string;
}

export interface ParseExcelResult {
  programsDataMap: Map<number, ParsedProgramData>;
  proposalsList: ParsedProposal[];
  totalRowsProcessed: number;
  programsSummary: Array<{
    programId: number;
    programCode: string;
    programName: string;
    groupName: string;
    topicCount: number;
    totalParticipants: number;
    totalCompleted?: number;
  }>;
  totalInFrameworkTopics: number;
  totalInFrameworkParticipants: number;
  totalCompletedParticipants: number;
  totalProposalParticipants: number;
  grandTotalParticipants: number;
  warnings: string[];
}

export function parseTrainingDemandExcel(
  workbook: xlsx.WorkBook,
  allOfficialPrograms?: any[],
  allOfficialTopics?: any[]
): ParseExcelResult {
  if (!allOfficialPrograms || !allOfficialTopics) {
    try {
      const { getDatabase } = require('./db');
      const db = getDatabase();
      if (!allOfficialPrograms) {
        allOfficialPrograms = db.prepare('SELECT id, code, name, category_type FROM training_programs').all() as any[];
      }
      if (!allOfficialTopics) {
        allOfficialTopics = db.prepare(`
          SELECT t.id, t.program_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
                 t.learning_path, t.competency, t.certificate_requirement,
                 t.cert_planning_higher, t.cert_appoint_higher, t.cert_reappoint,
                 p.code as program_code, p.name as program_name
          FROM training_program_topics t
          JOIN training_programs p ON t.program_id = p.id
        `).all() as any[];
      }
    } catch (e: any) {
      if (!allOfficialPrograms) allOfficialPrograms = [];
      if (!allOfficialTopics) allOfficialTopics = [];
    }
  }

  // Bản đồ tra cứu theo tên chuẩn hóa
  const topicMapByName = new Map<string, any[]>();
  for (const t of allOfficialTopics!) {
    const nName = normalizeText(t.topic_name);
    if (!topicMapByName.has(nName)) topicMapByName.set(nName, []);
    topicMapByName.get(nName)!.push(t);
  }

  const programMapByCode = new Map<string, any>();
  const programMapByName = new Map<string, any>();
  for (const p of allOfficialPrograms!) {
    programMapByCode.set(p.code.toUpperCase().trim(), p);
    programMapByName.set(normalizeText(p.name), p);
  }

  const programsDataMap = new Map<number, ParsedProgramData>();
  const proposalsList: ParsedProposal[] = [];
  const warnings: string[] = [];
  let totalRowsProcessed = 0;

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;

    const normSheet = normalizeText(sheetName);

    // Bỏ qua các sheet phụ lục danh mục/hướng dẫn/thống kê không chứa dữ liệu kê khai
    if (
      normSheet.includes('muc luc') ||
      normSheet.includes('huong dan') ||
      normSheet.includes('thong ke') ||
      normSheet.includes('tong hop') ||
      normSheet.includes('instruction')
    ) {
      continue;
    }

    // Tự động giải phóng các ô gộp (merged cells) để dữ liệu không bị khuyết thiếu trên từng dòng
    // Tối ưu: Gán trực tiếp tham chiếu originCell, giới hạn phạm vi an toàn để tránh OOM bộ nhớ khi người dùng merge cả triệu dòng
    if (ws['!merges']) {
      const range = ws['!ref'] ? xlsx.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 2500, c: 20 } };
      const maxR = Math.min(range.e.r, 2500);
      for (const m of ws['!merges']) {
        if (m.s.r > maxR) continue;
        if (m.e.r - m.s.r > 200) continue; // Bỏ qua merge bất thường bao trọn cả cột
        const endR = Math.min(m.e.r, maxR);
        const originCell = ws[xlsx.utils.encode_cell(m.s)];
        if (!originCell || originCell.v === undefined || originCell.v === null || originCell.v === '') continue;
        for (let r = m.s.r; r <= endR; r++) {
          for (let c = m.s.c; c <= Math.min(m.e.c, 15); c++) {
            const addr = xlsx.utils.encode_cell({ r, c });
            if (!ws[addr] || ws[addr].v === undefined || ws[addr].v === null || ws[addr].v === '') {
              ws[addr] = originCell;
            }
          }
        }
      }
    }

    // Nhận diện Sheet Đề xuất ngoài khung (Mẫu số 06 hoặc sheet đề xuất tự do)
    // Lưu ý: Không tính 'ngoai khung' đơn thuần vì Mẫu số 05 (Mau_05_Ngoai_Khung) là 26 chuyên đề chuẩn đã có trong CSDL
    const isMau05 = normSheet.includes('mau 05') || normSheet.includes('mau_05');
    const isProposalSheet = !isMau05 && (normSheet.includes('mau 06') || normSheet.includes('mau_06') || (normSheet.includes('de xuat') && !normSheet.includes('05')) || normSheet.includes('proposal'));

    if (isProposalSheet) {
      // Sheet Đề xuất ngoài khung (Mẫu số 06 dành cho TSC, VPĐD, ĐVSN hoặc đề xuất riêng của đơn vị)
      const rows: any[] = xlsx.utils.sheet_to_json(ws, { defval: '' });
      for (const row of rows) {
        totalRowsProcessed++;
        let propName = '';
        let audience = '';
        let duration = '';
        let deliveryMethod = '';
        let facultySource = '';
        let count = 0;
        let note = '';

        for (const key of Object.keys(row)) {
          const normKey = normalizeText(key);
          const val = row[key];
          if (normKey.includes('ten chuyen de') || normKey.includes('khoa hoc') || normKey.includes('de xuat') || normKey.includes('chuong trinh')) {
            propName = String(val).trim();
          } else if (normKey.includes('doi tuong') || normKey.includes('hoc vien')) {
            audience = String(val).trim();
          } else if (normKey.includes('thoi luong')) {
            duration = String(val).trim();
          } else if (normKey.includes('hinh thuc')) {
            deliveryMethod = String(val).trim();
          } else if (normKey.includes('giang vien') || normKey.includes('nguon') || normKey.includes('cau hoi')) {
            facultySource = String(val).trim();
          } else if (normKey.includes('so luong') || normKey.includes('dang ky') || normKey.includes('nguoi')) {
            const cNum = parseInt(String(val).replace(/[^0-9]/g, ''));
            if (!isNaN(cNum) && cNum > 0) count = cNum;
          } else if (normKey.includes('ghi chu') || normKey.includes('kien nghi')) {
            note = String(val).trim();
          }
        }

        if (propName && (count > 0 || duration || audience)) {
          proposalsList.push({
            proposal_name: propName,
            target_audience: audience,
            expected_duration: duration,
            delivery_method: deliveryMethod,
            faculty_source: facultySource,
            participant_count: count > 0 ? count : 1,
            notes: note
          });
        }
      }
    } else {
      // Sheet Khảo sát nhu cầu đào tạo (Hỗ trợ cả dạng ma trận nhiều block stacked chuẩn Agribank lẫn bảng phẳng)
      const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      if (!matrix || matrix.length === 0) continue;

      let currentProgramId: number | null = null;
      let colMap: {
        topicIdx?: number;
        positionIdx?: number;
        completedIdx?: number;
        countIdx?: number;
        namesIdx?: number;
        progIdx?: number;
        notesIdx?: number;
        audienceIdx?: number;
        durationIdx?: number;
      } | null = null;

      for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
        const row = matrix[rIdx];
        if (!Array.isArray(row) || row.length === 0) continue;
        totalRowsProcessed++;

        const rowStr = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');
        if (!rowStr) continue;

        // 1. Kiểm tra dòng Header của bảng (chứa 'Tên chuyên đề', 'Chuyên đề đào tạo' hoặc 'Tên chương trình' - Mẫu 05)
        const isHeaderRow = row.some(cell => {
          const nCell = normalizeText(String(cell));
          return (
            nCell.includes('ten chuyen de') ||
            nCell.includes('chuyen de dao tao') ||
            nCell.includes('ten chuong trinh') ||
            nCell.includes('chuong trinh dao tao') ||
            nCell === 'chuyen de' ||
            nCell === 'chuong trinh'
          ) && !nCell.includes('hoan thanh');
        });

        if (isHeaderRow) {
          colMap = {};
          row.forEach((cell, idx) => {
            const nCell = normalizeText(String(cell));
            if (
              (nCell.includes('ten chuyen de') ||
               nCell === 'chuyen de' ||
               nCell.includes('chuyen de dao tao') ||
               nCell.includes('ten chuong trinh') ||
               nCell === 'chuong trinh' ||
               nCell.includes('chuong trinh dao tao')) &&
              !nCell.includes('hoan thanh') &&
              !nCell.includes('chung chi')
            ) {
              colMap!.topicIdx = idx;
            } else if ((nCell.startsWith('vi tri') || nCell.includes('chuc danh')) && !nCell.includes('chung chi') && !nCell.includes('dao tao')) {
              colMap!.positionIdx = idx;
            } else if (nCell.includes('da hoc') && !nCell.includes('chuyen de')) {
              colMap!.completedIdx = idx;
            } else if (
              (nCell.includes('dang ky') || nCell.includes('so luong') || nCell === 'sl' || nCell.includes('hoc vien')) &&
              !nCell.includes('ho ten') &&
              !nCell.includes('danh sach') &&
              !nCell.includes('da hoc')
            ) {
              colMap!.countIdx = idx;
            } else if (nCell.includes('ho ten') || nCell.includes('danh sach')) {
              colMap!.namesIdx = idx;
            } else if (nCell.includes('ma khung') || (nCell.includes('chuong trinh') && colMap!.topicIdx !== idx)) {
              colMap!.progIdx = idx;
            } else if (nCell.includes('ghi chu') || nCell.includes('ly do') || nCell.includes('co so')) {
              colMap!.notesIdx = idx;
            } else if (nCell.includes('doi tuong')) {
              colMap!.audienceIdx = idx;
            } else if (nCell.includes('thoi luong')) {
              colMap!.durationIdx = idx;
            }
          });

          if (colMap.countIdx === undefined) {
            row.forEach((cell, idx) => {
              const nCell = normalizeText(String(cell));
              if ((nCell.includes('so luong') || nCell === 'sl') && !nCell.includes('da hoc') && !nCell.includes('ho ten')) {
                colMap!.countIdx = idx;
              }
            });
          }
          continue;
        }

        // 2. Kiểm tra dòng Tiêu đề Khung chương trình / Phụ lục / Nhóm chương trình La Mã (Mẫu số 05)
        const cell0 = String(row[0] || '').trim();
        const cell1 = String(row[1] || '').trim();
        const isNumericStt = !isNaN(Number(cell0)) && Number(cell0) > 0;

        if (!isNumericStt) {
          const firstCells = row.slice(0, 3).map(c => String(c || '').trim()).join(' ');
          const upperFirst = firstCells.toUpperCase();
          const normFirst = normalizeText(firstCells);

          let matchedProg: any = null;

          // 2.1 Ưu tiên khớp chính xác mã Phụ lục: PHỤ LỤC I.1, PHỤ LỤC III.1, etc.
          const plMatch = firstCells.match(/PHỤ LỤC\s+([IVXLCDM]+)\.(\d+)/i) || firstCells.match(/PHU LUC\s+([IVXLCDM]+)\.(\d+)/i);
          if (plMatch) {
            const plCode = `PL_${plMatch[1]}.${plMatch[2]}`;
            matchedProg = allOfficialPrograms!.find(p => p.code === plCode || normalizeText(p.code) === normalizeText(plCode));
          }

          // 2.2 Nhận diện các nhóm La Mã Mẫu số 05 (I., II., III., IV., V., VI.) hoặc tiêu đề chương trình
          if (!matchedProg) {
            const isRomanHeader = /^[IVXLCDM]+\.\s+/i.test(firstCells) || upperFirst.startsWith('PHỤ LỤC') || upperFirst.startsWith('KHUNG CHƯƠNG TRÌNH') || cell0.toUpperCase().startsWith('PHỤ LỤC');
            if (isRomanHeader || upperFirst.includes('CHƯƠNG TRÌNH')) {
              matchedProg = allOfficialPrograms!.find(p => {
                const normPCode = normalizeText(p.code);
                const normPName = normalizeText(p.name);
                return (
                  normFirst.includes(normPCode) ||
                  normFirst.includes(normPName) ||
                  normPName.includes(normFirst) ||
                  (normPCode && normFirst.includes(normPCode.replace(/[^a-z0-9]/g, '')))
                );
              });
            }
          }

          if (matchedProg) {
            currentProgramId = matchedProg.id;
            // Không xóa colMap nếu Mẫu số 05 dùng 1 header chung ở đầu bảng
            continue;
          }
        }

        // 3. Xử lý dòng dữ liệu chuyên đề
        if (colMap && colMap.topicIdx !== undefined) {
          const rawTopicName = String(row[colMap.topicIdx] || '').trim();
          if (!rawTopicName) continue;

          const nRaw = normalizeText(rawTopicName);

          // Bỏ qua dòng tổng kết hoặc chú thích
          if (
            nRaw.startsWith('tong thoi gian') ||
            nRaw.startsWith('tong cong') ||
            nRaw.startsWith('tong so ') ||
            nRaw === 'tong' ||
            nRaw.startsWith('ghi chu') ||
            nRaw.startsWith('chu thich') ||
            rawTopicName.startsWith('(*)')
          ) {
            continue;
          }

          // Lấy số lượng học viên đăng ký
          let count = 0;
          if (colMap.countIdx !== undefined && row[colMap.countIdx] !== undefined) {
            const parsed = parseInt(String(row[colMap.countIdx]).replace(/[^0-9]/g, ''));
            if (!isNaN(parsed) && parsed > 0) count = parsed;
          }

          // Lấy số lượng đã học (nếu có trong file)
          let completedCount = 0;
          if (colMap.completedIdx !== undefined && row[colMap.completedIdx] !== undefined) {
            const parsedComp = parseInt(String(row[colMap.completedIdx]).replace(/[^0-9]/g, ''));
            if (!isNaN(parsedComp) && parsedComp > 0) completedCount = parsedComp;
          }

          // Bỏ qua chuyên đề không có nhu cầu (> 0) và chưa học (> 0)
          if (count <= 0 && completedCount <= 0) continue;

          const attendees = colMap.namesIdx !== undefined ? String(row[colMap.namesIdx] || '').trim() : '';
          const rowNote = colMap.notesIdx !== undefined ? String(row[colMap.notesIdx] || '').trim() : '';
          const rowProgVal = colMap.progIdx !== undefined ? String(row[colMap.progIdx] || '').trim() : '';
          const rawPos = colMap.positionIdx !== undefined ? String(row[colMap.positionIdx] || '').trim() : '';
          const normPos = normalizeText(rawPos);

          let rowProgId = currentProgramId;
          if (rowProgVal) {
            const progByCode = programMapByCode.get(rowProgVal.toUpperCase());
            if (progByCode) {
              rowProgId = progByCode.id;
            } else {
              const progByName = programMapByName.get(normalizeText(rowProgVal));
              if (progByName) rowProgId = progByName.id;
            }
          }

          // Khớp chuyên đề với CSDL chuẩn
          const matchedList = topicMapByName.get(nRaw);
          let matchedTopic: any = null;

          if (matchedList && matchedList.length > 0) {
            if (matchedList.length === 1) {
              matchedTopic = matchedList[0];
            } else {
              // Có nhiều chuyên đề trùng tên -> phân biệt bằng program_id và position_code
              if (rowProgId && normPos) {
                matchedTopic = matchedList.find(t => t.program_id === rowProgId && normalizeText(t.position_code) === normPos);
              }
              if (!matchedTopic && rowProgId) {
                matchedTopic = matchedList.find(t => t.program_id === rowProgId);
              }
              if (!matchedTopic && normPos) {
                matchedTopic = matchedList.find(t => normalizeText(t.position_code) === normPos);
              }
              if (!matchedTopic) {
                matchedTopic = matchedList[0];
              }
            }
          }

          if (matchedTopic) {
            const pId = matchedTopic.program_id;
            if (!programsDataMap.has(pId)) {
              const progObj = allOfficialPrograms.find(p => p.id === pId);
              programsDataMap.set(pId, {
                program: progObj,
                topics: new Map()
              });
            }

            programsDataMap.get(pId)!.topics.set(matchedTopic.id, {
              count,
              completedCount,
              topicInfo: matchedTopic,
              attendees,
              notes: rowNote
            });
          } else {
            const aud = colMap.audienceIdx !== undefined ? String(row[colMap.audienceIdx] || '').trim() : '';
            const dur = colMap.durationIdx !== undefined ? String(row[colMap.durationIdx] || '').trim() : '';
            proposalsList.push({
              proposal_name: rawTopicName,
              target_audience: aud || 'Theo nhu cầu đơn vị',
              expected_duration: dur || '1-2 ngày',
              participant_count: count,
              notes: [rowNote, attendees ? `Họ tên: ${attendees}` : ''].filter(Boolean).join(' | ') || 'Nhận diện tự động từ file Excel'
            });
            warnings.push(`Chuyên đề "${rawTopicName}" không có trong khung chuẩn -> Tự động ghi nhận vào Đề xuất ngoài khung.`);
          }
        }
      }
    }
  }

  // Tổng hợp kết quả
  let totalInFrameworkParticipants = 0;
  let totalCompletedParticipants = 0;
  let totalInFrameworkTopics = 0;
  const programsSummary: any[] = [];

  for (const [pId, pData] of programsDataMap.entries()) {
    let pSum = 0;
    let pCompletedSum = 0;
    for (const tData of pData.topics.values()) {
      pSum += tData.count;
      pCompletedSum += (tData.completedCount || 0);
      totalInFrameworkTopics++;
    }
    totalInFrameworkParticipants += pSum;
    totalCompletedParticipants += pCompletedSum;
    programsSummary.push({
      programId: pId,
      programCode: pData.program?.code || '',
      programName: pData.program?.name || '',
      groupName: pData.program?.group_name || '',
      topicCount: pData.topics.size,
      totalParticipants: pSum,
      totalCompleted: pCompletedSum
    });
  }

  const totalProposalParticipants = proposalsList.reduce((sum, p) => sum + p.participant_count, 0);
  const grandTotalParticipants = totalInFrameworkParticipants + totalProposalParticipants;

  return {
    programsDataMap,
    proposalsList,
    totalRowsProcessed,
    programsSummary,
    totalInFrameworkTopics,
    totalInFrameworkParticipants,
    totalCompletedParticipants,
    totalProposalParticipants,
    grandTotalParticipants,
    warnings
  };
}
