import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest, isCentralAdmin, enforcePasswordPolicy } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { normalizeText } from '@/lib/unit-matcher';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 1. GET: Lấy danh mục đề xuất chuẩn hóa (Canonical) và các đề xuất chưa phân loại
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const collectionIdStr = searchParams.get('collectionId');

  const db = getDatabase();

  // Xác định collectionId
  let collectionId = collectionIdStr ? parseInt(collectionIdStr) : null;
  if (!collectionId) {
    const activeColl = db.prepare("SELECT id FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any;
    collectionId = activeColl ? activeColl.id : 1;
  }

  // 1. Danh sách Canonical topics kèm thống kê
  const canonicalRows = db.prepare(`
    SELECT c.id, c.name, c.description, c.created_at, c.updated_at,
           COUNT(p.id) as proposal_count,
           COUNT(DISTINCT s.unit_id) as unit_count,
           COALESCE(SUM(p.participant_count), 0) as total_participants
    FROM training_proposal_canonical c
    LEFT JOIN training_demand_proposals p ON p.canonical_id = c.id
    LEFT JOIN training_demand_submissions s ON p.submission_id = s.id AND (s.collection_id = ? OR ? IS NULL)
    GROUP BY c.id
    ORDER BY total_participants DESC, c.name ASC
  `).all(collectionId, collectionId) as any[];

  // Lấy các biến thể tên gốc đã gom vào từng Canonical
  const mappedVariationsStmt = db.prepare(`
    SELECT DISTINCT p.proposal_name
    FROM training_demand_proposals p
    JOIN training_demand_submissions s ON p.submission_id = s.id
    WHERE p.canonical_id = ? AND (s.collection_id = ? OR ? IS NULL)
  `);

  const canonicals = canonicalRows.map(c => {
    const variations = mappedVariationsStmt.all(c.id, collectionId, collectionId).map((v: any) => v.proposal_name);
    return {
      ...c,
      mappedVariations: variations
    };
  });

  // 2. Danh sách các đề xuất CHƯA PHÂN LOẠI (canonical_id IS NULL)
  // Nhóm theo tên đề xuất gốc
  const unmappedRows = db.prepare(`
    SELECT p.proposal_name,
           COUNT(p.id) as record_count,
           COUNT(DISTINCT s.unit_id) as unit_count,
           SUM(p.participant_count) as total_participants,
           GROUP_CONCAT(p.id) as proposal_ids,
           GROUP_CONCAT(DISTINCT u.unit_code) as unit_codes,
           GROUP_CONCAT(DISTINCT u.unit_name) as unit_names
    FROM training_demand_proposals p
    JOIN training_demand_submissions s ON p.submission_id = s.id
    JOIN units u ON s.unit_id = u.id
    WHERE p.canonical_id IS NULL AND (s.collection_id = ? OR ? IS NULL)
    GROUP BY p.proposal_name
    ORDER BY unit_count DESC, total_participants DESC
  `).all(collectionId, collectionId) as any[];

  const unmapped = unmappedRows.map(u => ({
    proposalName: u.proposal_name,
    recordCount: u.record_count,
    unitCount: u.unit_count,
    totalParticipants: u.total_participants,
    proposalIds: u.proposal_ids ? u.proposal_ids.split(',').map((id: string) => parseInt(id)) : [],
    units: u.unit_codes && u.unit_names ? u.unit_codes.split(',').map((code: string, idx: number) => ({
      unitCode: code,
      unitName: u.unit_names.split(',')[idx] || ''
    })) : []
  }));

  // 3. Tổng quan thống kê toàn hệ thống
  const statsRow = db.prepare(`
    SELECT
      COUNT(p.id) as total_proposals,
      COALESCE(SUM(p.participant_count), 0) as total_participants,
      COUNT(CASE WHEN p.canonical_id IS NOT NULL THEN 1 END) as mapped_proposals,
      COALESCE(SUM(CASE WHEN p.canonical_id IS NOT NULL THEN p.participant_count ELSE 0 END), 0) as mapped_participants,
      COUNT(CASE WHEN p.canonical_id IS NULL THEN 1 END) as unmapped_proposals,
      COALESCE(SUM(CASE WHEN p.canonical_id IS NULL THEN p.participant_count ELSE 0 END), 0) as unmapped_participants
    FROM training_demand_proposals p
    JOIN training_demand_submissions s ON p.submission_id = s.id
    WHERE (s.collection_id = ? OR ? IS NULL)
  `).get(collectionId, collectionId) as any;

  return NextResponse.json({
    collectionId,
    stats: {
      totalProposals: statsRow?.total_proposals || 0,
      totalParticipants: statsRow?.total_participants || 0,
      mappedProposals: statsRow?.mapped_proposals || 0,
      mappedParticipants: statsRow?.mapped_participants || 0,
      unmappedProposals: statsRow?.unmapped_proposals || 0,
      unmappedParticipants: statsRow?.unmapped_participants || 0,
      mappingCoveragePercent: statsRow?.total_proposals > 0
        ? Math.round((statsRow.mapped_proposals / statsRow.total_proposals) * 100)
        : 0
    },
    canonicals,
    unmapped
  });
}

