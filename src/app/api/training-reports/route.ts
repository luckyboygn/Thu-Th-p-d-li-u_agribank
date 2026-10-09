import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import * as xlsx from 'xlsx';

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
  const unitIdStr = searchParams.get('unitId');

  const db = getDatabase();

  let collectionId = collectionIdStr ? parseInt(collectionIdStr) : null;
  if (!collectionId) {
    const activeColl = db.prepare("SELECT id FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any;
    collectionId = activeColl?.id || 1;
  }

  // 1. BÁO CÁO TỔNG HỢP TOÀN HỆ THỐNG (SUMMARY METRICS)
  if (type === 'SUMMARY') {
    const totalUnitsCount = (db.prepare('SELECT COUNT(*) as c FROM units').get() as any).c;

    const submittedCount = (db.prepare(`
      SELECT COUNT(DISTINCT unit_id) as c 
      FROM training_demand_submissions 
      WHERE collection_id = ? AND status = 'SUBMITTED'
    `).get(collectionId) as any).c;

    const draftCount = (db.prepare(`
      SELECT COUNT(DISTINCT unit_id) as c 
      FROM training_demand_submissions 
      WHERE collection_id = ? AND status = 'DRAFT'
    `).get(collectionId) as any).c;

    // Tổng số lượt đăng ký người học từ cả Programs và Positions
    const progSum = (db.prepare(`
      SELECT COALESCE(SUM(dt.participant_count), 0) as s
      FROM training_demand_program_topics dt
      JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
    `).get(collectionId) as any).s;

    const posSum = (db.prepare(`
      SELECT COALESCE(SUM(dt.participant_count), 0) as s
      FROM training_demand_topics dt
      JOIN training_demand_positions dp ON dt.demand_position_id = dp.id
      JOIN training_demand_submissions ds ON dp.submission_id = ds.id
      WHERE ds.collection_id = ?
    `).get(collectionId) as any).s;

    const totalParticipants = progSum + posSum;

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

  // 4. BÁO CÁO THEO TỪNG ĐƠN VỊ
  if (type === 'BY_UNIT') {
    if (!unitIdStr) return NextResponse.json({ error: 'Thiếu unitId.' }, { status: 400 });
    const targetUnitId = parseInt(unitIdStr);

    const unit = db.prepare('SELECT id, unit_code, unit_name FROM units WHERE id = ?').get(targetUnitId) as any;
    const submission = db.prepare(`
      SELECT * FROM training_demand_submissions WHERE collection_id = ? AND unit_id = ? ORDER BY version DESC LIMIT 1
    `).get(collectionId, targetUnitId) as any;

    if (!submission) {
      return NextResponse.json({ unit, submission: null, programRecords: [], positionRecords: [] });
    }

    const programRecords = db.prepare(`
      SELECT p.id as program_id, p.code as program_code, p.name as program_name, p.group_name,
             t.id as topic_id, t.topic_name, t.delivery_method, t.duration,
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

    return NextResponse.json({ unit, submission, programRecords, positionRecords });
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

    // FORMAT C: THEO ĐƠN VỊ
    if (exportFormat === 'BY_UNIT' && unitIdStr) {
      const uId = parseInt(unitIdStr);
      const unit = db.prepare('SELECT unit_code, unit_name FROM units WHERE id = ?').get(uId) as any;

      const unitRows = db.prepare(`
        SELECT p.name as 'Khung Chương trình đào tạo',
               t.topic_name as 'Tên chuyên đề',
               t.delivery_method as 'Hình thức đào tạo',
               t.duration as 'Thời lượng đào tạo',
               dt.participant_count as 'Số lượng người đăng ký'
        FROM training_demand_program_topics dt
        JOIN training_program_topics t ON dt.program_topic_id = t.id
        JOIN training_programs p ON t.program_id = p.id
        JOIN training_demand_programs dp ON dt.demand_program_id = dp.id
        JOIN training_demand_submissions ds ON dp.submission_id = ds.id
        WHERE ds.collection_id = ? AND ds.unit_id = ? AND dt.participant_count > 0
        ORDER BY p.display_order ASC, t.display_order ASC
      `).all(collectionId, uId);

      const ws = xlsx.utils.json_to_sheet(unitRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Nhu_Cau_Don_Vi');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="Nhu_Cau_Dao_Tao_${unit?.unit_code || uId}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
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

  // 7. BÁO CÁO ĐỀ XUẤT NHU CẦU ĐÀO TẠO NGOÀI KHUNG (MỤC 2.8)
  if (type === 'PROPOSALS') {
    const proposalsList = db.prepare(`
      SELECT p.*, ds.unit_id, u.unit_code, u.unit_name
      FROM training_demand_proposals p
      JOIN training_demand_submissions ds ON p.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ?
      ORDER BY p.id DESC
    `).all(collectionId) as any[];

    const totalParticipants = proposalsList.reduce((s, p) => s + (p.participant_count || 0), 0);
    const uniqueUnitsCount = new Set(proposalsList.map(p => p.unit_id)).size;

    return NextResponse.json({
      collectionId,
      totalProposals: proposalsList.length,
      totalParticipants,
      uniqueUnitsCount,
      proposals: proposalsList
    });
  }

  // 8. XUẤT EXCEL ĐỀ XUẤT NHU CẦU ĐÀO TẠO NGOÀI KHUNG (MỤC 2.8)
  if (type === 'EXPORT_PROPOSALS') {
    const proposalsList = db.prepare(`
      SELECT p.*, ds.unit_id, u.unit_code, u.unit_name
      FROM training_demand_proposals p
      JOIN training_demand_submissions ds ON p.submission_id = ds.id
      JOIN units u ON ds.unit_id = u.id
      WHERE ds.collection_id = ?
      ORDER BY p.id DESC
    `).all(collectionId) as any[];

    const exportRows = proposalsList.map((p, idx) => ({
      'STT': idx + 1,
      'Mã Đơn vị': p.unit_code,
      'Tên Đơn vị': p.unit_name,
      'Tên Chương trình / Chuyên đề đề xuất': p.proposal_name,
      'Đối tượng tham gia': p.target_audience || '',
      'Số lượng người có nhu cầu': p.participant_count || 1,
      'Thời lượng dự kiến': p.expected_duration || '',
      'Ghi chú / Mục tiêu đào tạo': p.notes || '',
      'Thời gian đề xuất': p.created_at ? new Date(p.created_at).toLocaleString('vi-VN') : ''
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportRows);
    xlsx.utils.book_append_sheet(wb, ws, 'De_Xuat_Ngoai_Khung');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `De_xuat_ngoai_khung_toan_he_thong.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    });
  }

  return NextResponse.json({ error: 'Loại báo cáo không hợp lệ.' }, { status: 400 });
}
