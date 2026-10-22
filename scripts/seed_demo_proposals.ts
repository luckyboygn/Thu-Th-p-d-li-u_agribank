import { getDatabase } from '../src/lib/db';

const isDryRun = !process.argv.includes('--apply');

console.log('========================================================================');
console.log(`SCRIPT TẠO DỮ LIỆU ĐỀ XUẤT MẪU 06 (${isDryRun ? 'DRY-RUN: CHỈ XEM' : 'APPLY: GHI DATABASE'})`);
console.log('========================================================================\n');

const db = getDatabase();

const activeUnits = db.prepare(`
  SELECT id, unit_code, unit_name
  FROM units
  WHERE status = 'ACTIVE'
  ORDER BY id ASC
  LIMIT 20
`).all() as Array<{ id: number; unit_code: string; unit_name: string }>;

console.log(`Tìm thấy ${activeUnits.length} đơn vị mẫu.`);

const collection = db.prepare("SELECT id, code, title FROM collections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1").get() as any
  || db.prepare("SELECT id, code, title FROM collections ORDER BY id DESC LIMIT 1").get() as any;

if (!collection) {
  console.error('Không tìm thấy đợt khảo sát nào.');
  process.exit(1);
}

console.log(`Đợt khảo sát: ID=${collection.id}, Tiêu đề="${collection.title}"`);

// Danh sách các nhóm ý tưởng đề xuất thực tế với nhiều biến thể cách viết giữa các đơn vị
const proposalSeeds = [
  // Nhóm 1: Kỹ năng giao tiếp khách hàng
  {
    topicGroup: 'Kỹ năng giao tiếp khách hàng',
    items: [
      { unitIdx: 0, name: 'Kỹ năng giao tiếp và chăm sóc khách hàng', audience: 'Giao dịch viên', count: 12, duration: '2 ngày' },
      { unitIdx: 1, name: 'KỸ NĂNG GIAO TIẾP KHÁCH HÀNG', audience: 'GDV, Kiểm soát viên', count: 15, duration: '2 ngày' },
      { unitIdx: 2, name: 'Kỹ năng giao tiếp khách hàng', audience: 'Toàn thể cán bộ', count: 20, duration: '1 ngày' },
      { unitIdx: 3, name: 'Kỹ năng giao tiếp, ứng xử với khách hàng', audience: 'Giao dịch viên', count: 8, duration: '2 ngày' },
      { unitIdx: 4, name: 'Kỹ năng giao tiếp khách hàng nâng cao', audience: 'GDV, Cán bộ tín dụng', count: 10, duration: '3 ngày' },
      { unitIdx: 5, name: 'Ky nang giao tiep khach hang', audience: 'GDV', count: 14, duration: '2 ngày' },
    ]
  },
  // Nhóm 2: Thẩm định tài chính và định giá tài sản
  {
    topicGroup: 'Thẩm định tài chính doanh nghiệp',
    items: [
      { unitIdx: 0, name: 'Thẩm định báo cáo tài chính doanh nghiệp', audience: 'Cán bộ tín dụng', count: 10, duration: '3 ngày' },
      { unitIdx: 1, name: 'Phân tích và thẩm định BCTC doanh nghiệp', audience: 'Cán bộ tín dụng, Trưởng phòng', count: 12, duration: '3 ngày' },
      { unitIdx: 2, name: 'Thẩm định tài chính doanh nghiệp chuyên sâu', audience: 'Cán bộ quản trị rủi ro', count: 6, duration: '2 ngày' },
      { unitIdx: 6, name: 'Kỹ năng phân tích báo cáo tài chính doanh nghiệp', audience: 'Cán bộ KH&QLRR', count: 8, duration: '2 ngày' },
      { unitIdx: 7, name: 'Thẩm định báo cáo tài chính doanh nghiệp', audience: 'Cán bộ tín dụng', count: 15, duration: '3 ngày' },
    ]
  },
  // Nhóm 3: Ứng dụng AI và công nghệ số
  {
    topicGroup: 'Ứng dụng AI trong công việc ngân hàng',
    items: [
      { unitIdx: 2, name: 'Ứng dụng Trí tuệ nhân tạo (AI) trong phân tích dữ liệu', audience: 'Cán bộ công nghệ, tổng hợp', count: 8, duration: '2 ngày' },
      { unitIdx: 3, name: 'Ứng dụng ChatGPT và AI trong soạn thảo văn bản', audience: 'Cán bộ văn phòng, Kế hoạch', count: 25, duration: '1 ngày' },
      { unitIdx: 4, name: 'Ứng dụng AI và Generative AI trong ngân hàng số', audience: 'Cán bộ nghiệp vụ', count: 14, duration: '2 ngày' },
      { unitIdx: 8, name: 'Ứng dụng công nghệ AI nâng cao hiệu suất làm việc', audience: 'Toàn chi nhánh', count: 30, duration: '1 ngày' },
    ]
  },
  // Nhóm 4: Phòng chống rủi ro gian lận trực tuyến
  {
    topicGroup: 'Phòng chống gian lận và an toàn thông tin',
    items: [
      { unitIdx: 5, name: 'Phòng chống gian lận, lừa đảo công nghệ cao', audience: 'GDV, Kiểm soát viên', count: 18, duration: '1 ngày' },
      { unitIdx: 6, name: 'Nhận diện và phòng ngừa gian lận trong thanh toán điện tử', audience: 'Cán bộ thanh toán, Kế toán', count: 16, duration: '2 ngày' },
      { unitIdx: 7, name: 'Kỹ năng nhận diện và phòng chống rủi ro gian lận', audience: 'Toàn thể người lao động', count: 22, duration: '1 ngày' },
      { unitIdx: 9, name: 'An toàn bảo mật thông tin và phòng ngừa lừa đảo', audience: 'Tất cả cán bộ', count: 40, duration: '1 ngày' },
    ]
  },
  // Nhóm 5: Tín dụng nông nghiệp công nghệ cao
  {
    topicGroup: 'Tín dụng nông nghiệp công nghệ cao',
    items: [
      { unitIdx: 10, name: 'Nghiệp vụ cấp tín dụng nông nghiệp công nghệ cao', audience: 'Cán bộ tín dụng nông nghiệp', count: 12, duration: '2 ngày' },
      { unitIdx: 11, name: 'Thẩm định dự án nông nghiệp công nghệ cao', audience: 'Cán bộ tín dụng', count: 9, duration: '2 ngày' },
      { unitIdx: 12, name: 'Cấp tín dụng dự án nông nghiệp xanh, tuần hoàn', audience: 'Cán bộ tín dụng', count: 7, duration: '2 ngày' },
    ]
  },
  // Nhóm 6: Kỹ năng đàm phán và xử lý nợ xấu
  {
    topicGroup: 'Kỹ năng xử lý và thu hồi nợ xấu',
    items: [
      { unitIdx: 8, name: 'Kỹ năng đàm phán thu hồi nợ xấu', audience: 'Cán bộ xử lý nợ, Tín dụng', count: 14, duration: '2 ngày' },
      { unitIdx: 9, name: 'Nghiệp vụ khởi kiện và thi hành án thu hồi nợ', audience: 'Cán bộ pháp chế, Xử lý nợ', count: 8, duration: '3 ngày' },
      { unitIdx: 13, name: 'Kỹ năng xử lý, thu hồi nợ có vấn đề', audience: 'Cán bộ tín dụng', count: 11, duration: '2 ngày' },
    ]
  },
  // Đề xuất đơn lẻ (chưa phân loại)
  {
    topicGroup: 'Đề xuất riêng lẻ',
    items: [
      { unitIdx: 14, name: 'Hội thảo chia sẻ kinh nghiệm phát triển thẻ tín dụng Lộc Việt', audience: 'Cán bộ bán lẻ', count: 15, duration: '1 ngày' },
      { unitIdx: 15, name: 'Tập huấn kỹ năng PCCC và cứu nạn cứu hộ tại trụ sở', audience: 'Đội PCCC cơ sở', count: 20, duration: '1 ngày' },
      { unitIdx: 16, name: 'Kỹ năng quản lý thời gian và giải tỏa căng thẳng', audience: 'Nữ cán bộ ngân hàng', count: 35, duration: '1 ngày' },
    ]
  }
];