// 2. POST: Thao tác tạo, cập nhật, xóa canonical và gộp/ánh xạ đề xuất
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const policyBlock = enforcePasswordPolicy(req, session);
  if (policyBlock) return policyBlock;

  if (!isCentralAdmin(session)) {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền chuẩn hóa đề xuất.' }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;
  const db = getDatabase();

  // 2.1 Tạo Tên chuẩn mới (CREATE_CANONICAL)
  if (action === 'CREATE_CANONICAL') {
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();

    if (!name || name.length < 3) {
      return NextResponse.json({ error: 'Tên chuyên đề chuẩn hóa phải có ít nhất 3 ký tự.' }, { status: 400 });
    }

    try {
      const ins = db.prepare(`
        INSERT INTO training_proposal_canonical (name, description, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(name, description || null);

      const newId = Number(ins.lastInsertRowid);

      logAudit({
        userId: session.id,
        action: 'CREATE_PROPOSAL_CANONICAL',
        details: `Tạo chuyên đề chuẩn hóa mới: "${name}" (ID=${newId})`,
        entityType: 'training_proposal_canonical',
        entityId: String(newId)
      });

      return NextResponse.json({
        success: true,
        message: `Đã tạo chuyên đề chuẩn hóa "${name}" thành công!`,
        id: newId
      });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return NextResponse.json({ error: `Chuyên đề chuẩn hóa "${name}" đã tồn tại.` }, { status: 400 });
      }
      return NextResponse.json({ error: 'Lỗi khi lưu chuyên đề chuẩn hóa: ' + e.message }, { status: 500 });
    }
  }

  // 2.2 Sửa Tên chuẩn (UPDATE_CANONICAL)
  if (action === 'UPDATE_CANONICAL') {
    const id = parseInt(body.id);
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();

    if (!id || !name || name.length < 3) {
      return NextResponse.json({ error: 'Dữ liệu cập nhật không hợp lệ.' }, { status: 400 });
    }

    try {
      db.prepare(`
        UPDATE training_proposal_canonical
        SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, description || null, id);

      logAudit({
        userId: session.id,
        action: 'UPDATE_PROPOSAL_CANONICAL',
        details: `Cập nhật chuyên đề chuẩn hóa ID=${id}: "${name}"`,
        entityType: 'training_proposal_canonical',
        entityId: String(id)
      });

      return NextResponse.json({ success: true, message: 'Đã cập nhật chuyên đề chuẩn hóa thành công!' });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return NextResponse.json({ error: `Tên chuyên đề "${name}" bị trùng với chuyên đề khác.` }, { status: 400 });
      }
      return NextResponse.json({ error: 'Lỗi khi cập nhật: ' + e.message }, { status: 500 });
    }
  }

  // 2.3 Xóa Tên chuẩn (DELETE_CANONICAL)
  // Quy tắc: Khi xóa tên chuẩn, các đề xuất liên kết chuyển về canonical_id = NULL, TUYỆT ĐỐI KHÔNG XÓA đề xuất gốc của đơn vị!
  if (action === 'DELETE_CANONICAL') {
    const id = parseInt(body.id);
    if (!id) return NextResponse.json({ error: 'Thiếu ID chuyên đề cần xóa.' }, { status: 400 });

    const canonical = db.prepare('SELECT id, name FROM training_proposal_canonical WHERE id = ?').get(id) as any;
    if (!canonical) return NextResponse.json({ error: 'Không tìm thấy chuyên đề chuẩn hóa.' }, { status: 404 });

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Gỡ ánh xạ các đề xuất thuộc canonical này về NULL (bảo toàn nguyên vẹn proposal_name gốc)
      db.prepare('UPDATE training_demand_proposals SET canonical_id = NULL WHERE canonical_id = ?').run(id);

      // 2. Xóa bản ghi trong training_proposal_canonical
      db.prepare('DELETE FROM training_proposal_canonical WHERE id = ?').run(id);

      db.exec('COMMIT;');

      logAudit({
        userId: session.id,
        action: 'DELETE_PROPOSAL_CANONICAL',
        details: `Xóa chuyên đề chuẩn hóa "${canonical.name}" (ID=${id}) và đưa các đề xuất liên quan về Chưa phân loại`,
        entityType: 'training_proposal_canonical',
        entityId: String(id)
      });

      return NextResponse.json({ success: true, message: `Đã xóa chuyên đề chuẩn hóa "${canonical.name}". Các đề xuất đã được đưa về trạng thái Chưa phân loại.` });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      return NextResponse.json({ error: 'Lỗi khi xóa chuyên đề chuẩn hóa: ' + e.message }, { status: 500 });
    }
  }

  // 2.4 Ánh xạ / Gộp đề xuất vào Tên chuẩn (MAP_PROPOSALS)
  if (action === 'MAP_PROPOSALS') {
    const canonicalId = parseInt(body.canonical_id);
    const proposalIds = Array.isArray(body.proposal_ids) ? body.proposal_ids.map((x: any) => parseInt(x)).filter(Boolean) : [];
    const proposalNames = Array.isArray(body.proposal_names) ? body.proposal_names.map((x: any) => String(x).trim()).filter(Boolean) : [];

    if (!canonicalId) {
      return NextResponse.json({ error: 'Vui lòng chọn Chuyên đề chuẩn hóa để ánh xạ.' }, { status: 400 });
    }

    const canonical = db.prepare('SELECT id, name FROM training_proposal_canonical WHERE id = ?').get(canonicalId) as any;
    if (!canonical) {
      return NextResponse.json({ error: 'Chuyên đề chuẩn hóa không tồn tại.' }, { status: 404 });
    }

    if (proposalIds.length === 0 && proposalNames.length === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn ít nhất một đề xuất để gộp.' }, { status: 400 });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      let updatedCount = 0;

      // Ánh xạ theo danh sách ID
      if (proposalIds.length > 0) {
        const placeholders = proposalIds.map(() => '?').join(',');
        const res = db.prepare(`
          UPDATE training_demand_proposals
          SET canonical_id = ?
          WHERE id IN (${placeholders})
        `).run(canonicalId, ...proposalIds);
        updatedCount += Number(res.changes);
      }

      // Ánh xạ theo danh sách Tên đề xuất (áp dụng cho tất cả các bản ghi có cùng tên)
      if (proposalNames.length > 0) {
        const placeholders = proposalNames.map(() => '?').join(',');
        const res = db.prepare(`
          UPDATE training_demand_proposals
          SET canonical_id = ?
          WHERE proposal_name IN (${placeholders})
        `).run(canonicalId, ...proposalNames);
        updatedCount += Number(res.changes);
      }

      db.exec('COMMIT;');

      logAudit({
        userId: session.id,
        action: 'MAP_PROPOSALS_TO_CANONICAL',
        details: `Đã ánh xạ ${updatedCount} bản ghi đề xuất vào chuyên đề chuẩn "${canonical.name}" (ID=${canonicalId})`,
        entityType: 'training_proposal_canonical',
        entityId: String(canonicalId)
      });

      return NextResponse.json({
        success: true,
        message: `Đã gộp thành công ${updatedCount} bản ghi đề xuất vào chuyên đề chuẩn hóa "${canonical.name}"!`
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      return NextResponse.json({ error: 'Lỗi khi ánh xạ đề xuất: ' + e.message }, { status: 500 });
    }
  }

  // 2.5 Hủy ánh xạ (UNMAP_PROPOSALS)
  if (action === 'UNMAP_PROPOSALS') {
    const proposalIds = Array.isArray(body.proposal_ids) ? body.proposal_ids.map((x: any) => parseInt(x)).filter(Boolean) : [];
    const proposalNames = Array.isArray(body.proposal_names) ? body.proposal_names.map((x: any) => String(x).trim()).filter(Boolean) : [];

    if (proposalIds.length === 0 && proposalNames.length === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn đề xuất cần hủy ánh xạ.' }, { status: 400 });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      let updatedCount = 0;
      if (proposalIds.length > 0) {
        const placeholders = proposalIds.map(() => '?').join(',');
        const res = db.prepare(`
          UPDATE training_demand_proposals
          SET canonical_id = NULL
          WHERE id IN (${placeholders})
        `).run(...proposalIds);
        updatedCount += Number(res.changes);
      }
      if (proposalNames.length > 0) {
        const placeholders = proposalNames.map(() => '?').join(',');
        const res = db.prepare(`
          UPDATE training_demand_proposals
          SET canonical_id = NULL
          WHERE proposal_name IN (${placeholders})
        `).run(...proposalNames);
        updatedCount += Number(res.changes);
      }
      db.exec('COMMIT;');

      return NextResponse.json({
        success: true,
        message: `Đã hủy ánh xạ ${updatedCount} đề xuất về nhóm Chưa phân loại.`
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      return NextResponse.json({ error: 'Lỗi khi hủy ánh xạ: ' + e.message }, { status: 500 });
    }
  }

  // 2.6 Tự động gộp theo tên chuẩn hóa (AUTO_MAP_EXACT)
  if (action === 'AUTO_MAP_EXACT') {
    const allCanonicals = db.prepare('SELECT id, name FROM training_proposal_canonical').all() as Array<{ id: number; name: string }>;
    const unmappedProposals = db.prepare('SELECT id, proposal_name FROM training_demand_proposals WHERE canonical_id IS NULL').all() as Array<{ id: number; proposal_name: string }>;

    const canonMap = new Map<string, number>();
    for (const c of allCanonicals) {
      canonMap.set(normalizeText(c.name), c.id);
    }

    let matchedCount = 0;
    db.exec('BEGIN TRANSACTION;');
    try {
      const updateStmt = db.prepare('UPDATE training_demand_proposals SET canonical_id = ? WHERE id = ?');
      for (const p of unmappedProposals) {
        const nName = normalizeText(p.proposal_name);
        const matchedCId = canonMap.get(nName);
        if (matchedCId) {
          updateStmt.run(matchedCId, p.id);
          matchedCount++;
        }
      }
      db.exec('COMMIT;');

      return NextResponse.json({
        success: true,
        message: `Tự động khớp và gộp thành công ${matchedCount} đề xuất có tên trùng khớp sau chuẩn hóa.`
      });
    } catch (e: any) {
      db.exec('ROLLBACK;');
      return NextResponse.json({ error: 'Lỗi khi tự động gộp: ' + e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
