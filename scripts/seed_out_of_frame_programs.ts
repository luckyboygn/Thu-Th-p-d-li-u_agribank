import { DatabaseSync } from 'node:sqlite';
import path from 'path';

interface OutOfFrameProgramDefinition {
  code: string;
  name: string;
  group_name: string;
  display_order: number;
  topics: {
    topic_name: string;
    target_audience: string;
    duration: string;
    delivery_method: string;
  }[];
}

export const sixMajorPrograms: OutOfFrameProgramDefinition[] = [
  // CHƯƠNG TRÌNH 1:
  {
    code: 'PL_NK.1',
    name: 'I. CÁC CHƯƠNG TRÌNH TIẾP TỤC THỰC HIỆN/CHUYỂN TIẾP TỪ KẾ HOẠCH 2026',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 101,
    topics: [
      {
        topic_name: 'Hội nhập Agribank',
        target_audience: 'Người lao động mới tuyển dụng vào hệ thống Agribank năm 2026, 2027 (năm 2025 học theo nhu cầu).',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Tập huấn các quy chế, quy định trong lĩnh vực tài chính kế toán và tiền tệ kho quỹ',
        target_audience: '- Trụ sở chính: Người lao động làm công tác liên quan đến tài chính kế toán tại các Ban, Trung tâm, ĐVSN, VPĐD.\n- Chi nhánh: Lãnh đạo và cán bộ làm công tác Kế toán, Ngân quỹ, KTGSNB.',
        duration: '2 ngày',
        delivery_method: 'Kết hợp (Trực tiếp kết hợp trực tuyến)'
      },
      {
        topic_name: 'Nghiệp vụ tổ chức nhân sự, tiền lương',
        target_audience: '- Trụ sở chính: Cán bộ làm công tác nhân sự tại KTNB, các Ủy ban, Ban, Trung tâm, Cơ quan Đảng ủy, VPĐD, ĐVSN.\n- Chi nhánh: Cán bộ làm công tác Nhân sự - Tiền lương.',
        duration: '2 ngày',
        delivery_method: 'Kết hợp'
      },
      {
        topic_name: 'Nghiệp vụ thi đua khen thưởng, đào tạo đối với người lao động',
        target_audience: '- Trụ sở chính: Cán bộ làm công tác nhân sự, thi đua, đào tạo tại các đơn vị.\n- Chi nhánh: Cán bộ làm công tác Nhân sự tiền lương, Thi đua khen thưởng, Đào tạo.',
        duration: '1 ngày',
        delivery_method: 'Kết hợp'
      },
      {
        topic_name: 'Phổ biến, cập nhật văn bản quy phạm pháp luật về đấu thầu, đấu thầu qua mạng',
        target_audience: 'Người lao động làm công việc liên quan đến công tác đấu thầu tại KTNB, đơn vị thành viên Trụ sở chính, Văn phòng Đại diện, Đơn vị sự nghiệp, Chi nhánh.',
        duration: '2 ngày',
        delivery_method: 'Kết hợp'
      },
      {
        topic_name: 'Nghiệp vụ đấu thầu qua mạng',
        target_audience: 'Người lao động làm công việc liên quan đến công tác đấu thầu tại KTNB, đơn vị thành viên Trụ sở chính, Văn phòng Đại diện, Đơn vị sự nghiệp, Chi nhánh.',
        duration: '2 ngày',
        delivery_method: 'Kết hợp'
      },
      {
        topic_name: 'Nghiệp vụ đấu thầu chuyên sâu',
        target_audience: 'Người lao động làm công việc liên quan đến công tác đấu thầu tại KTNB, đơn vị thành viên Trụ sở chính, Văn phòng Đại diện, Đơn vị sự nghiệp, Chi nhánh.',
        duration: '2 ngày',
        delivery_method: 'Kết hợp'
      }
    ]
  },

  // CHƯƠNG TRÌNH 2:
  {
    code: 'PL_NK.2',
    name: 'II. CHƯƠNG TRÌNH NỀN TẢNG VỀ QUẢN TRỊ HIỆN ĐẠI (OECD & NQ 79-NQ/TW)',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 102,
    topics: [
      {
        topic_name: 'Nhận thức nền tảng về Nghị quyết 79, Chiến lược Agribank và Quản trị hiện đại',
        target_audience: 'Toàn thể người lao động trong hệ thống Agribank.',
        duration: '02 giờ',
        delivery_method: 'Trực tuyến (E-learning)'
      },
      {
        topic_name: 'Quản trị Agribank theo định hướng hiện đại, tham chiếu nguyên tắc OECD và Nghị quyết số 79-NQ/TW',
        target_audience: 'Thành viên HĐTV, Ban Kiểm soát, Ban Điều hành, Trưởng các đơn vị Trụ sở chính.',
        duration: '1 ngày',
        delivery_method: 'Trực tiếp, Hội thảo chuyên đề'
      },
      {
        topic_name: 'Tổ chức thực hiện Chiến lược, nhiệm vụ chính sách và nâng cao hiệu quả hoạt động',
        target_audience: 'Lãnh đạo các Ban Trụ sở chính, Giám đốc Chi nhánh loại I, cán bộ kế hoạch chiến lược.',
        duration: '2 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Quản trị rủi ro tổng thể, an toàn vốn và chuẩn mực Basel',
        target_audience: 'Lãnh đạo đơn vị, cấp phòng và nhân viên phụ trách rủi ro, Kiểm tra giám sát nội bộ, Vốn, ALCO, thẩm định tín dụng.',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Bồi dưỡng đội ngũ chuyên gia nội bộ về Quản trị hiện đại, tham chiếu nguyên tắc OECD',
        target_audience: 'Cán bộ quy hoạch, cán bộ giỏi nghiệp vụ, giảng viên Agribank thuộc các Ban KHCL, rủi ro, pháp chế, kiểm toán, KTGSNB…',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      }
    ]
  },

  // CHƯƠNG TRÌNH 3:
  {
    code: 'PL_NK.3',
    name: 'III. CHƯƠNG TRÌNH CÔNG NGHỆ, TÍN DỤNG XANH & KỸ NĂNG BH, CSKH THEO KHU VỰC, VÙNG MIỀN',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 103,
    topics: [
      {
        topic_name: 'Ứng dụng AI Agent trong nghiệp vụ Ngân hàng (ChatGPT & Codex)',
        target_audience: 'Cán bộ Khối CNTT, Khối Dữ liệu & ĐMST, lãnh đạo cấp phòng/ban, cán bộ nghiệp vụ nòng cốt.',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Phân tích dữ liệu và Phân khúc khách hàng ngân hàng với Power BI & AI',
        target_audience: 'Khối Dữ liệu & ĐMST, Quản lý khách hàng (RM), Ngân hàng bán lẻ, Kế toán, Quản trị rủi ro.',
        duration: '4 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Thẩm định Tín dụng Xanh và Quản trị Rủi ro Môi trường - Xã hội (ESG)',
        target_audience: 'Lãnh đạo Chi nhánh phụ trách tín dụng, Trưởng phòng KHKD, chuyên viên thẩm định KHDN và KHCN.',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Cơ chế Đo đạc MRV và Thẩm định Dự án Tín chỉ Carbon trong Nông nghiệp',
        target_audience: 'Cán bộ Khối Thẩm định, Ban Tín dụng KHDN, Ban chỉ đạo, tổ giúp việc triển khai ESG, cán bộ tín dụng địa bàn trọng điểm nông nghiệp.',
        duration: '2 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Kỹ năng Bán hàng và Chăm sóc khách hàng thích ứng văn hóa theo khu vực, vùng miền',
        target_audience: 'Giao dịch viên, chuyên viên quan hệ khách hàng, cán bộ tín dụng tại các Chi nhánh.',
        duration: '2 ngày',
        delivery_method: 'Trực tiếp'
      }
    ]
  },

  // CHƯƠNG TRÌNH 4:
  {
    code: 'PL_NK.4',
    name: 'IV. CHƯƠNG TRÌNH PHỤC VỤ KHÁCH HÀNG CAO CẤP (PRIORITY BANKING)',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 104,
    topics: [
      {
        topic_name: 'Kỹ năng chăm sóc khách hàng & Xử lý tình huống',
        target_audience: 'Giao dịch viên, Kiểm soát viên, Cán bộ Dịch vụ khách hàng, cán bộ tín dụng.',
        duration: '1 - 1,5 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Nghệ thuật tiếp cận và Quản trị quan hệ Khách hàng cao cấp',
        target_audience: 'Chuyên viên (Nhân viên) QHKH (ưu tiên cán bộ được phân công quản lý KH VIP, KH ưu tiên, Priority RM), Lãnh đạo Phòng Kế toán, Tổng hợp (mảng Dịch vụ - MKT), Phòng KHKD phụ trách khách hàng VIP.',
        duration: '2 ngày',
        delivery_method: 'Trực tiếp'
      }
    ]
  },

  // CHƯƠNG TRÌNH 5:
  {
    code: 'PL_NK.5',
    name: 'V. CHƯƠNG TRÌNH NÂNG CAO NĂNG LỰC QUẢN TRỊ & RA QUYẾT ĐỊNH DỰA TRÊN DỮ LIỆU DÀNH CHO LÃNH ĐẠO',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 105,
    topics: [
      {
        topic_name: 'Kỹ năng Thẩm định và Phân tích Tín dụng Doanh nghiệp dựa trên Dữ liệu (Data-driven Credit Analysis)',
        target_audience: 'Chuyên viên Quản lý Khách hàng (RM), Cán bộ Thẩm định tín dụng, Lãnh đạo Phòng KHKD, Phòng Thẩm định.',
        duration: '3 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Nâng cao Năng lực Quản trị và Ra Quyết định dựa trên Dữ liệu (Data-driven Decision Making)',
        target_audience: 'Trưởng/Phó phòng các đơn vị TSC, Giám đốc/Phó Giám đốc Chi nhánh, Cán bộ Quản lý cấp trung toàn hệ thống.',
        duration: '1 ngày',
        delivery_method: 'Trực tiếp (Hội thảo thực chiến)'
      },
      {
        topic_name: 'Quản trị Bán hàng toàn diện và Tối ưu hiệu suất đội ngũ',
        target_audience: 'Giám đốc Chi nhánh, Trưởng phòng Khách hàng Doanh nghiệp, Trưởng phòng Khách hàng Cá nhân, Trưởng phòng Khách hàng.',
        duration: '1 ngày',
        delivery_method: 'Trực tiếp'
      },
      {
        topic_name: 'Quản trị Rủi ro dựa trên Dữ liệu và Kiến tạo Văn hóa An toàn (Data-driven Risk Management & Just Culture)',
        target_audience: 'Giám đốc Chi nhánh, Quản lý Khối Khách hàng, Quản lý Phòng Ban Hội sở, Cán bộ QLRR và Giám sát tuân thủ.',
        duration: '1 ngày',
        delivery_method: 'Trực tiếp'
      }
    ]
  },

  // CHƯƠNG TRÌNH 6:
  {
    code: 'PL_NK.6',
    name: 'VI. CÁC CHƯƠNG TRÌNH DÀNH CHO KHÁCH HÀNG, NGƯỜI LAO ĐỘNG',
    group_name: 'CHƯƠNG TRÌNH NGOÀI KHUNG ĐÀO TẠO',
    display_order: 106,
    topics: [
      {
        topic_name: 'Nhận diện rủi ro tài chính cơ bản',
        target_audience: 'Khách hàng cá nhân',
        duration: '2 giờ',
        delivery_method: 'Trực tuyến'
      },
      {
        topic_name: 'Phân tích dữ liệu dành cho SME',
        target_audience: 'Khách hàng doanh nghiệp',
        duration: '2 giờ',
        delivery_method: 'Trực tuyến'
      },
      {
        topic_name: 'Xây dựng AI Agent cho doanh nghiệp khởi nghiệp',
        target_audience: 'Khách hàng doanh nghiệp',
        duration: '2 giờ',
        delivery_method: 'Trực tuyến'
      }
    ]
  }
];

