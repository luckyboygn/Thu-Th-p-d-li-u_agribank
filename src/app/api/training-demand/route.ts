import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { isWindowOpen } from '@/lib/deadline';
import { triggerCloudSync } from '@/lib/cloud-sync';

// 1. GET: Lấy thông tin hồ sơ khảo sát của đơn vị (bao gồm cả Programs và Positions nếu có)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  const { searchParams } = new URL(req.url);
  const collectionIdStr = searchParams.get('collectionId');
  
  let unitId = session.unitId;
  // Admin có thể xem đơn vị cụ thể nếu truyền unitId
  if (session.role === 'SUPER_ADMIN' && searchParams.get('unitId')) {
    unitId = parseInt(searchParams.get('unitId')!);
  }

  if (!unitId) {
    return NextResponse.json({ error: 'Không xác định được đơn vị.' }, { status: 400 });
  }

  const db = getDatabase();

  // Tìm collectionId (nếu không truyền thì lấy đợt OPEN mới nhất)
  let collectionId = collectionIdStr ? parseInt(collectionIdStr) : null;
  if (!collectionId) {
    const activeColl = db.prepare("SELECT id FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any;
    collectionId = activeColl?.id || null;
  }

  // Lấy đơn vị
  const unit = db.prepare('SELECT id, unit_code, unit_name FROM units WHERE id = ?').get(unitId) as any;

  if (!collectionId) {
    return NextResponse.json({
      unit,
      collection: null,
      submission: null,
      declaredPrograms: [],
      declaredPositions: [],
      message: 'Hiện tại chưa có đợt khảo sát nào đang mở.'
    });
  }

  // Lấy đợt
  const collection = db.prepare('SELECT id, code, title, status, start_at, end_at FROM collections WHERE id = ?').get(collectionId) as any;

  // Lấy gia hạn riêng của đơn vị trong đợt khảo sát này
  const deadlineExtension = db.prepare(`
    SELECT new_end_at, reason FROM deadline_extensions
    WHERE unit_id = ? AND target_type = 'COLLECTION' AND target_id = ?
  `).get(unitId, collectionId) || null;

  // Lấy danh sách tất cả các đợt để chọn lựa
  const allCollections = db.prepare('SELECT id, code, title, status, start_at, end_at FROM collections ORDER BY id DESC').all();

  // Lấy submission của đơn vị trong đợt này
  const submission = db.prepare(`
    SELECT * FROM training_demand_submissions
    WHERE collection_id = ? AND unit_id = ?
    ORDER BY version DESC LIMIT 1
  `).get(collectionId, unitId) as any;

  if (!submission) {
    return NextResponse.json({
      unit,
      collection,
      submission: null,
      declaredPrograms: [],
      declaredPositions: []
    });
  }

  // 1. Lấy danh sách Khung chương trình đã khai báo (NEW)
  const declaredPrograms = db.prepare(`
    SELECT dp.id as demand_program_id, dp.program_id, dp.notes, dp.created_at,
           p.code as program_code, p.name as program_name, p.group_name,
           (SELECT COUNT(*) FROM training_program_topics WHERE program_id = p.id) as total_available_topics,
           (SELECT COUNT(*) FROM training_demand_program_topics WHERE demand_program_id = dp.id AND participant_count > 0) as registered_topic_count,
           (SELECT COALESCE(SUM(participant_count), 0) FROM training_demand_program_topics WHERE demand_program_id = dp.id) as sum_participants
    FROM training_demand_programs dp
    JOIN training_programs p ON dp.program_id = p.id
    WHERE dp.submission_id = ?
    ORDER BY dp.id ASC
  `).all(submission.id) as any[];

  const getProgramTopicsStmt = db.prepare(`
    SELECT dt.id as demand_topic_id, dt.program_topic_id, dt.participant_count,
           t.topic_name, t.target_audience, t.delivery_method, t.duration, t.display_order
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
  `).all(submission.id);

  // 2. Lấy danh sách các vị trí cũ (backward compatibility)
  const declaredPositions = db.prepare(`
    SELECT dp.id as demand_position_id, dp.position_id, dp.target_headcount, dp.created_at,
           p.code as position_code, p.name as position_name, p.group_name,
           (SELECT COUNT(*) FROM training_position_topics WHERE position_id = p.id) as total_available_topics,
           (SELECT COUNT(*) FROM training_demand_topics WHERE demand_position_id = dp.id AND participant_count > 0) as registered_topic_count,
           (SELECT COALESCE(SUM(participant_count), 0) FROM training_demand_topics WHERE demand_position_id = dp.id) as sum_participants
    FROM training_demand_positions dp
    JOIN training_positions p ON dp.position_id = p.id
    WHERE dp.submission_id = ?
    ORDER BY dp.id ASC
  `).all(submission.id) as any[];

  const getPosTopicsStmt = db.prepare(`
    SELECT dt.id as demand_topic_id, dt.topic_id, dt.participant_count,
           t.code as topic_code, t.name as topic_name, t.delivery_method,
           t.duration, t.competency, pt.display_order
    FROM training_demand_topics dt
    JOIN training_topics t ON dt.topic_id = t.id
    LEFT JOIN training_position_topics pt ON (pt.position_id = ? AND pt.topic_id = t.id)
    WHERE dt.demand_position_id = ?
    ORDER BY pt.display_order ASC, t.id ASC
  `);

  const positionsWithDetails = declaredPositions.map(pos => {
    const topics = getPosTopicsStmt.all(pos.position_id, pos.demand_position_id);
    return {
      ...pos,
      topics
    };
  });

  let reopenInfo: any = null;
  if (submission && submission.status === 'REOPENED') {
    reopenInfo = db.prepare(`
      SELECT rl.reason, rl.reopened_at, u.full_name as reopened_by_name
      FROM submission_reopen_log rl
      LEFT JOIN users u ON rl.reopened_by = u.id
      WHERE rl.target_type = 'TRAINING_DEMAND' AND rl.target_id = ?
      ORDER BY rl.id DESC LIMIT 1
    `).get(submission.id) || null;
  }

  return NextResponse.json({
    unit,
    collection,
    allCollections,
    deadlineExtension,
    submission,
    declaredPrograms: programsWithDetails,
    declaredPositions: positionsWithDetails,
    proposals,
    reopenInfo
  });
}

