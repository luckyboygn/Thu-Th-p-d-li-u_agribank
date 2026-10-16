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
  }>;
  totalInFrameworkTopics: number;
  totalInFrameworkParticipants: number;
  totalProposalParticipants: number;
  grandTotalParticipants: number;
  warnings: string[];
}

export function parseTrainingDemandExcel(
  workbook: xlsx.WorkBook,
  allOfficialPrograms: any[],
  allOfficialTopics: any[]
): ParseExcelResult {
  // Bản đồ tra cứu theo tên chuẩn hóa
  const topicMapByName = new Map<string, any[]>();
  for (const t of allOfficialTopics) {
    const nName = normalizeText(t.topic_name);
    if (!topicMapByName.has(nName)) topicMapByName.set(nName, []);
    topicMapByName.get(nName)!.push(t);
  }

  const programMapByCode = new Map<string, any>();
  const programMapByName = new Map<string, any>();
  for (const p of allOfficialPrograms) {
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

    const isProposalSheet = normSheet.includes('de xuat') || normSheet.includes('ngoai khung') || normSheet.includes('proposal');

    if (isProposalSheet) {
      // Sheet Đề xuất ngoài khung
      const rows: any[] = xlsx.utils.sheet_to_json(ws, { defval: '' });
      for (const row of rows) {
        totalRowsProcessed++;
        let propName = '';
        let audience = '';
        let duration = '';
        let count = 0;
        let note = '';

        for (const key of Object.keys(row)) {
          const normKey = normalizeText(key);
          const val = row[key];
          if (normKey.includes('ten chuyen de') || normKey.includes('khoa hoc') || normKey.includes('de xuat')) {
            propName = String(val).trim();
          } else if (normKey.includes('doi tuong') || normKey.includes('hoc vien')) {
            audience = String(val).trim();
          } else if (normKey.includes('thoi luong')) {
            duration = String(val).trim();
          } else if (normKey.includes('so luong') || normKey.includes('dang ky') || normKey.includes('nguoi')) {
            const cNum = parseInt(String(val).replace(/[^0-9]/g, ''));
            if (!isNaN(cNum) && cNum > 0) count = cNum;
          } else if (normKey.includes('ghi chu') || normKey.includes('kien nghi')) {
            note = String(val).trim();
          }
        }

        if (propName && count > 0) {
          proposalsList.push({
            proposal_name: propName,
            target_audience: audience,
            expected_duration: duration,
            participant_count: count,
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

        // 1. Kiểm tra dòng Tiêu đề Khung chương trình / Phụ lục
        const firstCells = row.slice(0, 3).map(c => String(c || '').trim()).join(' ');
        const upperFirst = firstCells.toUpperCase();
        if (
          upperFirst.includes('PHỤ LỤC') ||
          upperFirst.includes('PHU LUC') ||
          upperFirst.includes('KHUNG CHƯƠNG TRÌNH') ||
          upperFirst.includes('KHUNG CHUONG TRINH')
        ) {
          const normFirst = normalizeText(firstCells);
          const matchedProg = allOfficialPrograms.find(p => {
            const normPCode = normalizeText(p.code);
            const normPName = normalizeText(p.name);
            return normFirst.includes(normPCode) || normFirst.includes(normPName) || (normPCode && normFirst.includes(normPCode.replace(/[^a-z0-9]/g, '')));
          });

          if (matchedProg) {
            currentProgramId = matchedProg.id;
            colMap = null; // Reset header mapping cho block mới
            continue;
          }
        }

        // 2. Kiểm tra dòng Header của block (chứa 'Tên chuyên đề' hoặc 'Chuyên đề đào tạo')
        const isHeaderRow = row.some(cell => {
          const nCell = normalizeText(String(cell));
          return (nCell.includes('ten chuyen de') || nCell.includes('chuyen de dao tao')) && !nCell.includes('hoan thanh');
        });

        if (isHeaderRow) {
          colMap = {};
          row.forEach((cell, idx) => {
            const nCell = normalizeText(String(cell));
            if ((nCell.includes('ten chuyen de') || nCell === 'chuyen de' || nCell.includes('chuyen de dao tao')) && !nCell.includes('hoan thanh') && !nCell.includes('chung chi')) {
              colMap!.topicIdx = idx;
            } else if (nCell.includes('da hoc') && !nCell.includes('chuyen de')) {
              colMap!.completedIdx = idx;
            } else if (nCell.includes('dang ky') && (nCell.includes('2027') || nCell.includes('so luong') || nCell === 'sl' || nCell.includes('hoc vien')) && !nCell.includes('ho ten') && !nCell.includes('danh sach')) {
              colMap!.countIdx = idx;
            } else if (nCell.includes('ho ten') || nCell.includes('danh sach')) {
              colMap!.namesIdx = idx;
            } else if (nCell.includes('ma khung') || nCell.includes('chuong trinh')) {
              colMap!.progIdx = idx;
            } else if (nCell.includes('ghi chu')) {
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
            } else if (rowProgId) {
              matchedTopic = matchedList.find(t => t.program_id === rowProgId) || matchedList[0];
            } else {
              matchedTopic = matchedList[0];
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
  let totalInFrameworkTopics = 0;
  const programsSummary: any[] = [];

  for (const [pId, pData] of programsDataMap.entries()) {
    let pSum = 0;
    for (const tData of pData.topics.values()) {
      pSum += tData.count;
      totalInFrameworkTopics++;
    }
    totalInFrameworkParticipants += pSum;
    programsSummary.push({
      programId: pId,
      programCode: pData.program?.code || '',
      programName: pData.program?.name || '',
      groupName: pData.program?.group_name || '',
      topicCount: pData.topics.size,
      totalParticipants: pSum
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
    totalProposalParticipants,
    grandTotalParticipants,
    warnings
  };
}