export function seedOutOfFramePrograms() {
  const dbPath = path.join(process.cwd(), 'data/database.sqlite');
  const db = new DatabaseSync(dbPath);

  // Đảm bảo có đủ cột
  const tableInfo = db.prepare('PRAGMA table_info(training_programs)').all() as any[];
  if (!tableInfo.some(c => c.name === 'category_type')) {
    db.exec(`ALTER TABLE training_programs ADD COLUMN category_type VARCHAR(50) DEFAULT 'TRONG_KHUNG';`);
  }

  const topicTableInfo = db.prepare('PRAGMA table_info(training_program_topics)').all() as any[];
  if (!topicTableInfo.some(c => c.name === 'target_audience')) {
    db.exec(`ALTER TABLE training_program_topics ADD COLUMN target_audience TEXT;`);
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Xóa các bản ghi cũ của nhóm ngoài khung trước đó để cấu trúc lại thành đúng 6 mục lớn
    // Lấy ID của các chương trình ngoài khung cũ (code bắt đầu bằng NK_)
    const oldOutPrograms = db.prepare(`SELECT id FROM training_programs WHERE category_type = 'NGOAI_KHUNG' OR code LIKE 'NK_%'`).all() as any[];
    for (const p of oldOutPrograms) {
      db.prepare('DELETE FROM training_demand_program_topics WHERE program_topic_id IN (SELECT id FROM training_program_topics WHERE program_id = ?)').run(p.id);
      db.prepare('DELETE FROM training_demand_programs WHERE program_id = ?').run(p.id);
      db.prepare('DELETE FROM training_program_topics WHERE program_id = ?').run(p.id);
      db.prepare('DELETE FROM training_programs WHERE id = ?').run(p.id);
    }

    const insertProgStmt = db.prepare(`
      INSERT INTO training_programs (code, name, group_name, display_order, status, category_type)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'NGOAI_KHUNG')
    `);

    const getProgStmt = db.prepare('SELECT id FROM training_programs WHERE code = ?');
    const insertTopicStmt = db.prepare(`
      INSERT INTO training_program_topics (program_id, topic_name, target_audience, delivery_method, duration, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let progsCount = 0;
    let topicsCount = 0;

    for (const prog of sixMajorPrograms) {
      insertProgStmt.run(prog.code, prog.name, prog.group_name, prog.display_order);
      const row = getProgStmt.get(prog.code) as any;
      const progId = row.id;
      progsCount++;

      let tOrder = 1;
      for (const t of prog.topics) {
        insertTopicStmt.run(progId, t.topic_name, t.target_audience, t.delivery_method, t.duration, tOrder++);
        topicsCount++;
      }
    }

    db.exec('COMMIT;');
    console.log(`✅ Đã nạp thành công đúng ${progsCount} CHƯƠNG TRÌNH LỚN và ${topicsCount} chuyên đề thuộc NHÓM NGOÀI KHUNG ĐÀO TẠO!`);
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Lỗi khi nạp chương trình ngoài khung:', err);
    throw err;
  }
}

if (require.main === module) {
  seedOutOfFramePrograms();
}
