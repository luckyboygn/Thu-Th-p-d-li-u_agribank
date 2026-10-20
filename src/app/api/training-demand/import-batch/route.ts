import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, enforcePasswordPolicy, isCentralAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createSubmissionReceipt, calculateTrainingDemandParticipants, getTrainingDemandProgramsSummary } from '@/lib/receipt';
import { matchUnitFromFilename } from '@/lib/unit-matcher';
import { parseTrainingDemandExcel } from '@/lib/training-excel-parser';
import { triggerCloudSync } from '@/lib/cloud-sync';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 1. GET: Lấy danh sách các đơn vị và đợt khảo sát để phục vụ giao diện gán thủ công nếu cần
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const db = getDatabase();
  const units = db.prepare('SELECT id, unit_code, unit_name, region, unit_type FROM units ORDER BY CAST(unit_code AS INTEGER) ASC, unit_code ASC').all();
  const collections = db.prepare('SELECT id, code, title, status FROM collections ORDER BY id DESC').all();

  return NextResponse.json({ units, collections });
}

// 2. POST: Xử lý Phân tích hàng loạt (analyze) hoặc Thực thi nộp hàng loạt (execute)
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  if (!isCentralAdmin(session)) {
    return NextResponse.json({
      error: 'Chức năng nộp hộ file Excel hàng loạt chỉ dành riêng cho Quản trị viên Trung tâm (Admin).'
    }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const mode = (formData.get('mode') as string) || 'analyze'; // 'analyze' | 'execute'
    const collectionIdStr = formData.get('collectionId') as string | null;
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn ít nhất một file Excel để tải lên.' }, { status: 400 });
    }

    const db = getDatabase();

    // 1. Xác định đợt khảo sát
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

    // 2. Lấy danh mục Đơn vị và Khung chương trình chuẩn
    const allUnits = db.prepare('SELECT id, unit_code, unit_name FROM units ORDER BY CAST(unit_code AS INTEGER) ASC').all() as any[];
    const allOfficialPrograms = db.prepare('SELECT id, code, name, group_name FROM training_programs').all() as any[];
    const allOfficialTopics = db.prepare(`
      SELECT t.id, t.program_id, t.topic_name, t.position_code, t.delivery_method, t.duration,
             p.code as program_code, p.name as program_name
      FROM training_program_topics t
      JOIN training_programs p ON t.program_id = p.id
    `).all() as any[];

    // ==========================================
    // CHẾ ĐỘ 1: ANALYZE (PHÂN TÍCH & ĐỐI CHIẾU TRƯỚC KHI NỘP)
    // ==========================================
    if (mode === 'analyze') {
      const fileAnalysisResults = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const matchRes = matchUnitFromFilename(file.name, allUnits);

        let parseRes = null;
        let readError = null;

        try {
          let wb: xlsx.WorkBook;
          if (file.name.toLowerCase().endsWith('.csv')) {
            const text = await file.text();
            wb = xlsx.read(text, { type: 'string' });
          } else {
            const ab = await file.arrayBuffer();
            const buf = Buffer.from(ab);
            wb = xlsx.read(buf, { type: 'buffer' });
          }
          parseRes = parseTrainingDemandExcel(wb, allOfficialPrograms, allOfficialTopics);
        } catch (err: any) {
          readError = err.message || 'Lỗi định dạng file Excel không đọc được.';
        }

        const grandTotal = parseRes?.grandTotalParticipants || 0;
        const totalCompleted = parseRes?.totalCompletedParticipants || 0;
        let warning = matchRes.warning || null;

        if (!warning && grandTotal === 0 && totalCompleted === 0) {
          warning = 'File không có số lượng học viên đăng ký hoặc đã học nào (> 0 học viên).';
        }

        // Điều kiện để được nộp tự động: Nhận diện đơn vị tin cậy 100% VÀ có dữ liệu > 0
        const canImport = !readError && matchRes.status === 'MATCHED' && (grandTotal > 0 || totalCompleted > 0);

        fileAnalysisResults.push({
          fileIndex: i,
          fileName: file.name,
          fileSize: file.size,
          matchedUnit: matchRes.unit,
          unit: matchRes.unit ? {
            id: matchRes.unit.id,
            code: matchRes.unit.unitCode,
            name: matchRes.unit.unitName,
            shortName: matchRes.unit.unitName
          } : null,
          matchStatus: matchRes.status,
          matchMethod: matchRes.matchedBy,
          confidence: matchRes.confidence,
          warning,
          reasons: warning ? [warning] : (matchRes.matchedBy ? [`Khớp đơn vị theo ${matchRes.matchedBy}`] : []),
          readError,
          parseError: readError,
          summary: parseRes ? {
            programCount: parseRes.programsSummary.length,
            topicCount: parseRes.totalInFrameworkTopics,
            inFrameworkParticipants: parseRes.totalInFrameworkParticipants,
            proposalCount: parseRes.proposalsList.length,
            proposalParticipants: parseRes.totalProposalParticipants,
            totalParticipants: grandTotal
          } : null,
          parsedSummary: parseRes ? {
            programsCount: parseRes.programsSummary.length,
            participantsCount: grandTotal,
            positionsCount: parseRes.totalInFrameworkTopics,
            notesCount: parseRes.proposalsList.length
          } : null,
          programsPreview: parseRes ? parseRes.programsSummary.slice(0, 3) : [],
          canImport
        });
      }

      const validCount = fileAnalysisResults.filter(r => r.canImport).length;
      const warningCount = fileAnalysisResults.filter(r => !r.canImport).length;

      return NextResponse.json({
        mode: 'analyze',
        collection: { id: collection.id, code: collection.code, title: collection.title },
        totalFiles: files.length,
        validCount,
        warningCount,
        results: fileAnalysisResults,
        analyzed: fileAnalysisResults
      });
    }

    // ==========================================
    // CHẾ ĐỘ 2: EXECUTE (TIẾN HÀNH LƯU VÀ CẤP BIÊN NHẬN HÀNG LOẠT)
    // ==========================================
    if (mode === 'execute') {
      const assignmentsStr = formData.get('assignments') as string | null;
      let assignmentsMap = new Map<string, { unitId: number; status: 'SUBMITTED' | 'DRAFT'; selected: boolean }>();

      if (assignmentsStr) {
        try {
          const parsedArr = JSON.parse(assignmentsStr);
          if (Array.isArray(parsedArr)) {
            parsedArr.forEach((item: any) => {
              if (item.fileName) {
                assignmentsMap.set(item.fileName, {
                  unitId: Number(item.unitId),
                  status: item.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED',
                  selected: Boolean(item.selected)
                });
              }
            });
          }
        } catch (e) {
          console.error('Failed to parse assignments JSON:', e);
        }
      }

      const executionResults: any[] = [];
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const assigned = assignmentsMap.get(file.name);

        // Nếu admin chủ động bỏ chọn file này
        if (assigned && assigned.selected === false) {
          skippedCount++;
          executionResults.push({
            fileName: file.name,
            status: 'SKIPPED',
            message: 'Đã bỏ qua theo lựa chọn của Admin'
          });
          continue;
        }

        // Xác định unitId: Ưu tiên unitId từ assignment của Admin, nếu không thì lấy từ auto match
        let targetUnitId = assigned?.unitId;
        if (!targetUnitId) {
          const autoMatch = matchUnitFromFilename(file.name, allUnits);
          if (autoMatch.status === 'MATCHED' && autoMatch.unit) {
            targetUnitId = autoMatch.unit.id;
          }
        }

        if (!targetUnitId) {
          skippedCount++;
          executionResults.push({
            fileName: file.name,
            status: 'SKIPPED',
            message: 'Không có đơn vị hợp lệ để gán dữ liệu. Giữ lại để kiểm tra thủ công.'
          });
          continue;
        }

        const unit = allUnits.find(u => u.id === targetUnitId);
        if (!unit) {
          failedCount++;
          executionResults.push({
            fileName: file.name,
            status: 'FAILED',
            message: `Đơn vị id ${targetUnitId} không tồn tại trên hệ thống.`
          });
          continue;
        }

        // Bóc tách nội dung Excel
        let parseRes = null;
        try {
          let wb: xlsx.WorkBook;
          if (file.name.toLowerCase().endsWith('.csv')) {
            const text = await file.text();
            wb = xlsx.read(text, { type: 'string' });
          } else {
            const ab = await file.arrayBuffer();
            const buf = Buffer.from(ab);
            wb = xlsx.read(buf, { type: 'buffer' });
          }
          parseRes = parseTrainingDemandExcel(wb, allOfficialPrograms, allOfficialTopics);
        } catch (err: any) {
          failedCount++;
          executionResults.push({
            fileName: file.name,
            unitCode: unit.unit_code,
            unitName: unit.unit_name,
            status: 'FAILED',
            message: `Lỗi đọc file Excel: ${err.message}`
          });
          continue;
        }

        if (parseRes.grandTotalParticipants <= 0 && (parseRes.totalCompletedParticipants || 0) <= 0) {
          skippedCount++;
          executionResults.push({
            fileName: file.name,
            unitCode: unit.unit_code,
            unitName: unit.unit_name,
            status: 'SKIPPED',
            message: 'File không có số lượng học viên đăng ký hoặc đã học nào (> 0 học viên).'
          });
          continue;
        }

        // Thực hiện lưu vào CSDL
        const submissionStatus = assigned?.status || 'SUBMITTED';
        const sourceNote = `Admin nộp hộ hàng loạt từ file: ${file.name}`;

        try {
          db.exec('BEGIN TRANSACTION;');

          let submission = db.prepare(`
            SELECT * FROM training_demand_submissions
            WHERE collection_id = ? AND unit_id = ?
            ORDER BY version DESC LIMIT 1
          `).get(collectionId, targetUnitId) as any;

          if (!submission) {
            const insSub = db.prepare(`
              INSERT INTO training_demand_submissions (
                collection_id, unit_id, status, prepared_by, submitted_by, note
              ) VALUES (?, ?, 'DRAFT', ?, ?, ?)
            `).run(collectionId, targetUnitId, session.id, session.id, sourceNote);
            submission = { id: Number(insSub.lastInsertRowid), status: 'DRAFT' };
          }

          // Xóa dữ liệu cũ của đơn vị trong đợt này
          db.prepare(`
            DELETE FROM training_demand_program_topics
            WHERE demand_program_id IN (
              SELECT id FROM training_demand_programs WHERE submission_id = ?
            )
          `).run(submission.id);

          db.prepare('DELETE FROM training_demand_programs WHERE submission_id = ?').run(submission.id);
          db.prepare('DELETE FROM training_demand_proposals WHERE submission_id = ?').run(submission.id);

          // Thêm các khung chương trình và chuyên đề
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

          // Cập nhật trạng thái bài nộp & cấp biên nhận
          let receiptCode: string | null = null;
          if (submissionStatus === 'SUBMITTED') {
            const totalCalc = calculateTrainingDemandParticipants(db, submission.id);
            const progSummary = getTrainingDemandProgramsSummary(db, submission.id);

            receiptCode = createSubmissionReceipt(db, {
              targetType: 'TRAINING_DEMAND',
              targetId: submission.id,
              unitId: targetUnitId,
              submittedBy: session.id,
              approvedBy: session.id,
              totalRecords: totalCalc,
              metadata: {
                title: collection.title,
                totalParticipants: totalCalc,
                programsSummary: progSummary,
                adminBatchUpload: true,
                batchUploadedBy: session.username,
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

          logAudit({
            userId: session.id,
            username: session.username,
            unitId: unit.id,
            action: 'ADMIN_BATCH_PROXY_UPLOAD',
            entityType: 'TRAINING_DEMAND',
            entityId: submission.id,
            details: `Admin nộp hộ hàng loạt file Excel [${file.name}] cho đơn vị [${unit.unit_code}] ${unit.unit_name} - ${parseRes.grandTotalParticipants} lượt học viên`
          });

          successCount++;
          executionResults.push({
            fileName: file.name,
            unitId: unit.id,
            unitCode: unit.unit_code,
            unitName: unit.unit_name,
            status: 'SUCCESS',
            receiptCode,
            summary: {
              programCount: parseRes.programsSummary.length,
              topicCount: parseRes.totalInFrameworkTopics,
              proposalCount: parseRes.proposalsList.length,
              totalParticipants: parseRes.grandTotalParticipants
            }
          });
        } catch (subErr: any) {
          db.exec('ROLLBACK;');
          failedCount++;
          executionResults.push({
            fileName: file.name,
            unitCode: unit.unit_code,
            unitName: unit.unit_name,
            status: 'FAILED',
            message: `Lỗi ghi cơ sở dữ liệu: ${subErr.message}`
          });
        }
      }

      if (successCount > 0) {
        triggerCloudSync().catch(() => {});
      }

      return NextResponse.json({
        mode: 'execute',
        totalProcessed: files.length,
        successCount,
        failedCount,
        skippedCount,
        results: executionResults
      });
    }

    return NextResponse.json({ error: 'Chế độ (mode) không hợp lệ.' }, { status: 400 });
  } catch (err: any) {
    console.error('Batch upload error:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý file Excel hàng loạt.' }, { status: 500 });
  }
}