let totalToInsert = 0;
for (const g of proposalSeeds) {
  totalToInsert += g.items.length;
}

console.log(`Tổng cộng chuẩn bị nạp ${totalToInsert} đề xuất phân bổ qua ${activeUnits.length} đơn vị.`);

if (isDryRun) {
  console.log('\n[CHẾ ĐỘ DRY-RUN] Danh sách đề xuất sẽ được tạo:');
  proposalSeeds.forEach(g => {
    console.log(`\nNhóm dự kiến: [${g.topicGroup}] (${g.items.length} đề xuất)`);
    g.items.forEach(it => {
      const u = activeUnits[it.unitIdx] || activeUnits[0];
      console.log(`  - Đơn vị: [${u.unit_code}] ${u.unit_name} -> "${it.name}" (${it.count} người)`);
    });
  });
  console.log('\nChạy lại với tham số --apply để thực sự ghi vào CSDL:');
  console.log('npx tsx scripts/seed_demo_proposals.ts --apply\n');
} else {
  console.log('\n[CHẾ ĐỘ APPLY] Đang ghi vào cơ sở dữ liệu...');
  db.exec('BEGIN TRANSACTION;');
  try {
    const getSubStmt = db.prepare('SELECT id FROM training_demand_submissions WHERE collection_id = ? AND unit_id = ?');
    const insSubStmt = db.prepare(`
      INSERT INTO training_demand_submissions (collection_id, unit_id, status, note)
      VALUES (?, ?, 'SUBMITTED', 'Dữ liệu khảo sát thử nghiệm')
    `);
    const insPropStmt = db.prepare(`
      INSERT INTO training_demand_proposals (
        submission_id, proposal_name, target_audience, participant_count, expected_duration, delivery_method, faculty_source, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    for (const g of proposalSeeds) {
      for (const it of g.items) {
        const u = activeUnits[it.unitIdx] || activeUnits[0];
        let sub = getSubStmt.get(collection.id, u.id) as any;
        if (!sub) {
          const res = insSubStmt.run(collection.id, u.id);
          sub = { id: Number(res.lastInsertRowid) };
        }

        insPropStmt.run(
          sub.id,
          it.name,
          it.audience,
          it.count,
          it.duration,
          'Trực tiếp & Trực tuyến',
          'Giảng viên nội bộ / Chuyên gia ngoài',
          'Đề xuất phục vụ thực tiễn công tác'
        );
        insertedCount++;
      }
    }

    db.exec('COMMIT;');
    console.log(`ĐÃ THÊM THÀNH CÔNG ${insertedCount} ĐỀ XUẤT VÀO BẢNG training_demand_proposals!`);
  } catch (err: any) {
    db.exec('ROLLBACK;');
    console.error('Lỗi khi ghi dữ liệu:', err);
    process.exit(1);
  }
}
