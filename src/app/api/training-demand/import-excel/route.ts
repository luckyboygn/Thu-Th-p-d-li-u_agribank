import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy, isCentralAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createSubmissionReceipt, calculateTrainingDemandParticipants, getTrainingDemandProgramsSummary } from '@/lib/receipt';
import { triggerCloudSync } from '@/lib/cloud-sync';
import * as xlsx from 'xlsx';

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

// 1. GET: Tải file mẫu Excel khảo sát nhu cầu đào tạo chuẩn Agribank
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'TEMPLATE') {
    const db = getDatabase();

    // Lấy toàn bộ danh mục Khung chương trình và chuyên đề chính thức
    const topics = db.prepare(`
      SELECT p.code as program_code, p.name as program_name,
             t.topic_name, t.delivery_method, t.duration
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
      ORDER BY p.id ASC, t.display_order ASC
    `).all() as any[];

    const wb = xlsx.utils.book_new();

    // Sheet 1: Nhu cầu đào tạo theo khung
    const dataSheet1 = topics.map((t, idx) => ({
      'STT': idx + 1,
      'Mã Khung CT': t.program_code,
      'Khung Chương Trình Đào Tạo': t.program_name,
      'Tên Chuyên Đề Đào Tạo': t.topic_name,
      'Hình Thức Đào Tạo': t.delivery_method || 'Trực tiếp / Trực tuyến',
      'Thời Lượng': t.duration || '1 ngày',
      'Đã Học (Số lượng)': '',
      'Đăng Ký Học Năm 2027 (Số lượng)': '',
      'Đăng Ký Học Năm 2027 (Họ tên)': '',
      'Ghi Chú': ''
    }));

    const ws1 = xlsx.utils.json_to_sheet(dataSheet1);
    ws1['!cols'] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 45 },
      { wch: 55 },
      { wch: 22 },
      { wch: 15 },
      { wch: 20 },
      { wch: 28 },
      { wch: 35 },
      { wch: 30 }
    ];
    xlsx.utils.book_append_sheet(wb, ws1, 'Nhu_Cau_Dao_Tao');

    // Sheet 2: Đề xuất ngoài khung
    const dataSheet2 = [
      {
        'STT': 1,
        'Tên Chuyên Đề / Khóa Học Đề Xuất': 'Ví dụ: Kỹ năng quản trị trải nghiệm khách hàng số',
        'Đối Tượng Tham Gia': 'Giao dịch viên, Kiểm soát viên',
        'Thời Lượng Dự Kiến': '2 ngày',
        'Số Lượng Người Đăng Ký': 15,
        'Ghi Chú / Kiến Nghị Chi Tiết': 'Đào tạo trực tiếp tại chi nhánh'
      }
    ];
    const ws2 = xlsx.utils.json_to_sheet(dataSheet2);
    ws2['!cols'] = [
      { wch: 6 },
      { wch: 45 },
      { wch: 30 },
      { wch: 20 },
      { wch: 25 },
      { wch: 40 }
    ];
    xlsx.utils.book_append_sheet(wb, ws2, 'De_Xuat_Ngoai_Khung');

    // Sheet 3: Hướng dẫn
    const dataSheet3 = [
      { 'Mục': '1. Phạm vi', 'Nội dung': 'Biểu mẫu phục vụ khảo sát nhu cầu đào tạo toàn hệ thống Agribank năm 2027 dành cho các đơn vị.' },
      { 'Mục': '2. Cách nhập Sheet 1 (Nhu_Cau_Dao_Tao)', 'Nội dung': 'Điền số lượng cán bộ đăng ký tham gia vào cột [Đăng Ký Học Năm 2027 (Số lượng)] (phải là số nguyên >= 0). Nếu có danh sách họ tên cán bộ, điền vào cột [Đăng Ký Học Năm 2027 (Họ tên)]. Bỏ trống hoặc điền 0 nếu không có nhu cầu.' },
      { 'Mục': '3. Cách nhập Sheet 2 (De_Xuat_Ngoai_Khung)', 'Nội dung': 'Dành cho các chuyên đề đặc thù ngoài khung chương trình của Agribank. Điền tên chuyên đề, đối tượng và số lượng dự kiến.' },
      { 'Mục': '4. Hỗ trợ', 'Nội dung': 'Nếu đơn vị không tự thao tác trên hệ thống, vui lòng gửi file Excel này về email Admin để được hỗ trợ tải lên.' }
    ];
    const ws3 = xlsx.utils.json_to_sheet(dataSheet3);
    ws3['!cols'] = [{ wch: 30 }, { wch: 80 }];
    xlsx.utils.book_append_sheet(wb, ws3, 'Huong_Dan_Ke_Khai');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': 'attachment; filename="Mau_Khao_Sat_Nhu_Cau_Dao_Tao_Agribank.xlsx"',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });
  }

  return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

