import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getParticipatingUnits, PARTICIPATING_UNITS_SQL_CONDITION } from '@/lib/units';
import { resolveActiveCollection, getTrainingDemandMetricsByUnit, calculateSubmissionParticipantsDetailed, getTopicDemandReport } from '@/lib/aggregation';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'SUMMARY'; // 'SUMMARY' | 'BY_PROGRAM' | 'BY_POSITION' | 'BY_TOPIC' | 'BY_UNIT' | 'EXPORT_EXCEL'
  const exportFormat = searchParams.get('exportFormat'); // 'BY_PROGRAM' | 'BY_POSITION' | 'BY_TOPIC' | 'BY_UNIT' | 'ALL_SYSTEM'
  const collectionIdStr = searchParams.get('collectionId');
  const programIdStr = searchParams.get('programId');
  const positionIdStr = searchParams.get('positionId');
  const topicIdStr = searchParams.get('topicId');
  const unitIdStr = searchParams.get('unitId');

  const db = getDatabase();

  const { collection } = resolveActiveCollection(db, collectionIdStr);
  const collectionId = collection?.id || null;

  // 1. BÁO CÁO TỔNG HỢP TOÀN HỆ THỐNG (SUMMARY METRICS)
  if (type === 'SUMMARY') {
    const participatingUnits = getParticipatingUnits(db);
    const totalUnitsCount = participatingUnits.length;
    const trainingMetrics = collectionId ? getTrainingDemandMetricsByUnit(db, collectionId) : new Map();

    let submittedCount = 0;
    let draftCount = 0;
    let reopenedCount = 0;
    let m04TotalParticipants = 0;
    let m04TotalCompleted = 0;
    let m05TotalParticipants = 0;
    let m06TotalParticipants = 0;

    for (const m of trainingMetrics.values()) {
      m04TotalParticipants += m.m04Participants;
      m04TotalCompleted += m.m04Completed;
      m05TotalParticipants += m.m05Participants;
      m06TotalParticipants += m.m06Participants;

      if (m.status === 'SUBMITTED') {
        submittedCount++;
      } else if (m.status === 'REOPENED') {
        reopenedCount++;
        submittedCount++; // Bản nộp trước đó vẫn có hiệu lực
      } else if (m.status === 'DRAFT') {
        draftCount++;
      }
    }

    const totalParticipants = m04TotalParticipants + m05TotalParticipants + m06TotalParticipants;

    // Số chương trình đã được các đơn vị lựa chọn
    const totalProgramsDeclared = (db.prepare(`
      SELECT COUNT(DISTINCT dp.program_id) as c
      FROM training_demand_programs dp
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
    `).get(collectionId) as any).c;

    // Top 10 chuyên đề chương trình có nhu cầu cao nhất
    const topTopics = db.prepare(`
      SELECT t.id, t.topic_name, t.delivery_method, t.duration,
             p.name as program_name,
             SUM(dt.participant_count) as total_demand,
             COUNT(DISTINCT ds.unit_id) as unit_count
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      JOIN training_programs p ON t.program_id = p.id
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ? AND dt.participant_count > 0
      GROUP BY t.id
      ORDER BY total_demand DESC
      LIMIT 10
    `).all(collectionId);

    const collectionsList = db.prepare('SELECT id, code, title, status FROM collections ORDER BY id DESC').all();

    return NextResponse.json({
      collectionId,
      totalUnits: totalUnitsCount,
      submittedUnits: submittedCount,
      pendingUnits: totalUnitsCount - submittedCount,
      draftUnits: draftCount,
      totalParticipants,
      totalProgramsDeclared,
      topTopics,
      collections: collectionsList
    });
  }

  // 2. BÁO CÁO THEO KHUNG CHƯƠNG TRÌNH (MA TRẬN CÁC ĐƠN VỊ - THEO YÊU CẦU MỚI)
  if (type === 'BY_PROGRAM') {
    if (!programIdStr) {
      return NextResponse.json({ error: 'Cần chọn programId để xem báo cáo theo chương trình.' }, { status: 400 });
    }
    const progId = parseInt(programIdStr);
    const program = db.prepare('SELECT * FROM training_programs WHERE id = ?').get(progId) as any;
    if (!program) return NextResponse.json({ error: 'Không tìm thấy khung chương trình.' }, { status: 404 });

    // Lấy danh sách chuyên đề của chương trình này
    const topics = db.prepare(`
      SELECT id, topic_name, delivery_method, duration, display_order
      FROM training_program_topics
      WHERE program_id = ?
      ORDER BY display_order ASC, id ASC
    `).all(progId) as any[];

    // Lấy ma trận dữ liệu từng đơn vị đăng ký các chuyên đề thuộc chương trình này
    const demandRows = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name,
             dt.program_topic_id, dt.participant_count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ? AND dp.program_id = ?
    `).all(collectionId, progId) as any[];

    // Lấy danh sách các đơn vị đã đăng ký chương trình này
    const participatingUnitsMap = new Map<number, any>();
    demandRows.forEach(row => {
      if (!participatingUnitsMap.has(row.unit_id)) {
        participatingUnitsMap.set(row.unit_id, {
          unit_id: row.unit_id,
          unit_code: row.unit_code,
          unit_name: row.unit_name,
          topicsMap: {}
        });
      }
      participatingUnitsMap.get(row.unit_id).topicsMap[row.program_topic_id] = row.participant_count;
    });

    // Tính tổng từng chuyên đề
    const topicTotals: Record<number, number> = {};
    topics.forEach(t => {
      topicTotals[t.id] = 0;
    });

    demandRows.forEach(row => {
      topicTotals[row.program_topic_id] = (topicTotals[row.program_topic_id] || 0) + row.participant_count;
    });

    return NextResponse.json({
      program,
      topics,
      units: Array.from(participatingUnitsMap.values()),
      topicTotals,
      totalParticipantsInProgram: Object.values(topicTotals).reduce((a, b) => a + b, 0)
    });
  }

  // 3. BÁO CÁO THEO VỊ TRÍ (BACKWARD COMPATIBILITY)
  if (type === 'BY_POSITION') {
    if (!positionIdStr) {
      return NextResponse.json({ error: 'Cần chọn positionId để xem báo cáo theo vị trí.' }, { status: 400 });
    }
    const posId = parseInt(positionIdStr);
    const position = db.prepare('SELECT * FROM training_positions WHERE id = ?').get(posId) as any;
    if (!position) return NextResponse.json({ error: 'Không tìm thấy vị trí.' }, { status: 404 });

    const topics = db.prepare(`
      SELECT t.id, t.name, t.delivery_method, t.duration, pt.display_order
      FROM training_position_topics pt
      JOIN training_topics t ON pt.topic_id = t.id
      WHERE pt.position_id = ?
      ORDER BY pt.display_order ASC, t.id ASC
    `).all(posId) as any[];

    const demandRows = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name, dp.target_headcount,
             dt.topic_id, dt.participant_count
      FROM training_demand_topics dt
      JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ? AND dp.position_id = ?
    `).all(collectionId, posId) as any[];

    const participatingUnitsMap = new Map<number, any>();
    demandRows.forEach(row => {
      if (!participatingUnitsMap.has(row.unit_id)) {
        participatingUnitsMap.set(row.unit_id, {
          unit_id: row.unit_id,
          unit_code: row.unit_code,
          unit_name: row.unit_name,
          target_headcount: row.target_headcount,
          topicsMap: {}
        });
      }
      participatingUnitsMap.get(row.unit_id).topicsMap[row.topic_id] = row.participant_count;
    });

    const topicTotals: Record<number, number> = {};
    topics.forEach(t => {
      topicTotals[t.id] = 0;
    });

    demandRows.forEach(row => {
      topicTotals[row.topic_id] = (topicTotals[row.topic_id] || 0) + row.participant_count;
    });

    return NextResponse.json({
      position,
      topics,
      units: Array.from(participatingUnitsMap.values()),
      topicTotals,
      totalParticipantsInPosition: Object.values(topicTotals).reduce((a, b) => a + b, 0)
    });
  }


  // 3.5. BÁO CÁO THEO CHUYÊN ĐỀ (BY_TOPIC)
  if (type === 'BY_TOPIC') {
    if (!topicIdStr) {
      return NextResponse.json({ error: 'Cần chọn topicId để xem báo cáo theo chuyên đề.' }, { status: 400 });
    }
    const topicId = parseInt(topicIdStr, 10);
    if (isNaN(topicId)) {
      return NextResponse.json({ error: 'topicId không hợp lệ.' }, { status: 400 });
    }

    const report = getTopicDemandReport(db, topicId, collectionId);
    if (!report) {
      return NextResponse.json({ error: 'Không tìm thấy chuyên đề đào tạo.' }, { status: 404 });
    }

    return NextResponse.json(report);
  }

  // 4. BÁO CÁO THEO TỪNG ĐƠN VỊ (HỖ TRỢ CẢ "TẤT CẢ ĐƠN VỊ" VÀ "TỪNG ĐƠN VỊ")
  if (type === 'BY_UNIT') {
    if (!unitIdStr) return NextResponse.json({ error: 'Thiếu unitId.' }, { status: 400 });

    if (unitIdStr === 'ALL') {
      const allUnits = getParticipatingUnits(db);
      const trainingMetrics = collectionId ? getTrainingDemandMetricsByUnit(db, collectionId) : new Map();

      const unitsReport = allUnits.map(u => {
        const sub = trainingMetrics.get(u.id);
        const totalRegistered = sub ? sub.totalParticipantsCombined : 0;
        return {
          id: u.id,
          unitId: u.id,
          unit_code: u.unit_code,
          unitCode: u.unit_code,
          unit_name: u.unit_name,
          unitName: u.unit_name,
          region: u.region,
          unit_type: u.unit_type,
          unitType: u.unit_type,
          submission_id: sub?.submissionId || null,
          submissionId: sub?.submissionId || null,
          status: sub ? sub.status : 'NOT_SUBMITTED',
          submitted_at: sub?.submittedAt || null,
          submittedAt: sub?.submittedAt || null,
          updated_at: sub?.updatedAt || null,
          updatedAt: sub?.updatedAt || null,
          receiptCode: sub?.receiptCode || null,
          m04Participants: sub?.m04Participants || 0,
          m04Completed: sub?.m04Completed || 0,
          m05Participants: sub?.m05Participants || 0,
          m06Participants: sub?.m06Participants || 0,
          position_count: sub?.m04TopicsCount || 0,
          programCount: (sub?.m04TopicsCount || 0) + (sub?.m05TopicsCount || 0),
          topic_count: (sub?.m04TopicsCount || 0) + (sub?.m05TopicsCount || 0),
          topicCount: (sub?.m04TopicsCount || 0) + (sub?.m05TopicsCount || 0),
          total_registered: totalRegistered,
          totalParticipants: totalRegistered
        };
      });

      const submittedCount = unitsReport.filter(u => u.status === 'SUBMITTED').length;
      const draftCount = unitsReport.filter(u => u.status === 'DRAFT').length;
      const reopenedCount = unitsReport.filter(u => u.status === 'REOPENED').length;
      const notSubmittedCount = unitsReport.filter(u => u.status === 'NOT_SUBMITTED').length;
      const totalRegistrations = unitsReport.reduce((sum, u) => sum + u.total_registered, 0);

      const stats = {
        totalUnits: allUnits.length,
        submittedCount,
        draftCount,
        reopenedCount,
        notSubmittedCount,
        totalRegistrations
      };

      return NextResponse.json({
        isAllUnits: true,
        stats,
        totalUnits: allUnits.length,
        submittedCount,
        draftCount,
        reopenedCount,
        notSubmittedCount,
        totalRegistrations,
        unitsReport
      });
    }

    const targetUnitId = parseInt(unitIdStr);

    const unit = db.prepare('SELECT id, unit_code, unit_name, region, unit_type FROM units WHERE id = ?').get(targetUnitId) as any;
    const submission = db.prepare(`
      SELECT ts.*, u.full_name as submitted_by_name
      FROM training_demand_submissions ts
      LEFT JOIN users u ON ts.submitted_by = u.id
      WHERE ts.collection_id = ? AND ts.unit_id = ?
      ORDER BY ts.version DESC LIMIT 1
    `).get(collectionId, targetUnitId) as any;

    if (!submission) {
      return NextResponse.json({
        unit,
        submission: null,
        declaredPrograms: [],
        proposals: [],
        programRecords: [],
        positionRecords: [],
        records: []
      });
    }

    // 1. Lấy danh sách Khung chương trình đã khai báo (kèm chi tiết chuyên đề)
    const declaredPrograms = db.prepare(`
      SELECT dp.id as demand_program_id, dp.program_id, dp.notes, dp.created_at,
             p.code as program_code, p.name as program_name, p.group_name,
             (SELECT COUNT(*) FROM training_program_topics WHERE program_id = p.id) as total_available_topics,
             (SELECT COUNT(*) FROM training_demand_program_topics WHERE demand_program_id = dp.id AND participant_count > 0) as registered_topic_count,
             (SELECT COALESCE(SUM(participant_count), 0) FROM training_demand_program_topics WHERE demand_program_id = dp.id) as sum_participants,
             (SELECT COALESCE(SUM(completed_count), 0) FROM training_demand_program_topics WHERE demand_program_id = dp.id) as sum_completed
      FROM training_demand_programs dp
      JOIN training_programs p ON dp.program_id = p.id
      WHERE dp.submission_id = ?
      ORDER BY p.display_order ASC, dp.id ASC
    `).all(submission.id) as any[];

    const getProgramTopicsStmt = db.prepare(`
      SELECT dt.id as demand_topic_id, dt.program_topic_id, dt.participant_count,
             COALESCE(dt.completed_count, 0) as completed_count,
             t.topic_name, t.position_code, t.target_audience, t.delivery_method, t.duration,
             t.learning_path, t.competency, t.certificate_requirement,
             t.cert_planning_higher, t.cert_appoint_higher, t.cert_reappoint, t.display_order
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      WHERE dt.demand_program_id = ?
      ORDER BY t.display_order ASC, t.id ASC
    `);

    const programsWithDetails = declaredPrograms.map(prog => {
      const topics = getProgramTopicsStmt.all(prog.demand_program_id);
      return {
        ...prog,
        topics
      };
    });

    // 1.5. Lấy danh sách Đề xuất ngoài khung của đơn vị (Mục 2.8)
    const proposals = db.prepare(`
      SELECT * FROM training_demand_proposals
      WHERE submission_id = ?
      ORDER BY id ASC
    `).all(submission.id) as any[];

    const programRecords = db.prepare(`
      SELECT p.id as program_id, p.code as program_code, p.name as program_name, p.group_name,
             t.id as topic_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
             t.learning_path, t.competency, t.certificate_requirement,
             t.cert_planning_higher, t.cert_appoint_higher, t.cert_reappoint,
             COALESCE(dt.completed_count, 0) as completed_count,
             dt.participant_count
      FROM training_demand_programs dp
      JOIN training_programs p ON dp.program_id = p.id
      JOIN training_demand_program_topics dt ON dt.demand_program_id = dp.id
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      WHERE dp.submission_id = ?
      ORDER BY p.display_order ASC, t.display_order ASC
    `).all(submission.id);

    const positionRecords = db.prepare(`
      SELECT p.id as position_id, p.code as position_code, p.name as position_name, dp.target_headcount,
             t.id as topic_id, t.name as topic_name, t.delivery_method, t.duration,
             dt.participant_count
      FROM training_demand_positions dp
      JOIN training_positions p ON dp.position_id = p.id
      JOIN training_demand_topics dt ON dt.demand_position_id = dp.id
      JOIN training_topics t ON dt.topic_id = t.id
      WHERE dp.submission_id = ?
      ORDER BY p.code ASC, t.id ASC
    `).all(submission.id);

    return NextResponse.json({
      unit,
      submission,
      declaredPrograms: programsWithDetails,
      proposals,
      programRecords,
      positionRecords,
      records: programRecords
    });
  }

  // 5. XUẤT EXCEL CHUẨN
  if (type === 'EXPORT_EXCEL') {
    const wb = xlsx.utils.book_new();

    // FORMAT A: THEO KHUNG CHƯƠNG TRÌNH (CHUẨN THEO PHỤ LỤC & MA TRẬN ĐƠN VỊ)
    if (exportFormat === 'BY_PROGRAM' && programIdStr) {
      const progId = parseInt(programIdStr);
      const prog = db.prepare('SELECT code, name FROM training_programs WHERE id = ?').get(progId) as any;

      const programRows = db.prepare(`
        SELECT t.topic_name as 'Tên chuyên đề',
               t.delivery_method as 'Hình thức đào tạo',
               t.duration as 'Thời lượng đào tạo',
               u.unit_code as 'Mã đơn vị',
               u.unit_name as 'Tên đơn vị',
               dt.participant_count as 'Số lượng người đăng ký'
        FROM training_demand_program_topics dt
        JOIN training_program_topics t ON dt.program_topic_id = t.id
        JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
        JOIN training_demand_submissions ds ON dp.submission_id = ds.id
        JOIN units u ON ds.unit_id = u.id
        WHERE ds.collection_id = ? AND dp.program_id = ? AND dt.participant_count > 0
        ORDER BY t.display_order ASC, u.unit_code ASC
      `).all(collectionId, progId);

      const ws = xlsx.utils.json_to_sheet(programRows);
      xlsx.utils.book_append_sheet(wb, ws, (prog?.code || 'Chuong_Trinh').substring(0, 31));
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="Bao_Cao_Nhu_Cau_${prog?.code || progId}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }


    // FORMAT A2: THEO CHUYÊN ĐỀ
    if (exportFormat === 'BY_TOPIC' && topicIdStr) {
      const topicId = parseInt(topicIdStr, 10);
      if (isNaN(topicId)) {
        return NextResponse.json({ error: 'topicId không hợp lệ.' }, { status: 400 });
      }

      const report = getTopicDemandReport(db, topicId, collectionId);
      if (!report) {
        return NextResponse.json({ error: 'Không tìm thấy chuyên đề đào tạo.' }, { status: 404 });
      }

      const rows = report.unitDemands.map((r, idx) => ({
        'STT': idx + 1,
        'Mã đơn vị': r.unit_code,
        'Tên đơn vị': r.unit_name,
        'Vị trí chức danh': `[${r.position_code}] ${r.position_name}`,
        'Hình thức đào tạo': report.topic.delivery_method || 'Trực tiếp',
        'Thời lượng đào tạo': report.topic.duration || '02 ngày',
        'Số lượng người đăng ký': r.participant_count,
        'Đã học': r.completed_count || 0,
        'Thời gian nộp': r.submitted_at || ''
      }));

      const ws = xlsx.utils.json_to_sheet(rows.length > 0 ? rows : [{
        'STT': '',
        'Mã đơn vị': '',
        'Tên đơn vị': 'Chưa có đơn vị nào đăng ký',
        'Vị trí chức danh': '',
        'Hình thức đào tạo': report.topic.delivery_method || '',
        'Thời lượng đào tạo': report.topic.duration || '',
        'Số lượng người đăng ký': 0,
        'Đã học': 0,
        'Thời gian nộp': ''
      }]);

      xlsx.utils.book_append_sheet(wb, ws, 'Nhu_Cau_Chuyen_De');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const asciiName = (report.topic.name || `Topic_${topicId}`)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 50);

      const encodedFilename = encodeURIComponent(`Nhu_Cau_${report.topic.name || `Topic_${topicId}`}.xlsx`);

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="Nhu_Cau_${asciiName}.xlsx"; filename*=UTF-8''${encodedFilename}`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // FORMAT B: TỔNG HỢP TOÀN HỆ THỐNG
    if (exportFormat === 'ALL_SYSTEM') {
      const allRows = db.prepare(`
        SELECT p.name as 'Khung Chương trình đào tạo',
               t.topic_name as 'Tên chuyên đề',
               t.delivery_method as 'Hình thức đào tạo',
               t.duration as 'Thời lượng đào tạo',
               COALESCE(SUM(dt.participant_count), 0) as 'Tổng số lượng người đăng ký',
               COUNT(DISTINCT ds.unit_id) as 'Số đơn vị có nhu cầu'
        FROM training_demand_program_topics dt
        JOIN training_program_topics t ON dt.program_topic_id = t.id
        JOIN training_programs p ON t.program_id = p.id
        JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
        JOIN training_demand_submissions ds ON dp.submission_id = ds.id
        WHERE ds.collection_id = ?
        GROUP BY p.id, t.id
        HAVING 'Tổng số lượng người đăng ký' > 0
        ORDER BY p.display_order ASC, t.display_order ASC
      `).all(collectionId);

      const ws = xlsx.utils.json_to_sheet(allRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Tong_Hop_Nhu_Cau_He_Thong');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Tong_Hop_Nhu_Cau_Dao_Tao_Toan_He_Thong.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // FORMAT C: THEO ĐƠN VỊ (HỖ TRỢ XUẤT TẤT CẢ HOẶC TỪNG ĐƠN VỊ CỤ THỂ)
    if (exportFormat === 'BY_UNIT') {
      const isUnitRole = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(session.role);
      const effectiveUnitIdStr = isUnitRole ? String(session.unitId) : unitIdStr;

      if (effectiveUnitIdStr === 'ALL' || !effectiveUnitIdStr) {
        // 1. Sheet Chi tiết tất cả chuyên đề của tất cả đơn vị
        const allDeclaredRows = db.prepare(`
          SELECT u.unit_code as 'Mã đơn vị',
                 u.unit_name as 'Tên đơn vị',
                 u.region as 'Vùng miền',
                 p.name as 'Khung Chương trình đào tạo',
                 t.position_code as 'Vị trí chức danh',
                 t.topic_name as 'Tên chuyên đề',
                 t.delivery_method as 'Hình thức đào tạo',
                 t.duration as 'Thời lượng đào tạo',
                 t.learning_path as 'Lộ trình đào tạo',
                 t.competency as 'Năng lực',
                 t.certificate_requirement as 'Chứng chỉ/chuẩn đào tạo',
                 t.cert_planning_higher as 'Quy hoạch VT cao hơn',
                 t.cert_appoint_higher as 'Bổ nhiệm VT cao hơn',
                 t.cert_reappoint as 'Bổ nhiệm lại',
                 COALESCE(dt.completed_count, 0) as 'Đã học',
                 dt.participant_count as 'Đăng ký học năm 2027',
                 CASE 
                   WHEN ds.status = 'SUBMITTED' THEN 'ĐÃ GỬI CHÍNH THỨC'
                   WHEN ds.status = 'DRAFT' THEN 'ĐANG SOẠN THẢO'
                   WHEN ds.status = 'REOPENED' THEN 'MỞ LẠI CHO SỬA'
                   ELSE 'CHƯA KÊ KHAI'
                 END as 'Trạng thái bài nộp',
                 ds.submitted_at as 'Thời gian gửi'
          FROM training_demand_program_topics dt
          JOIN training_program_topics t ON dt.program_topic_id = t.id
          JOIN training_programs p ON t.program_id = p.id
          JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
          JOIN training_demand_submissions ds ON dp.submission_id = ds.id
          JOIN units u ON ds.unit_id = u.id
          WHERE ds.collection_id = ? AND (dt.participant_count > 0 OR dt.completed_count > 0)
          ORDER BY CAST(u.unit_code AS INTEGER) ASC, u.unit_code ASC, p.display_order ASC, t.display_order ASC
        `).all(collectionId) as any[];

        // 2. Sheet Tổng hợp tiến độ toàn bộ đơn vị tham gia khảo sát (chuẩn hóa Single Source of Truth)
        const participatingUnits = getParticipatingUnits(db);
        const trainingMetrics = collectionId ? getTrainingDemandMetricsByUnit(db, collectionId) : new Map();

        const REGION_LABELS: Record<string, string> = {
          MIEN_BAC: 'Miền Bắc',
          MIEN_TRUNG: 'Miền Trung',
          TAY_NGUYEN: 'Tây Nguyên',
          MIEN_NAM: 'Miền Nam',
          HO: 'Trụ sở chính'
        };

        const summary155Rows = participatingUnits.map((u, idx) => {
          const sub = trainingMetrics.get(u.id);
          const st = sub ? (sub.status === 'SUBMITTED' ? 'ĐÃ GỬI CHÍNH THỨC' : sub.status === 'REOPENED' ? 'MỞ LẠI CHO SỬA' : 'ĐANG SOẠN THẢO') : 'CHƯA KÊ KHAI';
          return {
            'STT': idx + 1,
            'Mã đơn vị': u.unit_code,
            'Tên đơn vị': u.unit_name,
            'Khu vực': REGION_LABELS[u.region] || u.region || '',
            'Trạng thái': st,
            'Mẫu 04 - Số chuyên đề': sub?.m04TopicsCount || 0,
            'Mẫu 04 - Lượt đăng ký': sub?.m04Participants || 0,
            'Mẫu 04 - Lượt đã học': sub?.m04Completed || 0,
            'Mẫu 05 - Số chuyên đề': sub?.m05TopicsCount || 0,
            'Mẫu 05 - Lượt đăng ký': sub?.m05Participants || 0,
            'Mẫu 06 - Số đề xuất': sub?.m06ProposalsCount || 0,
            'Mẫu 06 - Lượt đăng ký': sub?.m06Participants || 0,
            'Tổng số lượt đăng ký': sub?.totalParticipantsCombined || 0,
            'Thời gian gửi chính thức': sub?.submittedAt || ''
          };
        });

        const wsSummary = xlsx.utils.json_to_sheet(summary155Rows);
        xlsx.utils.book_append_sheet(wb, wsSummary, 'Tong_Hop_Toan_Mang_Luoi');

        const wsDetail = xlsx.utils.json_to_sheet(allDeclaredRows);
        xlsx.utils.book_append_sheet(wb, wsDetail, 'Chi_Tiet_Tung_Don_Vi');

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buf, {
          headers: {
            'Content-Disposition': 'attachment; filename="Nhu_Cau_Dao_Tao_Toan_Mang_Luoi_Agribank.xlsx"',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        });
      } else {
        const uId = parseInt(effectiveUnitIdStr);
        const unit = db.prepare('SELECT unit_code, unit_name FROM units WHERE id = ?').get(uId) as any;

        const unitRows = db.prepare(`
          SELECT u.unit_code as 'Mã đơn vị',
                 u.unit_name as 'Tên đơn vị',
                 p.name as 'Khung Chương trình đào tạo',
                 t.position_code as 'Vị trí chức danh',
                 t.topic_name as 'Tên chuyên đề',
                 t.delivery_method as 'Hình thức đào tạo',
                 t.duration as 'Thời lượng đào tạo',
                 t.learning_path as 'Lộ trình đào tạo',
                 t.competency as 'Năng lực',
                 t.certificate_requirement as 'Chứng chỉ/chuẩn đào tạo',
                 t.cert_planning_higher as 'Quy hoạch VT cao hơn',
                 t.cert_appoint_higher as 'Bổ nhiệm VT cao hơn',
                 t.cert_reappoint as 'Bổ nhiệm lại',
                 COALESCE(dt.completed_count, 0) as 'Đã học',
                 dt.participant_count as 'Đăng ký học năm 2027'
          FROM training_demand_program_topics dt
          JOIN training_program_topics t ON dt.program_topic_id = t.id
          JOIN training_programs p ON t.program_id = p.id
          JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
          JOIN training_demand_submissions ds ON dp.submission_id = ds.id
          JOIN units u ON ds.unit_id = u.id
          WHERE ds.collection_id = ? AND ds.unit_id = ? AND (dt.participant_count > 0 OR dt.completed_count > 0)
          ORDER BY p.display_order ASC, t.display_order ASC
        `).all(collectionId, uId);

        const ws = xlsx.utils.json_to_sheet(unitRows);
        xlsx.utils.book_append_sheet(wb, ws, 'Nhu_Cau_Don_Vi');

        // Bổ sung Sheet Đề xuất đào tạo ngoài khung (nếu có)
        try {
          const proposalRows = db.prepare(`
            SELECT u.unit_code as 'Mã đơn vị',
                   u.unit_name as 'Tên đơn vị',
                   pr.proposal_name as 'Tên chuyên đề / Khóa học đề xuất',
                   pr.target_audience as 'Đối tượng học viên',
                   pr.expected_duration as 'Thời lượng dự kiến',
                   pr.participant_count as 'Số lượng người đăng ký',
                   pr.notes as 'Ghi chú / Kiến nghị'
            FROM training_demand_proposals pr
            JOIN training_demand_submissions ds ON pr.submission_id = ds.id
            JOIN units u ON ds.unit_id = u.id
            WHERE ds.collection_id = ? AND ds.unit_id = ? AND pr.participant_count > 0
            ORDER BY pr.id ASC
          `).all(collectionId, uId);

          if (proposalRows && proposalRows.length > 0) {
            const wsProp = xlsx.utils.json_to_sheet(proposalRows);
            xlsx.utils.book_append_sheet(wb, wsProp, 'De_Xuat_Ngoai_Khung');
          }
        } catch (err) {}

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buf, {
          headers: {
            'Content-Disposition': `attachment; filename="Nhu_Cau_Dao_Tao_${unit?.unit_code || uId}.xlsx"`,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        });
      }
    }
  }

  // 5. BÁO CÁO SO SÁNH BIẾN ĐỘNG GIỮA HAI ĐỢT KHẢO SÁT (MỤC 2.7)
  if (type === 'COMPARE_ROUNDS') {
    const baseCollId = parseInt(searchParams.get('baseCollectionId') || '0');
    const targetCollId = parseInt(searchParams.get('targetCollectionId') || '0');

    if (!baseCollId || !targetCollId) {
      return NextResponse.json({ error: 'Cần chọn đủ baseCollectionId và targetCollectionId để so sánh.' }, { status: 400 });
    }

    const baseColl = db.prepare('SELECT id, code, title FROM collections WHERE id = ?').get(baseCollId) as any;
    const targetColl = db.prepare('SELECT id, code, title FROM collections WHERE id = ?').get(targetCollId) as any;

    if (!baseColl || !targetColl) {
      return NextResponse.json({ error: 'Một trong hai đợt khảo sát không tồn tại.' }, { status: 404 });
    }

    // A. So sánh theo Chuyên đề (Topic Comparison)
    const topicDemandBase = db.prepare(`
      SELECT dt.program_topic_id as topic_id,
             t.topic_name,
             p.name as program_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      JOIN training_programs p ON t.program_id = p.id
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
      GROUP BY dt.program_topic_id
    `).all(baseCollId) as any[];

    const topicDemandTarget = db.prepare(`
      SELECT dt.program_topic_id as topic_id,
             t.topic_name,
             p.name as program_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      JOIN training_programs p ON t.program_id = p.id
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
      GROUP BY dt.program_topic_id
    `).all(targetCollId) as any[];

    const topicMap = new Map<number, any>();
    topicDemandBase.forEach(item => {
      topicMap.set(item.topic_id, {
        topicId: item.topic_id,
        topicName: item.topic_name,
        programName: item.program_name,
        baseCount: item.count,
        targetCount: 0
      });
    });

    topicDemandTarget.forEach(item => {
      if (!topicMap.has(item.topic_id)) {
        topicMap.set(item.topic_id, {
          topicId: item.topic_id,
          topicName: item.topic_name,
          programName: item.program_name,
          baseCount: 0,
          targetCount: item.count
        });
      } else {
        topicMap.get(item.topic_id).targetCount = item.count;
      }
    });

    const topicComparison = Array.from(topicMap.values()).map(item => ({
      ...item,
      diff: item.targetCount - item.baseCount,
      percentChange: item.baseCount > 0 ? (((item.targetCount - item.baseCount) / item.baseCount) * 100).toFixed(1) : (item.targetCount > 0 ? '+100' : '0')
    })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // B. So sánh theo Đơn vị (Unit Comparison)
    const unitDemandBase = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ?
      GROUP BY ds.unit_id
    `).all(baseCollId) as any[];

    const unitDemandTarget = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ?
      GROUP BY ds.unit_id
    `).all(targetCollId) as any[];

    const unitMap = new Map<number, any>();
    unitDemandBase.forEach(item => {
      unitMap.set(item.unit_id, {
        unitId: item.unit_id,
        unitCode: item.unit_code,
        unitName: item.unit_name,
        baseCount: item.count,
        targetCount: 0
      });
    });

    unitDemandTarget.forEach(item => {
      if (!unitMap.has(item.unit_id)) {
        unitMap.set(item.unit_id, {
          unitId: item.unit_id,
          unitCode: item.unit_code,
          unitName: item.unit_name,
          baseCount: 0,
          targetCount: item.count
        });
      } else {
        unitMap.get(item.unit_id).targetCount = item.count;
      }
    });

    const unitComparison = Array.from(unitMap.values()).map(item => ({
      ...item,
      diff: item.targetCount - item.baseCount,
      percentChange: item.baseCount > 0 ? (((item.targetCount - item.baseCount) / item.baseCount) * 100).toFixed(1) : (item.targetCount > 0 ? '+100' : '0')
    })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // C. Tổng quan
    const baseTotal = topicComparison.reduce((s, t) => s + t.baseCount, 0);
    const targetTotal = topicComparison.reduce((s, t) => s + t.targetCount, 0);

    return NextResponse.json({
      baseColl,
      targetColl,
      summary: {
        baseTotal,
        targetTotal,
        totalDiff: targetTotal - baseTotal,
        baseUnitsCount: unitDemandBase.length,
        targetUnitsCount: unitDemandTarget.length
      },
      topicComparison,
      unitComparison
    });
  }

  // 6. XUẤT EXCEL SO SÁNH GIỮA HAI ĐỢT KHẢO SÁT
  if (type === 'EXPORT_COMPARISON') {
    const baseCollId = parseInt(searchParams.get('baseCollectionId') || '0');
    const targetCollId = parseInt(searchParams.get('targetCollectionId') || '0');

    if (!baseCollId || !targetCollId) {
      return NextResponse.json({ error: 'Cần chọn đủ baseCollectionId và targetCollectionId.' }, { status: 400 });
    }

    const baseColl = db.prepare('SELECT id, code, title FROM collections WHERE id = ?').get(baseCollId) as any;
    const targetColl = db.prepare('SELECT id, code, title FROM collections WHERE id = ?').get(targetCollId) as any;

    const topicDemandBase = db.prepare(`
      SELECT dt.program_topic_id as topic_id,
             t.topic_name, p.name as program_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      JOIN training_programs p ON t.program_id = p.id
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
      GROUP BY dt.program_topic_id
    `).all(baseCollId) as any[];

    const topicDemandTarget = db.prepare(`
      SELECT dt.program_topic_id as topic_id,
             t.topic_name, p.name as program_name,
             SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_program_topics t ON dt.program_topic_id = t.id
      JOIN training_programs p ON t.program_id = p.id
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
      GROUP BY dt.program_topic_id
    `).all(targetCollId) as any[];

    const topicMap = new Map<number, any>();
    topicDemandBase.forEach(item => {
      topicMap.set(item.topic_id, {
        topicName: item.topic_name,
        programName: item.program_name,
        baseCount: item.count,
        targetCount: 0
      });
    });
    topicDemandTarget.forEach(item => {
      if (!topicMap.has(item.topic_id)) {
        topicMap.set(item.topic_id, {
          topicName: item.topic_name,
          programName: item.program_name,
          baseCount: 0,
          targetCount: item.count
        });
      } else {
        topicMap.get(item.topic_id).targetCount = item.count;
      }
    });

    const topicRows = Array.from(topicMap.values()).map((item, idx) => ({
      'STT': idx + 1,
      'Chương trình': item.programName,
      'Chuyên đề': item.topicName,
      [`${baseColl.title} (Đợt 1)`]: item.baseCount,
      [`${targetColl.title} (Đợt 2)`]: item.targetCount,
      'Chênh lệch (+/-)': item.targetCount - item.baseCount,
      '% Biến động': item.baseCount > 0 ? (((item.targetCount - item.baseCount) / item.baseCount) * 100).toFixed(1) + '%' : '-'
    }));

    // B. Đơn vị
    const unitDemandBase = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name, SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ? GROUP BY ds.unit_id
    `).all(baseCollId) as any[];

    const unitDemandTarget = db.prepare(`
      SELECT ds.unit_id, u.unit_code, u.unit_name, SUM(dt.participant_count) as count
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ? GROUP BY ds.unit_id
    `).all(targetCollId) as any[];

    const unitMap = new Map<number, any>();
    unitDemandBase.forEach(item => {
      unitMap.set(item.unit_id, {
        unitCode: item.unit_code,
        unitName: item.unit_name,
        baseCount: item.count,
        targetCount: 0
      });
    });
    unitDemandTarget.forEach(item => {
      if (!unitMap.has(item.unit_id)) {
        unitMap.set(item.unit_id, {
          unitCode: item.unit_code,
          unitName: item.unit_name,
          baseCount: 0,
          targetCount: item.count
        });
      } else {
        unitMap.get(item.unit_id).targetCount = item.count;
      }
    });

    const unitRows = Array.from(unitMap.values()).map((item, idx) => ({
      'STT': idx + 1,
      'Mã Đơn vị': item.unitCode,
      'Tên Đơn vị': item.unitName,
      [`${baseColl.title} (Đợt 1)`]: item.baseCount,
      [`${targetColl.title} (Đợt 2)`]: item.targetCount,
      'Chênh lệch (+/-)': item.targetCount - item.baseCount,
      '% Biến động': item.baseCount > 0 ? (((item.targetCount - item.baseCount) / item.baseCount) * 100).toFixed(1) + '%' : '-'
    }));

    const wb = xlsx.utils.book_new();
    const wsTopics = xlsx.utils.json_to_sheet(topicRows);
    const wsUnits = xlsx.utils.json_to_sheet(unitRows);
    xlsx.utils.book_append_sheet(wb, wsTopics, 'So_Sanh_Chuyen_De');
    xlsx.utils.book_append_sheet(wb, wsUnits, 'So_Sanh_Don_Vi');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `So_sanh_nhu_cau_${baseColl.code}_vs_${targetColl.code}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });
  }

  // 7. BÁO CÁO ĐỀ XUẤT NHU CẦU ĐÀO TẠO NGOÀI KHUNG (MẪU 06 & CHUẨN HÓA CANONICAL)
  if (type === 'PROPOSALS') {
    const proposalsList = db.prepare(`
      SELECT p.*, ds.unit_id, u.unit_code, u.unit_name,
             c.name as canonical_name, c.description as canonical_description
      FROM training_demand_proposals p
      JOIN training_demand_submissions ds ON p.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      LEFT JOIN training_proposal_canonical c ON p.canonical_id = c.id
      WHERE ds.collection_id = ?
      ORDER BY p.id DESC
    `).all(collectionId) as any[];

    const totalParticipants = proposalsList.reduce((s, p) => s + (p.participant_count || 0), 0);
    const uniqueUnitsCount = new Set(proposalsList.map(p => p.unit_id)).size;

    // Gom nhóm theo Canonical (Mục chưa ánh xạ gom thành nhóm 'Chưa phân loại' kèm số lượng, không bị bỏ khỏi tổng)
    interface CanonicalGroupItem {
      canonicalId: number | null;
      canonicalName: string;
      description?: string;
      isMapped: boolean;
      totalParticipants: number;
      unitCount: number;
      units: Array<{ unitCode: string; unitName: string }>;
      proposalCount: number;
      variations: string[];
      proposals: any[];
    }

    const groupsMap = new Map<string, CanonicalGroupItem>();

    // Khởi tạo nhóm Chưa phân loại
    const unmappedKey = '__UNMAPPED__';

    for (const p of proposalsList) {
      const key = p.canonical_id ? `CANON_${p.canonical_id}` : unmappedKey;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          canonicalId: p.canonical_id || null,
          canonicalName: p.canonical_id ? p.canonical_name : 'Chưa phân loại',
          description: p.canonical_description || undefined,
          isMapped: Boolean(p.canonical_id),
          totalParticipants: 0,
          unitCount: 0,
          units: [],
          proposalCount: 0,
          variations: [],
          proposals: []
        });
      }

      const g = groupsMap.get(key)!;
      g.totalParticipants += (p.participant_count || 0);
      g.proposalCount++;
      g.proposals.push(p);

      if (!g.variations.includes(p.proposal_name)) {
        g.variations.push(p.proposal_name);
      }
      if (!g.units.some(u => u.unitCode === p.unit_code)) {
        g.units.push({ unitCode: p.unit_code, unitName: p.unit_name });
      }
      g.unitCount = g.units.length;
    }

    // Sắp xếp các nhóm: Các nhóm đã chuẩn hóa có nhiều học viên lên đầu, nhóm 'Chưa phân loại' ở cuối
    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.isMapped && !b.isMapped) return -1;
      if (!a.isMapped && b.isMapped) return 1;
      return b.totalParticipants - a.totalParticipants;
    });

    const mappedParticipants = sortedGroups.filter(g => g.isMapped).reduce((s, g) => s + g.totalParticipants, 0);
    const unmappedParticipants = sortedGroups.filter(g => !g.isMapped).reduce((s, g) => s + g.totalParticipants, 0);

    return NextResponse.json({
      collectionId,
      totalProposals: proposalsList.length,
      totalParticipants,
      uniqueUnitsCount,
      mappedParticipants,
      unmappedParticipants,
      canonicalGroups: sortedGroups,
      proposals: proposalsList
    });
  }

  // 8. XUẤT EXCEL ĐỀ XUẤT NHU CẦU ĐÀO TẠO NGOÀI KHUNG (GỒM CỘT CANONICAL VÀ TÊN GỐC)
  if (type === 'EXPORT_PROPOSALS') {
    const proposalsList = db.prepare(`
      SELECT p.*, ds.unit_id, u.unit_code, u.unit_name,
             c.name as canonical_name
      FROM training_demand_proposals p
      JOIN training_demand_submissions ds ON p.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      LEFT JOIN training_proposal_canonical c ON p.canonical_id = c.id
      WHERE ds.collection_id = ?
      ORDER BY COALESCE(c.name, 'zzz'), p.id DESC
    `).all(collectionId) as any[];

    const exportRows = proposalsList.map((p, idx) => ({
      'STT': idx + 1,
      'Chuyên đề chuẩn hóa (Canonical)': p.canonical_name || 'Chưa phân loại',
      'Mã Đơn vị': p.unit_code,
      'Tên Đơn vị': p.unit_name,
      'Tên đề xuất gốc của đơn vị': p.proposal_name,
      'Đối tượng tham gia': p.target_audience || '',
      'Số lượng người có nhu cầu': p.participant_count || 1,
      'Thời lượng dự kiến': p.expected_duration || '',
      'Hình thức đào tạo': p.delivery_method || '',
      'Nguồn giảng viên / câu hỏi': p.faculty_source || '',
      'Ghi chú / Kiến nghị': p.notes || '',
      'Thời gian đề xuất': p.created_at ? new Date(p.created_at).toLocaleString('vi-VN') : ''
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 35 },
      { wch: 12 },
      { wch: 32 },
      { wch: 40 },
      { wch: 30 },
      { wch: 14 },
      { wch: 16 },
      { wch: 20 },
      { wch: 28 },
      { wch: 35 },
      { wch: 20 }
    ];
    xlsx.utils.book_append_sheet(wb, ws, 'De_Xuat_Ngoai_Khung');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Tong_hop_de_xuat_ngoai_khung_M06.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });
  }

  return NextResponse.json({ error: 'Loại báo cáo không hợp lệ.' }, { status: 400 });
}
