import { getDatabase } from '../src/lib/db';

const db = getDatabase();

console.log('--- KHỞI TẠO ĐỢT THU THẬP & BIỂU MẪU ĐIỂN HÌNH ---');

// 1. Tạo Collection "Khảo sát & Thu thập dữ liệu Năm 2027"
db.exec(`
  INSERT OR IGNORE INTO collections (id, code, title, description, status, start_date, end_date)
  VALUES (
    1,
    'KHAO_SAT_2027',
    'Khảo sát & Thu thập Dữ liệu Năm 2027',
    'Đợt thu thập dữ liệu tập trung từ 162 đơn vị trên toàn hệ thống Agribank',
    'OPEN',
    '2027-01-01',
    '2027-12-31'
  );
`);

// Đồng bộ với bảng exams cũ để duy trì tương thích 100%
db.exec(`
  INSERT OR IGNORE INTO exams (id, code, title, description, status)
  VALUES (
    1,
    'KHAO_SAT_2027',
    'Khảo sát & Thu thập Dữ liệu Năm 2027',
    'Đợt thu thập dữ liệu tập trung từ 162 đơn vị trên toàn hệ thống Agribank',
    'OPEN'
  );
`);

// 2. Tạo FORM 1: "Danh sách cán bộ kiểm tra" (MASTER_VALIDATION)
db.exec(`
  INSERT OR IGNORE INTO forms (
    id, collection_id, form_code, title, description, input_method,
    validation_mode, employee_code_field, elearning_field, display_order
  )
  VALUES (
    1,
    1,
    'CANDIDATE_LIST',
    'Danh sách cán bộ tham gia kiểm tra',
    'Kê khai danh sách cán bộ. Bắt buộc đối chiếu 2 chiều với Master Employee Database.',
    'EXCEL',
    'MASTER_VALIDATION',
    'employee_code',
    'elearning_account',
    1
  );
`);

// 3. Tạo FORM 2: "Khảo sát nhu cầu đào tạo của đơn vị" (FORM_VALIDATION_ONLY)
db.exec(`
  INSERT OR IGNORE INTO forms (
    id, collection_id, form_code, title, description, input_method,
    validation_mode, display_order
  )
  VALUES (
    2,
    1,
    'TRAINING_SURVEY',
    'Khảo sát nhu cầu đào tạo của đơn vị',
    'Biểu mẫu khảo sát nhu cầu đào tạo chuyên đề năm 2027. Đơn vị kê khai theo số lượng và lĩnh vực, không cần danh sách cán bộ.',
    'BOTH',
    'FORM_VALIDATION_ONLY',
    2
  );
`);

// 4. Thêm các Form Fields cho FORM 2
db.exec(`
  DELETE FROM form_fields WHERE form_id = 2;
  
  INSERT INTO form_fields (form_id, field_name, label, field_type, required, display_order)
  VALUES (2, 'topic', 'Lĩnh vực / Chuyên đề đào tạo', 'TEXT', 1, 1);

  INSERT INTO form_fields (form_id, field_name, label, field_type, required, validation_rules, display_order)
  VALUES (2, 'quantity', 'Số lượng người có nhu cầu', 'NUMBER', 1, '{"min": 0}', 2);

  INSERT INTO form_fields (form_id, field_name, label, field_type, required, options, display_order)
  VALUES (2, 'method', 'Hình thức đào tạo mong muốn', 'SINGLE_SELECT', 1, '["Trực tiếp", "Online", "Kết hợp"]', 3);

  INSERT INTO form_fields (form_id, field_name, label, field_type, required, options, display_order)
  VALUES (2, 'priority', 'Mức độ ưu tiên', 'SINGLE_SELECT', 1, '["Cao", "Trung bình", "Thấp"]', 4);

  INSERT INTO form_fields (form_id, field_name, label, field_type, required, display_order)
  VALUES (2, 'desired_time', 'Thời gian mong muốn tổ chức', 'TEXT', 0, 5);

  INSERT INTO form_fields (form_id, field_name, label, field_type, required, display_order)
  VALUES (2, 'note', 'Ghi chú / Kiến nghị của đơn vị', 'LONG_TEXT', 0, 6);
`);

console.log('✅ Đã tạo thành công 2 Biểu mẫu mẫu trong cùng 1 Collection:');
console.log('   - Form 1: Danh sách cán bộ (MASTER_VALIDATION - Đối chiếu 2 chiều)');
console.log('   - Form 2: Khảo sát nhu cầu đào tạo (FORM_VALIDATION_ONLY - Quy tắc riêng, không gọi Master DB)');