// 2. POST: Khai báo hoặc cập nhật nhu cầu đào tạo (Lưu nháp hoặc Gửi chính thức)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  try {
    const body = await req.json();
    const { collectionId, action, programData, positionData } = body; 

    const db = getDatabase();

    let unitId = session.unitId;
    if (session.role === 'SUPER_ADMIN' && body.unitId) {
      unitId = body.unitId;
    }

    if (!unitId) {
      return NextResponse.json({ error: 'Không xác định được đơn vị.' }, { status: 400 });
    }

    // Kiểm tra xem Collection có tồn tại không
    const coll = db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as any;
    if (!coll) {
      return NextResponse.json({ error: 'Đợt khảo sát không tồn tại.' }, { status: 404 });
    }

    // Kiểm tra thời hạn của đợt khảo sát (trừ action REOPEN của Admin)
    if (action !== 'REOPEN') {
      const windowCheck = isWindowOpen('COLLECTION', collectionId, unitId);
      if (!windowCheck.isOpen) {
        return NextResponse.json({
          error: windowCheck.reason || 'Đợt khảo sát đã đóng hoặc quá hạn chót tiếp nhận dữ liệu.'
        }, { status: 403 });
      }
    }

    // Lấy hoặc tạo mới submission
    let submission = db.prepare(`
      SELECT * FROM training_demand_submissions
      WHERE collection_id = ? AND unit_id = ?
      ORDER BY version DESC LIMIT 1
    `).get(collectionId, unitId) as any;

    // Không cho sửa nếu đã gửi chính thức (trừ khi Admin Reopen)
    if (submission && submission.status === 'SUBMITTED' && action !== 'REOPEN') {
      return NextResponse.json({
        error: 'Hồ sơ đã được gửi chính thức. Vui lòng liên hệ Admin nếu cần chỉnh sửa.'
      }, { status: 403 });
    }

    // REOPEN (Chỉ Admin)
    if (action === 'REOPEN') {
      if (session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Chỉ Admin mới có quyền mở lại hồ sơ.' }, { status: 403 });
      }
      if (submission) {
        db.prepare("UPDATE training_demand_submissions SET status = 'REOPENED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(submission.id);
        logAudit({
          userId: session.id,
          username: session.username,
          unitId,
          action: 'REOPEN_TRAINING_DEMAND',
          details: { submissionId: submission.id, collectionId }
        });
      }
      return NextResponse.json({ success: true, message: 'Đã mở lại hồ sơ cho đơn vị chỉnh sửa.' });
    }

    // SUBMIT_OFFICIAL (Gửi chính thức)
    if (action === 'SUBMIT_OFFICIAL') {
      const { canApproveSubmission } = await import('@/lib/maker-checker');
      if (!canApproveSubmission(session.role)) {
        return NextResponse.json({
          error: 'Tài khoản của bạn có vai trò Người lập (PREPARER). Chỉ Người duyệt (APPROVER) hoặc Lãnh đạo đơn vị mới có quyền Gửi chính thức.',
          code: 'APPROVER_REQUIRED'
        }, { status: 403 });
      }

      if (!submission) {
        return NextResponse.json({ error: 'Chưa có dữ liệu khai báo để gửi.' }, { status: 400 });
      }
      // Tính tổng số lượt người đăng ký
      const sumTopicsRow = db.prepare(`
        SELECT COALESCE(SUM(t.participant_count), 0) as total
        FROM training_demand_topics t
        JOIN training_demand_positions p ON t.demand_position_id = p.id
        WHERE p.submission_id = ?
      `).get(submission.id) as any;
      const totalParticipants = sumTopicsRow?.total || 0;

      // Sinh mã biên nhận điện tử duy nhất
      const { createSubmissionReceipt } = await import('@/lib/receipt');
      const collRow = db.prepare('SELECT title FROM collections WHERE id = ?').get(collectionId) as any;
      const receiptCode = createSubmissionReceipt(db, {
        targetType: 'TRAINING_DEMAND',
        targetId: submission.id,
        unitId,
        submittedBy: submission.prepared_by || session.id,
        approvedBy: session.id,
        totalRecords: totalParticipants,
        metadata: {
          title: collRow?.title || 'Khảo sát Nhu cầu Đào tạo',
          totalParticipants
        }
      });

      db.prepare(`
        UPDATE training_demand_submissions 
        SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, submitted_by = ?, approved_by = ?, receipt_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(session.id, session.id, receiptCode, submission.id);

      logAudit({
        userId: session.id,
        username: session.username,
        unitId,
        action: 'SUBMIT_OFFICIAL_TRAINING_DEMAND',
        details: { submissionId: submission.id, collectionId, receiptCode }
      });

      // Tự động đồng bộ bản ghi mới lên Cloud Storage
      triggerCloudSync().catch(() => {});

      return NextResponse.json({
        success: true,
        message: 'Đã gửi chính thức nhu cầu đào tạo thành công!',
        receiptCode
      });
    }

    // Tự động tạo submission DRAFT nếu chưa có
    if (!submission) {
      const res = db.prepare(`
        INSERT INTO training_demand_submissions (collection_id, unit_id, status, submitted_by, prepared_by)
        VALUES (?, ?, 'DRAFT', ?, ?)
      `).run(collectionId, unitId, session.id, session.id);
      submission = { id: Number(res.lastInsertRowid), status: 'DRAFT' };
    } else {
      // Cập nhật prepared_by khi có thao tác chỉnh sửa/soạn thảo
      db.prepare("UPDATE training_demand_submissions SET prepared_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(session.id, submission.id);
    }

    // ==========================================
    // CÁC HÀNH ĐỘNG THEO KHUNG CHƯƠNG TRÌNH (NEW)
    // ==========================================

    // DELETE_PROGRAM: Xóa chương trình khỏi hồ sơ khảo sát
    if (action === 'DELETE_PROGRAM') {
      const { programId } = body;
      if (!programId) return NextResponse.json({ error: 'Thiếu programId.' }, { status: 400 });

      db.prepare('DELETE FROM training_demand_programs WHERE submission_id = ? AND program_id = ?')
        .run(submission.id, programId);

      return NextResponse.json({ success: true, message: 'Đã xóa chương trình khỏi danh sách khảo sát.' });
    }

    // DRAFT: Tự động lưu nháp khảo sát đào tạo định kỳ
    if (action === 'DRAFT') {
      let demandProgId: number | null = null;
      if (programData && programData.programId) {
        const { programId, topicCounts } = programData;
        if (Array.isArray(topicCounts)) {
          for (const tc of topicCounts) {
            const cNum = Number(tc.count);
            if (isNaN(cNum) || !Number.isInteger(cNum) || cNum < 0) {
              return NextResponse.json({ 
                error: `Số lượng đăng ký của chuyên đề không hợp lệ (${tc.count}). Phải là số nguyên không âm (>= 0).` 
              }, { status: 400 });
            }
          }
        }

        db.exec('BEGIN TRANSACTION;');
        try {
          let demandProg = db.prepare('SELECT id FROM training_demand_programs WHERE submission_id = ? AND program_id = ?')
            .get(submission.id, programId) as any;

          if (demandProg) {
            demandProgId = demandProg.id;
          } else {
            const dpRes = db.prepare(`
              INSERT INTO training_demand_programs (submission_id, program_id)
              VALUES (?, ?)
            `).run(submission.id, programId);
            demandProgId = Number(dpRes.lastInsertRowid);
          }

          db.prepare('DELETE FROM training_demand_program_topics WHERE demand_program_id = ?').run(demandProgId);

          const insertTopicStmt = db.prepare(`
            INSERT INTO training_demand_program_topics (
              demand_program_id, program_topic_id, participant_count, topic_name_snapshot, delivery_method_snapshot, duration_snapshot
            ) VALUES (?, ?, ?, ?, ?, ?)
          `);

          if (Array.isArray(topicCounts)) {
            for (const tc of topicCounts) {
              const countNum = Math.max(0, parseInt(tc.count) || 0);
              const topicInfo = db.prepare('SELECT topic_name, delivery_method, duration FROM training_program_topics WHERE id = ?').get(tc.topicId) as any;
              insertTopicStmt.run(
                demandProgId,
                tc.topicId,
                countNum,
                topicInfo?.topic_name || '',
                topicInfo?.delivery_method || '',
                topicInfo?.duration || ''
              );
            }
          }

          db.prepare("UPDATE training_demand_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(submission.id);
          db.exec('COMMIT;');
        } catch (e: any) {
          db.exec('ROLLBACK;');
          throw e;
        }
      } else {
        db.prepare("UPDATE training_demand_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(submission.id);
      }

      return NextResponse.json({
        success: true,
        message: 'Đã tự động lưu nháp thành công.',
        submissionId: submission.id,
        demandProgramId: demandProgId,
        savedAt: new Date().toISOString()
      });
    }

    // SAVE_PROGRAM: Lưu/Cập nhật số lượng người đăng ký các chuyên đề trong chương trình
    if (action === 'SAVE_PROGRAM') {
      const { programId, topicCounts } = programData;
      // topicCounts: Array<{ topicId: number, count: number }>

      if (!programId) {
        return NextResponse.json({ error: 'Chưa chọn khung chương trình đào tạo.' }, { status: 400 });
      }

      // Validation từng topic count: phải là số nguyên >= 0
      if (Array.isArray(topicCounts)) {
        for (const tc of topicCounts) {
          const cNum = Number(tc.count);
          if (isNaN(cNum) || !Number.isInteger(cNum) || cNum < 0) {
            return NextResponse.json({ 
              error: `Số lượng đăng ký của chuyên đề không hợp lệ (${tc.count}). Phải là số nguyên không âm (>= 0).` 
            }, { status: 400 });
          }
        }
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        let demandProg = db.prepare('SELECT id FROM training_demand_programs WHERE submission_id = ? AND program_id = ?')
          .get(submission.id, programId) as any;
        let demandProgId: number;

        if (programData.isNew && demandProg) {
          db.exec('ROLLBACK;');
          return NextResponse.json({
            error: 'Chương trình này đã có trong danh sách khảo sát của đơn vị.'
          }, { status: 400 });
        }

        if (demandProg) {
          demandProgId = demandProg.id;
          if (programData.notes !== undefined) {
            db.prepare('UPDATE training_demand_programs SET notes = ? WHERE id = ?').run(programData.notes, demandProgId);
          }
        } else {
          const dpRes = db.prepare(`
            INSERT INTO training_demand_programs (submission_id, program_id, notes)
            VALUES (?, ?, ?)
          `).run(submission.id, programId, programData.notes || null);
          demandProgId = Number(dpRes.lastInsertRowid);
        }

        // Xóa các topic đăng ký cũ của chương trình này và ghi lại mới
        db.prepare('DELETE FROM training_demand_program_topics WHERE demand_program_id = ?').run(demandProgId);

        const insertTopicStmt = db.prepare(`
          INSERT INTO training_demand_program_topics (
            demand_program_id, program_topic_id, participant_count, topic_name_snapshot, delivery_method_snapshot, duration_snapshot
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        if (Array.isArray(topicCounts)) {
          for (const tc of topicCounts) {
            const countNum = Math.max(0, parseInt(tc.count) || 0);
            const topicInfo = db.prepare('SELECT topic_name, delivery_method, duration FROM training_program_topics WHERE id = ?').get(tc.topicId) as any;
            insertTopicStmt.run(
              demandProgId,
              tc.topicId,
              countNum,
              topicInfo?.topic_name || '',
              topicInfo?.delivery_method || '',
              topicInfo?.duration || ''
            );
          }
        }

        db.exec('COMMIT;');

        logAudit({
          userId: session.id,
          username: session.username,
          unitId,
          action: 'SAVE_TRAINING_PROGRAM_DEMAND',
          details: { submissionId: submission.id, programId, topicCount: topicCounts?.length || 0 }
        });

        return NextResponse.json({
          success: true,
          message: 'Đã lưu nhu cầu đào tạo cho chương trình thành công!',
          demandProgramId: demandProgId
        });
      } catch (e: any) {
        db.exec('ROLLBACK;');
        throw e;
      }
    }

    // SAVE_PROPOSALS: Lưu danh sách đề xuất ngoài khung của đơn vị (Mục 2.8)
    if (action === 'SAVE_PROPOSALS') {
      const { proposals } = body;
      if (!Array.isArray(proposals)) {
        return NextResponse.json({ error: 'Dữ liệu đề xuất phải là mảng.' }, { status: 400 });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare('DELETE FROM training_demand_proposals WHERE submission_id = ?').run(submission.id);

        const insertStmt = db.prepare(`
          INSERT INTO training_demand_proposals (
            submission_id, proposal_name, target_audience, participant_count, expected_duration, notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const p of proposals) {
          if (p.proposal_name && p.proposal_name.trim()) {
            insertStmt.run(
              submission.id,
              p.proposal_name.trim(),
              p.target_audience ? p.target_audience.trim() : null,
              Math.max(1, parseInt(p.participant_count) || 1),
              p.expected_duration ? p.expected_duration.trim() : null,
              p.notes ? p.notes.trim() : null
            );
          }
        }

        db.prepare("UPDATE training_demand_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(submission.id);
        db.exec('COMMIT;');

        const savedProposals = db.prepare('SELECT * FROM training_demand_proposals WHERE submission_id = ? ORDER BY id ASC').all(submission.id);

        return NextResponse.json({
          success: true,
          message: 'Đã lưu danh sách đề xuất ngoài khung thành công!',
          proposals: savedProposals
        });
      } catch (err: any) {
        db.exec('ROLLBACK;');
        return NextResponse.json({ error: 'Lỗi lưu đề xuất: ' + err.message }, { status: 500 });
      }
    }

    // ==========================================
    // BACKWARD COMPATIBILITY CHO VỊ TRÍ (NẾU CÓ)
    // ==========================================
    if (action === 'DELETE_POSITION') {
      const { positionId } = body;
      if (!positionId) return NextResponse.json({ error: 'Thiếu positionId.' }, { status: 400 });

      db.prepare('DELETE FROM training_demand_positions WHERE submission_id = ? AND position_id = ?')
        .run(submission.id, positionId);

      return NextResponse.json({ success: true, message: 'Đã xóa vị trí khỏi danh sách khai báo.' });
    }

    if (action === 'SAVE_POSITION') {
      const { positionId, targetHeadcount, topicCounts } = positionData;

      if (!positionId) {
        return NextResponse.json({ error: 'Chưa chọn vị trí chức danh.' }, { status: 400 });
      }

      const headCountNum = Number(targetHeadcount);
      if (isNaN(headCountNum) || !Number.isInteger(headCountNum) || headCountNum < 0) {
        return NextResponse.json({ error: 'Số lượng nhân sự của nhóm phải là số nguyên không âm (>= 0).' }, { status: 400 });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        let demandPos = db.prepare('SELECT id FROM training_demand_positions WHERE submission_id = ? AND position_id = ?').get(submission.id, positionId) as any;
        let demandPosId: number;

        if (positionData.isNew && demandPos) {
          db.exec('ROLLBACK;');
          return NextResponse.json({
            error: 'Vị trí này đã tồn tại trong danh sách khai báo.'
          }, { status: 400 });
        }

        if (demandPos) {
          db.prepare('UPDATE training_demand_positions SET target_headcount = ? WHERE id = ?').run(headCountNum, demandPos.id);
          demandPosId = demandPos.id;
        } else {
          const dpRes = db.prepare(`
            INSERT INTO training_demand_positions (submission_id, position_id, target_headcount)
            VALUES (?, ?, ?)
          `).run(submission.id, positionId, headCountNum);
          demandPosId = Number(dpRes.lastInsertRowid);
        }

        db.prepare('DELETE FROM training_demand_topics WHERE demand_position_id = ?').run(demandPosId);

        const insertTopicStmt = db.prepare(`
          INSERT INTO training_demand_topics (
            demand_position_id, topic_id, participant_count, topic_name_snapshot, duration_snapshot, delivery_method_snapshot
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        if (Array.isArray(topicCounts)) {
          for (const tc of topicCounts) {
            const topicInfo = db.prepare('SELECT name, duration, delivery_method FROM training_topics WHERE id = ?').get(tc.topicId) as any;
            insertTopicStmt.run(
              demandPosId,
              tc.topicId,
              Number(tc.count) || 0,
              topicInfo?.name || '',
              topicInfo?.duration || '',
              topicInfo?.delivery_method || ''
            );
          }
        }

        db.exec('COMMIT;');
        return NextResponse.json({
          success: true,
          message: 'Đã lưu nhu cầu vị trí thành công!',
          demandPositionId: demandPosId
        });
      } catch (e: any) {
        db.exec('ROLLBACK;');
        throw e;
      }
    }

    return NextResponse.json({ error: 'Action không hợp lệ.' }, { status: 400 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Lỗi xử lý nhu cầu đào tạo: ' + error.message }, { status: 500 });
  }
}
