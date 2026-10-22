import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy, isCentralAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createSubmissionReceipt, calculateTrainingDemandParticipants, getTrainingDemandProgramsSummary } from '@/lib/receipt';
import { triggerCloudSync } from '@/lib/cloud-sync';
import { parseTrainingDemandExcel } from '@/lib/training-excel-parser';
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

    // 1. Lấy toàn bộ 818 chuyên đề KHUNG CHỨC DANH (Phụ lục I, II, III, IV - Mẫu số 04)
    const inFrameworkTopics = db.prepare(`
      SELECT t.id as topic_id, p.code as program_code, p.name as program_name,
             t.position_code, t.topic_name, t.delivery_method, t.duration,
             t.learning_path, t.competency, t.certificate_requirement,
             t.cert_planning_higher, t.cert_appoint_higher, t.cert_reappoint
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
      WHERE p.code NOT LIKE 'PL_NK%'
      ORDER BY p.id ASC, t.display_order ASC, t.id ASC
    `).all() as any[];

    // 2. Lấy toàn bộ 26 chương trình NGOÀI KHUNG BAN HÀNH (Mẫu số 05)
    const outFrameworkTopics = db.prepare(`
      SELECT t.id as topic_id, p.code as program_code, p.name as program_name,
             t.topic_name, t.target_audience, t.expected_content,
             t.duration, t.delivery_method, t.instructor, t.target_goal, t.proposal_basis
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
      WHERE p.code LIKE 'PL_NK%'
      ORDER BY p.id ASC, t.display_order ASC, t.id ASC
    `).all() as any[];

    const wb = xlsx.utils.book_new();

    // ==========================================
    // SHEET 1: MẪU SỐ 04 - KHUNG CHƯƠNG TRÌNH ĐÀO TẠO THEO VỊ TRÍ CHỨC DANH (818 chuyên đề)
    // ==========================================
    const dataSheet1 = inFrameworkTopics.map((t, idx) => ({
      'STT': idx + 1,
      'Mã Chuyên Đề': `CD_${t.topic_id}`,
      'Mã Khung CT': t.program_code,
      'Khung Chương Trình Đào Tạo': t.program_name,
      'Vị Trí Chức Danh': t.position_code || '',
      'Tên Chuyên Đề Đào Tạo': t.topic_name,
      'Hình Thức Đào Tạo': t.delivery_method || 'Trực tuyến',
      'Thời Lượng Đào Tạo': t.duration || '1 giờ',
      'Lộ Trình Đào Tạo': t.learning_path || '',
      'Năng Lực': t.competency || '',
      'Chứng Chỉ/Chứng Nhận Đào Tạo': t.certificate_requirement || '',
      'Chứng Chỉ Khi Quy Hoạch Ở Vị Trí Cao Hơn': t.cert_planning_higher || '',
      'Chứng Chỉ Khi Bổ Nhiệm Ở Vị Trí Cao Hơn': t.cert_appoint_higher || '',
      'Chứng Chỉ Khi Bổ Nhiệm Lại': t.cert_reappoint || '',
      'Đã học (số lượng)': '',
      'Đăng ký học năm 2027 (số lượng)': ''
    }));

    const ws1 = xlsx.utils.json_to_sheet(dataSheet1);
    ws1['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã Chuyên Đề
      { wch: 14 }, // Mã Khung CT
      { wch: 42 }, // Khung Chương Trình Đào Tạo
      { wch: 20 }, // Vị Trí Chức Danh
      { wch: 55 }, // Tên Chuyên Đề Đào Tạo
      { wch: 18 }, // Hình Thức Đào Tạo
      { wch: 16 }, // Thời Lượng Đào Tạo
      { wch: 18 }, // Lộ Trình Đào Tạo
      { wch: 14 }, // Năng Lực
      { wch: 38 }, // Chứng Chỉ/Chứng Nhận Đào Tạo
      { wch: 16 }, // Chứng Chỉ Quy Hoạch
      { wch: 16 }, // Chứng Chỉ Bổ Nhiệm
      { wch: 16 }, // Chứng Chỉ Bổ Nhiệm Lại
      { wch: 20 }, // Đã học (số lượng)
      { wch: 28 }  // Đăng ký học năm 2027 (số lượng)
    ];
    xlsx.utils.book_append_sheet(wb, ws1, 'Mau_04_Khung_Chuc_Danh');

    // ==========================================
    // SHEET 2: MẪU SỐ 05 - DANH MỤC CÁC CHƯƠNG TRÌNH ĐÀO TẠO NGOÀI KHUNG ĐỀ XUẤT NĂM 2027 (26 chương trình)
    // ==========================================
    const dataSheet2 = outFrameworkTopics.map((t, idx) => ({
      'TT': idx + 1,
      'Mã Chuyên Đề': `CD_${t.topic_id}`,
      'Nhóm chương trình': t.program_name,
      'Tên chương trình': t.topic_name,
      'Đối tượng': t.target_audience || '',
      'Nội dung dự kiến': t.expected_content || '',
      'Thời lượng': t.duration || '',
      'Hình thức': t.delivery_method || '',
      'Giảng viên': t.instructor || '',
      'Mục tiêu': t.target_goal || '',
      'Cơ sở xây dựng (Lý do đề xuất)': t.proposal_basis || '',
      'Đơn vị đăng ký nhu cầu (Số lượng)': ''
    }));

    const ws2 = xlsx.utils.json_to_sheet(dataSheet2);
    ws2['!cols'] = [
      { wch: 6 },  // TT
      { wch: 14 }, // Mã Chuyên Đề
      { wch: 35 }, // Nhóm chương trình
      { wch: 45 }, // Tên chương trình
      { wch: 38 }, // Đối tượng
      { wch: 50 }, // Nội dung dự kiến
      { wch: 14 }, // Thời lượng
      { wch: 18 }, // Hình thức
      { wch: 28 }, // Giảng viên
      { wch: 45 }, // Mục tiêu
      { wch: 40 }, // Cơ sở xây dựng
      { wch: 30 }  // Đơn vị đăng ký nhu cầu (Số lượng)
    ];
    xlsx.utils.book_append_sheet(wb, ws2, 'Mau_05_Ngoai_Khung');

    // ==========================================
    // SHEET 3: MẪU SỐ 06 - KẾ HOẠCH ĐÀO TẠO, THI ĐỀ XUẤT TRIỂN KHAI CHO CÁC ĐƠN VỊ NĂM 2027 (TSC, VPĐD, ĐVSN)
    // ==========================================
    const dataSheet3 = [
      {
        'TT': 1,
        'Chương trình đào tạo/hội thảo/thi (kèm theo Nội dung đề xuất)': 'Ví dụ: Hội thảo chia sẻ kỹ năng quản trị trải nghiệm khách hàng số',
        'Đối tượng': 'Giao dịch viên, Kiểm soát viên, Cán bộ QHKH',
        'Số lượng': 25,
        'Thời lượng (ngày/giờ)': '2 ngày',
        'Hình thức đào tạo': 'Kết hợp (Trực tiếp & Trực tuyến)',
        'Nguồn giảng viên/nguồn câu hỏi': 'Chuyên gia ngoài kết hợp Giảng viên nội bộ Agribank',
        'Ghi chú / Kiến nghị chi tiết': 'Đề xuất phối hợp tổ chức tập trung cho các đơn vị khu vực'
      },
      {
        'TT': 2,
        'Chương trình đào tạo/hội thảo/thi (kèm theo Nội dung đề xuất)': '',
        'Đối tượng': '',
        'Số lượng': '',
        'Thời lượng (ngày/giờ)': '',
        'Hình thức đào tạo': '',
        'Nguồn giảng viên/nguồn câu hỏi': '',
        'Ghi chú / Kiến nghị chi tiết': ''
      },
      {
        'TT': 3,
        'Chương trình đào tạo/hội thảo/thi (kèm theo Nội dung đề xuất)': '',
        'Đối tượng': '',
        'Số lượng': '',
        'Thời lượng (ngày/giờ)': '',
        'Hình thức đào tạo': '',
        'Nguồn giảng viên/nguồn câu hỏi': '',
        'Ghi chú / Kiến nghị chi tiết': ''
      }
    ];

    const ws3 = xlsx.utils.json_to_sheet(dataSheet3);
    ws3['!cols'] = [
      { wch: 6 },
      { wch: 48 },
      { wch: 30 },
      { wch: 14 },
      { wch: 20 },
      { wch: 24 },
      { wch: 35 },
      { wch: 40 }
    ];
    xlsx.utils.book_append_sheet(wb, ws3, 'Mau_06_De_Xuat_TSC_VPDD');

    // ==========================================
    // SHEET 4: HƯỚNG DẪN KÊ KHAI
    // ==========================================
    const dataSheet4 = [
      { 'Mục': '1. Mẫu số 04 (Mau_04_Khung_Chuc_Danh)', 'Nội dung': 'Gồm 818 chuyên đề Khung chương trình đào tạo theo vị trí chức danh (Phụ lục I đến IV). Các đơn vị CHỈ NHẬP VÀO 2 CỘT CUỐI: [Đã học (số lượng)] và [Đăng ký học năm 2027 (số lượng)]. Các cột thông tin mô tả chuyên đề giữ nguyên.' },
      { 'Mục': '2. Mẫu số 05 (Mau_05_Ngoai_Khung)', 'Nội dung': 'Gồm 26 chương trình đào tạo ngoài khung đã được Agribank ban hành (gồm 6 nhóm từ I đến VI). Các đơn vị CHỈ NHẬP VÀO CỘT CUỐI: [Đơn vị đăng ký nhu cầu (Số lượng)] nếu có nhu cầu đào tạo.' },
      { 'Mục': '3. Mẫu số 06 (Mau_06_De_Xuat_TSC_VPDD)', 'Nội dung': 'Dành riêng cho các đơn vị Trụ sở chính, Văn phòng Đại diện, Đơn vị sự nghiệp chủ động đề xuất các khóa đào tạo, hội thảo, thi, hội thi... mới do đơn vị mình tổ chức cho người lao động toàn hệ thống.' },
      { 'Mục': '4. Hỗ trợ kỹ thuật', 'Nội dung': 'Sau khi điền số liệu, đơn vị có thể tải file trực tiếp lên App Web Khảo sát hoặc gửi file về Admin để được hỗ trợ nộp hộ.' }
    ];
    const ws4 = xlsx.utils.json_to_sheet(dataSheet4);
    ws4['!cols'] = [{ wch: 35 }, { wch: 90 }];
    xlsx.utils.book_append_sheet(wb, ws4, 'Huong_Dan_Ke_Khai');

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

    // Đọc file Excel / CSV (hỗ trợ UTF-8 cho CSV)
    let workbook: xlsx.WorkBook;
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text();
      workbook = xlsx.read(text, { type: 'string' });
    } else {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      workbook = xlsx.read(buffer, { type: 'buffer' });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: 'File Excel rỗng, không tìm thấy Sheet nào.' }, { status: 400 });
    }

    // Tải toàn bộ danh mục chương trình và chuyên đề chính thức vào bộ nhớ để đối chiếu tốc độ cao
    const allOfficialPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all() as any[];
    const allOfficialTopics = db.prepare(`
      SELECT t.id, t.program_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
             p.code as program_code, p.name as program_name
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
    `).all() as any[];

    const parseRes = parseTrainingDemandExcel(workbook, allOfficialPrograms, allOfficialTopics);

    // Kiểm tra nếu file có lỗi dữ liệu nghiêm trọng ở chế độ execute
    if (mode === 'execute' && parseRes.errors && parseRes.errors.length > 0) {
      return NextResponse.json({
        error: `File Excel chứa ${parseRes.errors.length} lỗi dữ liệu không hợp lệ. Vui lòng chỉnh sửa trước khi nạp:`,
        details: parseRes.errors
      }, { status: 400 });
    }

    if (parseRes.grandTotalParticipants <= 0 && (parseRes.totalCompletedParticipants || 0) <= 0) {
      return NextResponse.json({
        error: 'Không tìm thấy số lượng học viên hợp lệ (> 0) trong file Excel. Vui lòng kiểm tra lại file đã nhập số lượng tại cột [Đăng ký học năm 2027] hoặc [Đã học] chưa.',
        details: parseRes.errors.length > 0 ? parseRes.errors : undefined
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
        totalRowsProcessed: parseRes.totalRowsProcessed,
        programsCount: parseRes.programsSummary.length,
        topicsCount: parseRes.totalInFrameworkTopics,
        inFrameworkParticipants: parseRes.totalInFrameworkParticipants,
        totalCompletedParticipants: parseRes.totalCompletedParticipants,
        proposalsCount: parseRes.proposalsList.length,
        proposalParticipants: parseRes.totalProposalParticipants,
        grandTotalParticipants: parseRes.grandTotalParticipants,
        unmatchedCount: parseRes.unmatchedRows.length,
        unmatchedRows: parseRes.unmatchedRows,
        errorsCount: parseRes.errors.length,
        errors: parseRes.errors,
        fileTotalParticipants: parseRes.fileTotalParticipants,
        comparisonWithFileTotal: parseRes.comparisonWithFileTotal,
        programs: parseRes.programsSummary,
        proposals: parseRes.proposalsList,
        warnings: parseRes.warnings
      });
    }

    // 2. Chế độ EXECUTE: Kiểm tra bảo vệ không cho import đè lên bản SUBMITTED trừ khi REOPENED
    let submission = db.prepare(`
      SELECT * FROM training_demand_submissions
      WHERE collection_id = ? AND unit_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(collectionId, unitId) as any;

    if (submission && submission.status === 'SUBMITTED') {
      return NextResponse.json({
        error: `Đơn vị "${unit.unit_name}" đã nộp bản kê khai chính thức (SUBMITTED) vào lúc ${submission.submitted_at || ''}. Hệ thống không cho phép import đè. Vui lòng mở lại (REOPEN) đợt kê khai của đơn vị trước khi có thể nạp lại file Excel.`
      }, { status: 403 });
    }

    // Thực hiện lưu và cấp Biên nhận
    db.exec('BEGIN TRANSACTION;');
    try {
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
          demand_program_id, program_topic_id, participant_count, completed_count,
          topic_name_snapshot, delivery_method_snapshot, duration_snapshot,
          attendees, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const [pId, pData] of parseRes.programsDataMap.entries()) {
        const dpRes = insertDemandProgStmt.run(submission.id, pId, sourceNote);
        const demandProgramId = Number(dpRes.lastInsertRowid);

        for (const [tId, tData] of pData.topics.entries()) {
          insertDemandTopicStmt.run(
            demandProgramId,
            tId,
            tData.count,
            tData.completedCount || 0,
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

      for (const prop of parseRes.proposalsList) {
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
          grandTotalParticipants: parseRes.grandTotalParticipants,
          totalCompletedParticipants: parseRes.totalCompletedParticipants,
          programsCount: parseRes.programsSummary.length,
          topicsCount: parseRes.totalInFrameworkTopics,
          proposalsCount: parseRes.proposalsList.length,
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
        grandTotalParticipants: parseRes.grandTotalParticipants,
        totalCompletedParticipants: parseRes.totalCompletedParticipants,
        programsCount: parseRes.programsSummary.length,
        topicsCount: parseRes.totalInFrameworkTopics,
        proposalsCount: parseRes.proposalsList.length
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