// 2. POST: Admin tải file Excel lên hộ đơn vị (Nhận qua Email)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  // Quyền hạn: Chỉ Quản trị viên Trung tâm mới được nộp hộ đơn vị
  if (!isCentralAdmin(session)) {
    return NextResponse.json({
      error: 'Chức năng nộp hộ file Excel của đơn vị chỉ dành riêng cho Quản trị viên Trung tâm (Admin).'
    }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const unitIdStr = formData.get('unitId') as string | null;
    const collectionIdStr = formData.get('collectionId') as string | null;
    const submissionStatus = (formData.get('status') as string) || 'SUBMITTED'; // 'SUBMITTED' | 'DRAFT'
    const sourceNote = (formData.get('sourceNote') as string) || 'Admin nộp hộ qua email';
    const mode = (formData.get('mode') as string) || 'execute'; // 'preview' | 'execute'

    if (!file) {
      return NextResponse.json({ error: 'Vui lòng chọn file Excel để tải lên.' }, { status: 400 });
    }

    if (!unitIdStr) {
      return NextResponse.json({ error: 'Vui lòng chọn Đơn vị cần nộp hộ.' }, { status: 400 });
    }

    const unitId = parseInt(unitIdStr);
    const db = getDatabase();

    const unit = db.prepare('SELECT id, unit_code, unit_name FROM units WHERE id = ?').get(unitId) as any;
    if (!unit) {
      return NextResponse.json({ error: 'Đơn vị không tồn tại trên hệ thống.' }, { status: 404 });
    }

    // Xác định đợt khảo sát (Collection)
    let collectionId = collectionIdStr ? parseInt(collectionIdStr) : null;
    if (!collectionId) {
      const activeColl = db.prepare("SELECT id, code, title FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any;
      if (!activeColl) {
        const latestColl = db.prepare('SELECT id, code, title FROM collections ORDER BY id DESC LIMIT 1').get() as any;
        collectionId = latestColl?.id || 1;
      } else {
        collectionId = activeColl.id;
      }
    }

    const collection = db.prepare('SELECT id, code, title FROM collections WHERE id = ?').get(collectionId) as any;
    if (!collection) {
      return NextResponse.json({ error: 'Đợt khảo sát đào tạo không tồn tại.' }, { status: 404 });
    }

    // Đọc buffer file Excel
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'File Excel rỗng, không tìm thấy Sheet nào.' }, { status: 400 });
    }

    // Tải toàn bộ danh mục chương trình và chuyên đề chính thức vào bộ nhớ để đối chiếu tốc độ cao
    const allOfficialPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all() as any[];
    const allOfficialTopics = db.prepare(`
      SELECT t.id, t.program_id, t.topic_name, t.delivery_method, t.duration,
             p.code as program_code, p.name as program_name
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
    `).all() as any[];

    // Bản đồ tra cứu theo tên chuẩn hóa
    const topicMapByName = new Map<string, any[]>();
    for (const t of allOfficialTopics) {
      const nName = normalizeName(t.topic_name);
      if (!topicMapByName.has(nName)) topicMapByName.set(nName, []);
      topicMapByName.get(nName)!.push(t);
    }

    const programMapByCode = new Map<string, any>();
    const programMapByName = new Map<string, any>();
    for (const p of allOfficialPrograms) {
      programMapByCode.set(p.code.toUpperCase().trim(), p);
      programMapByName.set(normalizeName(p.name), p);
    }

    // Dữ liệu bóc tách được
    // ProgramID -> { programId, topicCounts: Map<topicId, { count, topicInfo, attendees, notes }> }
    const programsDataMap = new Map<number, {
      program: any;
      topics: Map<number, { count: number; topicInfo: any; attendees?: string; notes?: string }>
    }>();
    const proposalsList: Array<{
      proposal_name: string;
      target_audience?: string;
      expected_duration?: string;
      participant_count: number;
      notes?: string;
    }> = [];

    const warnings: string[] = [];
    let totalRowsProcessed = 0;

    // Duyệt qua từng Sheet trong file Excel
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;

      const normSheet = normalizeName(sheetName);

      // Bỏ qua các sheet phụ lục danh mục/hướng dẫn/thống kê tổng quát không chứa dữ liệu kê khai
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
            const normKey = normalizeName(key);
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
        let currentProgramObj: any = null;
        let colMap: {
          topicIdx?: number;
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

          // 1. Kiểm tra dòng Tiêu đề Khung chương trình / Phụ lục (VD: PHỤ LỤC I.1. KHUNG CHƯƠNG TRÌNH ĐÀO TẠO...)
          const firstCells = row.slice(0, 3).map(c => String(c || '').trim()).join(' ');
          const upperFirst = firstCells.toUpperCase();
          if (
            upperFirst.includes('PHỤ LỤC') ||
            upperFirst.includes('PHU LUC') ||
            upperFirst.includes('KHUNG CHƯƠNG TRÌNH') ||
            upperFirst.includes('KHUNG CHUONG TRINH')
          ) {
            const normFirst = normalizeName(firstCells);
            const matchedProg = allOfficialPrograms.find(p => {
              const normPCode = normalizeName(p.code);
              const normPName = normalizeName(p.name);
              return normFirst.includes(normPCode) || normFirst.includes(normPName) || (normPCode && normFirst.includes(normPCode.replace(/[^a-z0-9]/g, '')));
            });

            if (matchedProg) {
              currentProgramId = matchedProg.id;
              currentProgramObj = matchedProg;
              colMap = null; // Reset header mapping cho block mới
              continue;
            }
          }

          // 2. Kiểm tra dòng Header của block (chứa 'Tên chuyên đề' hoặc 'Chuyên đề đào tạo')
          const isHeaderRow = row.some(cell => {
            const nCell = normalizeName(String(cell));
            return (nCell.includes('ten chuyen de') || nCell.includes('chuyen de dao tao')) && !nCell.includes('hoan thanh');
          });

          if (isHeaderRow) {
            colMap = {};
            row.forEach((cell, idx) => {
              const nCell = normalizeName(String(cell));
              if ((nCell.includes('ten chuyen de') || nCell === 'chuyen de' || nCell.includes('chuyen de dao tao')) && !nCell.includes('hoan thanh') && !nCell.includes('chung chi')) {
                colMap!.topicIdx = idx;
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

            // Nếu chưa bắt được countIdx qua tiêu chí trên, bắt cột có chứa 'so luong' hoặc 'sl' mà không phải cột 'da hoc'
            if (colMap.countIdx === undefined) {
              row.forEach((cell, idx) => {
                const nCell = normalizeName(String(cell));
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

            const nRaw = normalizeName(rawTopicName);

            // Bỏ qua dòng tổng kết hoặc chú thích (CHỈ bỏ qua dòng tổng thời gian, tổng cộng, KHÔNG bỏ qua chuyên đề 'Tổng quan...')
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

            // Bỏ qua chuyên đề không có nhu cầu (> 0)
            if (count <= 0) continue;

            const attendees = colMap.namesIdx !== undefined ? String(row[colMap.namesIdx] || '').trim() : '';
            const rowNote = colMap.notesIdx !== undefined ? String(row[colMap.notesIdx] || '').trim() : '';
            const rowProgVal = colMap.progIdx !== undefined ? String(row[colMap.progIdx] || '').trim() : '';

            // Xác định chương trình (qua block header hoặc cột program từng dòng)
            let rowProgId = currentProgramId;
            if (rowProgVal) {
              const progByCode = programMapByCode.get(rowProgVal.toUpperCase());
              if (progByCode) {
                rowProgId = progByCode.id;
              } else {
                const progByName = programMapByName.get(normalizeName(rowProgVal));
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
              // Chuyên đề thuộc Khung chuẩn Agribank
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
                topicInfo: matchedTopic,
                attendees,
                notes: rowNote
              });
            } else {
              // Chuyên đề đặc thù không nằm trong khung chuẩn -> Tự động ghi nhận vào Đề xuất ngoài khung
              const aud = colMap.audienceIdx !== undefined ? String(row[colMap.audienceIdx] || '').trim() : '';
              const dur = colMap.durationIdx !== undefined ? String(row[colMap.durationIdx] || '').trim() : '';
              proposalsList.push({
                proposal_name: rawTopicName,
                target_audience: aud || 'Theo nhu cầu đơn vị',
                expected_duration: dur || '1-2 ngày',
                participant_count: count,
                notes: [rowNote, attendees ? `Họ tên: ${attendees}` : ''].filter(Boolean).join(' | ') || 'Nhận diện tự động từ file Excel nộp hộ'
              });
              warnings.push(`Chuyên đề "${rawTopicName}" không có trong danh mục 844 chuyên đề chuẩn -> Đã tự động chuyển thành Đề xuất ngoài khung.`);
            }
          }
        }
      }
    }

    // Tổng hợp kết quả thống kê
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

    if (grandTotalParticipants === 0) {
      return NextResponse.json({
        error: 'Không tìm thấy số lượng học viên hợp lệ (> 0) trong file Excel. Vui lòng kiểm tra lại file đã nhập số lượng tại cột [Số Lượng Người Đăng Ký] chưa.'
      }, { status: 400 });
    }

    // 1. Chế độ PREVIEW: Trả về kết quả bóc tách để Admin xem trước
    if (mode === 'preview') {
      return NextResponse.json({
        preview: true,
        unit: {
          id: unit.id,
          unit_code: unit.unit_code,
          unit_name: unit.unit_name
        },
        collection: {
          id: collection.id,
          code: collection.code,
          title: collection.title
        },
        fileName: file.name,
        totalRowsProcessed,
        programsCount: programsDataMap.size,
        topicsCount: totalInFrameworkTopics,
        inFrameworkParticipants: totalInFrameworkParticipants,
        proposalsCount: proposalsList.length,
        proposalParticipants: totalProposalParticipants,
        grandTotalParticipants,
        programs: programsSummary,
        proposals: proposalsList,
        warnings: warnings.slice(0, 5)
      });
    }

    // 2. Chế độ EXECUTE: Thực hiện lưu và cấp Biên nhận
    db.exec('BEGIN TRANSACTION;');
    try {
      // Tìm hoặc tạo submission
      let submission = db.prepare(`
        SELECT * FROM training_demand_submissions
        WHERE collection_id = ? AND unit_id = ?
        ORDER BY version DESC LIMIT 1
      `).get(collectionId, unitId) as any;

      if (!submission) {
        const insSub = db.prepare(`
          INSERT INTO training_demand_submissions (
            collection_id, unit_id, status, prepared_by, submitted_by, note
          ) VALUES (?, ?, 'DRAFT', ?, ?, ?)
        `).run(collectionId, unitId, session.id, session.id, sourceNote);
        submission = { id: Number(insSub.lastInsertRowid), status: 'DRAFT' };
      }

      // Xóa dữ liệu cũ của đơn vị trong đợt này để nạp mới hoàn toàn
      db.prepare(`
        DELETE FROM training_demand_program_topics
        WHERE demand_program_id IN (
          SELECT id FROM training_demand_programs WHERE submission_id = ?
        )
      `).run(submission.id);

      db.prepare('DELETE FROM training_demand_programs WHERE submission_id = ?').run(submission.id);
      db.prepare('DELETE FROM training_demand_proposals WHERE submission_id = ?').run(submission.id);

      // Thêm các chương trình và chuyên đề mới
      const insertDemandProgStmt = db.prepare(`
        INSERT INTO training_demand_programs (submission_id, program_id, notes)
        VALUES (?, ?, ?)
      `);

      const insertDemandTopicStmt = db.prepare(`
        INSERT INTO training_demand_program_topics (
          demand_program_id, program_topic_id, participant_count,
          topic_name_snapshot, delivery_method_snapshot, duration_snapshot,
          attendees, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [pId, pData] of programsDataMap.entries()) {
        const dpRes = insertDemandProgStmt.run(submission.id, pId, sourceNote);
        const demandProgramId = Number(dpRes.lastInsertRowid);

        for (const [tId, tData] of pData.topics.entries()) {
          insertDemandTopicStmt.run(
            demandProgramId,
            tId,
            tData.count,
            tData.topicInfo.topic_name || '',
            tData.topicInfo.delivery_method || '',
            tData.topicInfo.duration || '',
            tData.attendees || null,
            tData.notes || null
          );
        }
      }

      // Thêm các đề xuất ngoài khung
      const insertProposalStmt = db.prepare(`
        INSERT INTO training_demand_proposals (
          submission_id, proposal_name, target_audience, expected_duration, participant_count, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const prop of proposalsList) {
        insertProposalStmt.run(
          submission.id,
          prop.proposal_name,
          prop.target_audience || '',
          prop.expected_duration || '',
          prop.participant_count,
          prop.notes || sourceNote
        );
      }

      // Cập nhật trạng thái bài nộp
      let receiptCode: string | null = null;
      if (submissionStatus === 'SUBMITTED') {
        const totalCalc = calculateTrainingDemandParticipants(db, submission.id);
        const progSummary = getTrainingDemandProgramsSummary(db, submission.id);

        receiptCode = createSubmissionReceipt(db, {
          targetType: 'TRAINING_DEMAND',
          targetId: submission.id,
          unitId,
          submittedBy: session.id,
          approvedBy: session.id,
          totalRecords: totalCalc,
          metadata: {
            title: collection.title,
            totalParticipants: totalCalc,
            programsSummary: progSummary,
            adminProxyUpload: true,
            proxyUploadedBy: session.username,
            fileName: file.name,
            sourceNote
          }
        });

        db.prepare(`
          UPDATE training_demand_submissions 
          SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by = ?, approved_by = ?,
              prepared_by = ?, receipt_code = ?, note = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(session.id, session.id, session.id, receiptCode, sourceNote, submission.id);
      } else {
        db.prepare(`
          UPDATE training_demand_submissions 
          SET status = 'DRAFT', prepared_by = ?, note = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(session.id, sourceNote, submission.id);
      }

      db.exec('COMMIT;');

      // Ghi log Audit
      logAudit({
        userId: session.id,
        username: session.username,
        unitId,
        action: 'ADMIN_PROXY_IMPORT_TRAINING_DEMAND',
        entityType: 'TRAINING_DEMAND_SUBMISSION',
        entityId: submission.id,
        details: {
          unitCode: unit.unit_code,
          unitName: unit.unit_name,
          collectionId,
          fileName: file.name,
          submissionStatus,
          grandTotalParticipants,
          programsCount: programsDataMap.size,
          topicsCount: totalInFrameworkTopics,
          proposalsCount: proposalsList.length,
          receiptCode,
          sourceNote
        }
      });

      // Đồng bộ cloud
      triggerCloudSync().catch(() => {});

      return NextResponse.json({
        success: true,
        message: submissionStatus === 'SUBMITTED'
          ? `Đã nộp hộ file Excel thành công cho [${unit.unit_code}] ${unit.unit_name}. Mã biên nhận điện tử: ${receiptCode}`
          : `Đã lưu bản nháp thành công từ file Excel cho [${unit.unit_code}] ${unit.unit_name}.`,
        submissionId: submission.id,
        receiptCode,
        status: submissionStatus,
        grandTotalParticipants,
        programsCount: programsDataMap.size,
        topicsCount: totalInFrameworkTopics,
        proposalsCount: proposalsList.length
      });
    } catch (dbErr: any) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }
  } catch (err: any) {
    console.error('Lỗi khi nộp hộ file Excel khảo sát đào tạo:', err);
    return NextResponse.json({
      error: err.message || 'Lỗi khi xử lý file Excel nộp hộ.'
    }, { status: 500 });
  }
}
