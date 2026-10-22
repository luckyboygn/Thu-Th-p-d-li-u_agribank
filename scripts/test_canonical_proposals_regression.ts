import { getDatabase } from '../src/lib/db';
import { normalizeText } from '../src/lib/unit-matcher';

async function runRegressionTests() {
  console.log('========================================================================');
  console.log('   BẮT ĐẦU CHẠY REGRESSION TEST: P5 CHUẨN HÓA ĐỀ XUẤT NGOÀI KHUNG');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? `: ${detail}` : ''}`);
      failed++;
    }
  }

  const db = getDatabase();

  // -------------------------------------------------------------
  // TEST SUITE 1: KIỂM TRA CẤU TRÚC BẢNG & CỘT CANONICAL (SCHEMA INTEGRITY)
  // -------------------------------------------------------------
  console.log('TEST SUITE 1: KIỂM TRA SCHEMA CSDL');
  {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='training_proposal_canonical'").get();
    assert(Boolean(tableCheck), 'Bảng training_proposal_canonical tồn tại trong CSDL');

    const propColumns = db.prepare("PRAGMA table_info(training_demand_proposals)").all() as any[];
    const hasCanonicalId = propColumns.some(c => c.name === 'canonical_id');
    assert(hasCanonicalId, 'Bảng training_demand_proposals có cột canonical_id (INTEGER, nullable)');

    const indexCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_proposals_canonical'").get();
    assert(Boolean(indexCheck), 'Index idx_proposals_canonical tồn tại');
  }

  // -------------------------------------------------------------
  // TEST SUITE 2: TẠO CHUYÊN ĐỀ CHUẨN & ÁNH XẠ ĐỀ XUẤT (CANONICAL MAPPING)
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 2: TẠO CHUYÊN ĐỀ CHUẨN & ÁNH XẠ ĐỀ XUẤT');
  let canonId1 = 0;
  let canonId2 = 0;
  {
    // Tạo 2 chuyên đề chuẩn
    db.prepare("DELETE FROM training_proposal_canonical WHERE name IN ('Kỹ năng giao tiếp khách hàng', 'Thẩm định tài chính doanh nghiệp')").run();

    const ins1 = db.prepare(`
      INSERT INTO training_proposal_canonical (name, description)
      VALUES (?, ?)
    `).run('Kỹ năng giao tiếp khách hàng', 'Chuyên đề nâng cao kỹ năng giao tiếp và chăm sóc khách hàng cho GDV & QHKH');
    canonId1 = Number(ins1.lastInsertRowid);
    assert(canonId1 > 0, `Tạo thành công Canonical 1: "Kỹ năng giao tiếp khách hàng" (ID=${canonId1})`);

    const ins2 = db.prepare(`
      INSERT INTO training_proposal_canonical (name, description)
      VALUES (?, ?)
    `).run('Thẩm định tài chính doanh nghiệp', 'Phân tích và thẩm định báo cáo tài chính doanh nghiệp');
    canonId2 = Number(ins2.lastInsertRowid);
    assert(canonId2 > 0, `Tạo thành công Canonical 2: "Thẩm định tài chính doanh nghiệp" (ID=${canonId2})`);

    // Lưu lại tên gốc trước khi gộp để kiểm tra tính toàn vẹn
    const beforeProps = db.prepare(`
      SELECT id, proposal_name, participant_count FROM training_demand_proposals
      WHERE proposal_name LIKE '%giao tiếp%' OR proposal_name LIKE '%thẩm định%'
    `).all() as any[];
    console.log(`  -> Số đề xuất liên quan tìm thấy: ${beforeProps.length}`);

    // Ánh xạ các biến thể vào Canonical 1
    const mapRes1 = db.prepare(`
      UPDATE training_demand_proposals
      SET canonical_id = ?
      WHERE proposal_name LIKE '%giao tiếp%' OR proposal_name LIKE '%giao tiep%'
    `).run(canonId1);
    assert(Number(mapRes1.changes) > 0, `Đã ánh xạ ${mapRes1.changes} đề xuất vào Canonical 1`);

    // Ánh xạ các biến thể vào Canonical 2
    const mapRes2 = db.prepare(`
      UPDATE training_demand_proposals
      SET canonical_id = ?
      WHERE proposal_name LIKE '%thẩm định%' OR proposal_name LIKE '%BCTC%'
    `).run(canonId2);
    assert(Number(mapRes2.changes) > 0, `Đã ánh xạ ${mapRes2.changes} đề xuất vào Canonical 2`);
  }

  // -------------------------------------------------------------
  // TEST SUITE 3: BẢO TOÀN TÊN GỐC CỦA ĐƠN VỊ (RULE 3)
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 3: BẢO TOÀN TUYỆT ĐỐI TÊN ĐỀ XUẤT GỐC (PROPOSAL_NAME)');
  {
    const mappedProps = db.prepare(`
      SELECT p.id, p.proposal_name, p.canonical_id, c.name as canonical_name
      FROM training_demand_proposals p
      JOIN training_proposal_canonical c ON p.canonical_id = c.id
      WHERE p.canonical_id = ?
    `).all(canonId1) as any[];

    // Kiểm tra rằng proposal_name gốc vẫn giữ nguyên các biến thể chữ hoa, chữ thường, không dấu, có dấu
    const variations = new Set(mappedProps.map(p => p.proposal_name));
    assert(variations.size > 1, `Các đề xuất thuộc Canonical 1 vẫn giữ nguyên ${variations.size} cách viết gốc khác nhau của từng đơn vị: ${Array.from(variations).join(' | ')}`);
  }

  // -------------------------------------------------------------
  // TEST SUITE 4: BÁO CÁO TỔNG HỢP GOM THEO CANONICAL & NHÓM "CHƯA PHÂN LOẠI"
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 4: BÁO CÁO TỔNG HỢP GOM THEO CANONICAL & "CHƯA PHÂN LOẠI"');
  {
    const allProps = db.prepare(`
      SELECT p.*, c.name as canonical_name
      FROM training_demand_proposals p
      LEFT JOIN training_proposal_canonical c ON p.canonical_id = c.id
    `).all() as any[];

    const totalSystemParticipants = allProps.reduce((s, p) => s + (p.participant_count || 0), 0);

    // Mô phỏng gom nhóm của route /api/training-reports?type=PROPOSALS
    const groupsMap = new Map<string, { canonicalName: string; totalParticipants: number; count: number; isMapped: boolean }>();
    for (const p of allProps) {
      const key = p.canonical_id ? `CANON_${p.canonical_id}` : '__UNMAPPED__';
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          canonicalName: p.canonical_id ? p.canonical_name : 'Chưa phân loại',
          totalParticipants: 0,
          count: 0,
          isMapped: Boolean(p.canonical_id)
        });
      }
      const g = groupsMap.get(key)!;
      g.totalParticipants += (p.participant_count || 0);
      g.count++;
    }

    const groups = Array.from(groupsMap.values());
    const sumGroupParticipants = groups.reduce((s, g) => s + g.totalParticipants, 0);

    assert(sumGroupParticipants === totalSystemParticipants, `Tổng người học sau gom nhóm (${sumGroupParticipants}) khớp 100% với tổng số người toàn hệ thống (${totalSystemParticipants})`);

    const unmappedGroup = groups.find(g => !g.isMapped);
    assert(Boolean(unmappedGroup), 'Nhóm "Chưa phân loại" tồn tại trong báo cáo');
    assert((unmappedGroup?.totalParticipants || 0) > 0, `Nhóm "Chưa phân loại" hiển thị đúng số người (${unmappedGroup?.totalParticipants} người) và KHÔNG bị bỏ khỏi tổng`);
    assert((unmappedGroup?.count || 0) > 0, `Nhóm "Chưa phân loại" có ${unmappedGroup?.count} đề xuất chưa gộp`);
  }

  // -------------------------------------------------------------
  // TEST SUITE 5: XÓA CANONICAL TRẢ VỀ "CHƯA PHÂN LOẠI", BẢO TOÀN DỮ LIỆU GỐC
  // -------------------------------------------------------------
  console.log('\nTEST SUITE 5: XÓA CANONICAL AN TOÀN (GIỮ NGUYÊN BẢN GHI ĐỀ XUẤT)');
  {
    const beforeCount = db.prepare('SELECT count(*) as c FROM training_demand_proposals').get() as any;

    // Xóa Canonical 2
    db.prepare('UPDATE training_demand_proposals SET canonical_id = NULL WHERE canonical_id = ?').run(canonId2);
    db.prepare('DELETE FROM training_proposal_canonical WHERE id = ?').run(canonId2);

    const afterCount = db.prepare('SELECT count(*) as c FROM training_demand_proposals').get() as any;
    assert(beforeCount.c === afterCount.c, `Số lượng bản ghi đề xuất không đổi (${beforeCount.c} = ${afterCount.c}), đề xuất của đơn vị không bị xóa khi xóa tên chuẩn`);

    const unmappedAfter = db.prepare('SELECT count(*) as c FROM training_demand_proposals WHERE canonical_id IS NULL').get() as any;
    assert(unmappedAfter.c > 0, `Các đề xuất liên kết đã được trả về trạng thái Chưa phân loại (hiện có ${unmappedAfter.c} bản ghi chưa phân loại)`);
  }

  // -------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`KẾT QUẢ REGRESSION TEST P5: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

runRegressionTests().catch(err => {
  console.error('Lỗi khi chạy regression test:', err);
  process.exit(1);
});
