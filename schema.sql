-- BẢNG 1: ĐƠN VỊ (162 ĐƠN VỊ TOÀN HỆ THỐNG)
CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_code VARCHAR(50) UNIQUE NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    unit_type VARCHAR(50) DEFAULT 'BRANCH_L1', -- 'HO' | 'BRANCH_L1' | 'BRANCH_L2' | 'SUBSIDIARY'
    region VARCHAR(50) DEFAULT 'MIEN_BAC', -- 'MIEN_BAC' | 'MIEN_TRUNG' | 'TAY_NGUYEN' | 'MIEN_NAM' | 'HO'
    parent_unit_id INTEGER REFERENCES units(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 2: NGƯỜI DÙNG & TÀI KHOẢN (SUPER_ADMIN, UNIT_ADMIN, VIEWER)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'VIEWER'
    unit_id INTEGER REFERENCES units(id),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    token_version INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 0,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    password_changed_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 3: DATABASE TRUNG TÂM CÁN BỘ (34.000 CÁN BỘ - NGUỒN XÁC THỰC DUY NHẤT 1-1)
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    elearning_account VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    unit_code VARCHAR(50),
    unit_name VARCHAR(255),
    department VARCHAR(255),
    position VARCHAR(255),
    raw_info TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'INACTIVE'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 3B: LỊCH SỬ BIẾN ĐỘNG CÁN BỘ MASTER DB
CREATE TABLE IF NOT EXISTS employee_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id),
    employee_code VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'REACTIVATED'
    old_values TEXT,
    new_values TEXT,
    changed_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 4: KỲ THI / ĐỢT KIỂM TRA
CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'OPEN', -- 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
    start_date DATE,
    end_date DATE,
    start_at TEXT,
    end_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 5: LỊCH SỬ UPLOAD CỦA CÁC ĐƠN VỊ & PHIÊN BẢN (VERSIONING)
CREATE TABLE IF NOT EXISTS exam_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    original_file_path VARCHAR(500),
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'STAGING', -- 'STAGING' | 'VALIDATED' | 'OFFICIAL_SUBMITTED' | 'REOPENED' | 'ARCHIVED'
    uploaded_by INTEGER REFERENCES users(id),
    prepared_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    receipt_code VARCHAR(64),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 6: DỮ LIỆU DANH SÁCH THÍ SINH (BẢO TOÀN 100% CỘT EXCEL NGUYÊN BẢN TRONG raw_data)
CREATE TABLE IF NOT EXISTS exam_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL REFERENCES exam_uploads(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),
    elearning_account VARCHAR(100),
    full_name VARCHAR(255),
    raw_data TEXT, -- JSON giữ nguyên 100% tất cả các cột nghiệp vụ của đơn vị
    validation_status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING' | 'VALID' | 'INVALID'
    validation_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 7: CHI TIẾT TỪNG LỖI ĐỐI CHIẾU PHÁT HIỆN ĐƯỢC
CREATE TABLE IF NOT EXISTS validation_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL REFERENCES exam_uploads(id) ON DELETE CASCADE,
    record_id INTEGER REFERENCES exam_records(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),
    elearning_account VARCHAR(100),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'ERROR', -- 'ERROR' | 'WARNING'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 8: NHẬT KÝ KIỂM TOÁN (AUDIT LOGS)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    username VARCHAR(100),
    unit_id INTEGER REFERENCES units(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_unit_id ON audit_logs(unit_id);

-- BẢNG 8B: NHẬT KÝ MỞ LẠI BÀI NỘP (SUBMISSION REOPEN LOG)
CREATE TABLE IF NOT EXISTS submission_reopen_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL, -- 'EXAM_UPLOAD' | 'TRAINING_DEMAND'
    target_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL REFERENCES units(id),
    reopened_by INTEGER NOT NULL REFERENCES users(id),
    reopened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason TEXT NOT NULL
);

-- BẢNG 8C: ĐỀ NGHỊ BỔ SUNG CÁN BỘ CHƯA CÓ TRONG MASTER DB
CREATE TABLE IF NOT EXISTS employee_add_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    employee_code VARCHAR(50) NOT NULL,
    elearning_account VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    position VARCHAR(255),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED'
    requested_by INTEGER NOT NULL REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TEXT,
    review_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES TỐC ĐỘ CAO CHO 34.000+ CÁN BỘ VÀ TRUY VẤN ĐỐI CHIẾU 2 CHIỀU
CREATE INDEX IF NOT EXISTS idx_emp_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_emp_elearn ON employees(elearning_account);
CREATE INDEX IF NOT EXISTS idx_emp_unit ON employees(unit_code);

CREATE INDEX IF NOT EXISTS idx_uploads_unit_exam ON exam_uploads(unit_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_records_upload ON exam_records(upload_id);
CREATE INDEX IF NOT EXISTS idx_records_emp_code ON exam_records(employee_code);
CREATE INDEX IF NOT EXISTS idx_records_elearn ON exam_records(elearning_account);

CREATE INDEX IF NOT EXISTS idx_val_errors_upload ON validation_errors(upload_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- =========================================================================
-- KIẾN TRÚC MỞ RỘNG: NỀN TẢNG THU THẬP DỮ LIỆU ĐA BIỂU MẪU (162 ĐƠN VỊ)
-- HỖ TRỢ ĐỒNG THỜI MASTER_VALIDATION VÀ FORM_VALIDATION_ONLY
-- =========================================================================

-- BẢNG 9: ĐỢT THU THẬP DỮ LIỆU (COLLECTIONS)
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'OPEN', -- 'OPEN' | 'CLOSED' | 'ARCHIVED'
    start_date DATE,
    end_date DATE,
    start_at TEXT,
    end_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 9.1: GIA HẠN HẠN CHÓT RIÊNG CHO ĐƠN VỊ (DEADLINE EXTENSIONS)
CREATE TABLE IF NOT EXISTS deadline_extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL, -- 'EXAM' | 'COLLECTION'
    target_id INTEGER NOT NULL,
    new_end_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(unit_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_deadline_ext ON deadline_extensions(unit_id, target_type, target_id);

-- BẢNG 10: BIỂU MẪU THU THẬP (FORMS THUỘC COLLECTION)
CREATE TABLE IF NOT EXISTS forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    form_code VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    input_method VARCHAR(20) DEFAULT 'EXCEL', -- 'EXCEL' | 'WEB_FORM' | 'BOTH'
    validation_mode VARCHAR(30) DEFAULT 'FORM_VALIDATION_ONLY', -- 'MASTER_VALIDATION' | 'FORM_VALIDATION_ONLY'
    employee_code_field VARCHAR(100) DEFAULT 'employee_code', -- Chỉ dùng khi MASTER_VALIDATION
    elearning_field VARCHAR(100) DEFAULT 'elearning_account',  -- Chỉ dùng khi MASTER_VALIDATION
    status VARCHAR(20) DEFAULT 'ACTIVE',
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, form_code)
);

-- BẢNG 11: TRƯỜNG DỮ LIỆU CỦA BIỂU MẪU (FORM BUILDER FIELDS)
CREATE TABLE IF NOT EXISTS form_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type VARCHAR(30) NOT NULL, -- 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'DATETIME' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'RADIO' | 'CHECKBOX' | 'FILE'
    required INTEGER DEFAULT 0,
    default_value TEXT,
    options TEXT, -- JSON Array các lựa chọn cho select/radio
    validation_rules TEXT, -- JSON cấu hình rules: {"min": 0, "max": 1000, "regex": "..."}
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 12: ĐỢT NỘP DỮ LIỆU CỦA ĐƠN VỊ CHO TỪNG FORM (SUBMISSIONS)
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    input_method VARCHAR(20) DEFAULT 'EXCEL', -- 'EXCEL' | 'WEB_FORM'
    file_name VARCHAR(255),
    file_size INTEGER,
    file_hash VARCHAR(64),
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'STAGING', -- 'STAGING' | 'VALIDATED' | 'OFFICIAL_SUBMITTED'
    submitted_by INTEGER REFERENCES users(id),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 13: BẢN GHI DỮ LIỆU KÊ KHAI (SUBMISSION RECORDS)
CREATE TABLE IF NOT EXISTS submission_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    row_index INTEGER NOT NULL,
    employee_code VARCHAR(50),      -- NULL nếu form khảo sát thông thường
    elearning_account VARCHAR(100), -- NULL nếu form khảo sát thông thường
    full_name VARCHAR(255),
    data_values TEXT NOT NULL,       -- JSON lưu toàn bộ trường và giá trị kê khai
    validation_status VARCHAR(20) DEFAULT 'VALID', -- 'VALID' | 'INVALID'
    validation_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 14: LỖI KIỂM TRA BIỂU MẪU (FORM VALIDATION ERRORS)
CREATE TABLE IF NOT EXISTS form_validation_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    record_id INTEGER REFERENCES submission_records(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    field_name VARCHAR(100),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES TỐC ĐỘ CAO CHO KIẾN TRÚC FORM ĐỘNG
CREATE INDEX IF NOT EXISTS idx_forms_collection ON forms(collection_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form_unit ON submissions(form_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_submissions_collection ON submissions(collection_id);
CREATE INDEX IF NOT EXISTS idx_sub_records_sub ON submission_records(submission_id);
CREATE INDEX IF NOT EXISTS idx_form_val_errors_sub ON form_validation_errors(submission_id);

-- =========================================================================
-- MODULE KHẢO SÁT NHU CẦU ĐÀO TẠO (162 ĐƠN VỊ)
-- MÔ HÌNH: VỊ TRÍ / CHỨC DANH -> CHUYÊN ĐỀ PHÙ HỢP (N-N) -> SỐ NGƯỜI
-- =========================================================================

-- BẢNG 15: MASTER TRAINING POSITIONS (DANH MỤC VỊ TRÍ CHỨC DANH)
CREATE TABLE IF NOT EXISTS training_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    group_name VARCHAR(100),
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'INACTIVE'
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 16: MASTER TRAINING TOPICS (DANH MỤC CHUYÊN ĐỀ ĐÀO TẠO CHUẨN)
CREATE TABLE IF NOT EXISTS training_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    delivery_method VARCHAR(255),
    duration VARCHAR(100),
    learning_path VARCHAR(255),
    competency VARCHAR(255),
    prerequisite TEXT,
    certificate_requirement TEXT,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'INACTIVE'
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 17: MASTER POSITION - TOPICS (QUAN HỆ N-N GIỮA VỊ TRÍ VÀ CHUYÊN ĐỀ)
CREATE TABLE IF NOT EXISTS training_position_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL REFERENCES training_positions(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES training_topics(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position_id, topic_id)
);

-- BẢNG 18: LỊCH SỬ IMPORT CATALOG AUDIT
CREATE TABLE IF NOT EXISTS training_catalog_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    imported_by INTEGER REFERENCES users(id),
    total_rows INTEGER DEFAULT 0,
    positions_created INTEGER DEFAULT 0,
    topics_created INTEGER DEFAULT 0,
    relations_created INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 19: HỒ SƠ KHẢO SÁT NHU CẦU ĐÀO TẠO CỦA ĐƠN VỊ (DEMAND SUBMISSIONS)
CREATE TABLE IF NOT EXISTS training_demand_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id),
    form_id INTEGER REFERENCES forms(id),
    unit_id INTEGER NOT NULL REFERENCES units(id),
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'DRAFT', -- 'DRAFT' | 'SUBMITTED' | 'REOPENED'
    note TEXT,
    submitted_by INTEGER REFERENCES users(id),
    prepared_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    receipt_code VARCHAR(64),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 19B: CẤU HÌNH HỆ THỐNG TOÀN CỤC (SYSTEM SETTINGS)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 19C: BIÊN NHẬN KHI NỘP BÀI CHÍNH THỨC (SUBMISSION RECEIPTS)
CREATE TABLE IF NOT EXISTS submission_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_code VARCHAR(64) UNIQUE NOT NULL,
    target_type VARCHAR(30) NOT NULL, -- 'EXAM_UPLOAD' | 'TRAINING_DEMAND'
    target_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL REFERENCES units(id),
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    total_records INTEGER DEFAULT 0,
    metadata TEXT, -- JSON chi tiết biên nhận
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG 20: CHI TIẾT VỊ TRÍ ĐÃ KHAI BÁO CỦA ĐƠN VỊ
CREATE TABLE IF NOT EXISTS training_demand_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
    position_id INTEGER NOT NULL REFERENCES training_positions(id),
    target_headcount INTEGER NOT NULL DEFAULT 0, -- Số lượng người của nhóm vị trí tại đơn vị (>=0)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(submission_id, position_id)
);

-- BẢNG 21: CHI TIẾT SỐ NGƯỜI ĐĂNG KÝ THEO TỪNG CHUYÊN ĐỀ
CREATE TABLE IF NOT EXISTS training_demand_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_position_id INTEGER NOT NULL REFERENCES training_demand_positions(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES training_topics(id),
    participant_count INTEGER NOT NULL DEFAULT 0, -- Số người có nhu cầu học (>= 0)
    topic_name_snapshot VARCHAR(255),
    duration_snapshot VARCHAR(100),
    delivery_method_snapshot VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES TỐC ĐỘ CAO CHO MODULE KHẢO SÁT
CREATE INDEX IF NOT EXISTS idx_pos_code ON training_positions(code);
CREATE INDEX IF NOT EXISTS idx_topic_name ON training_topics(name);
CREATE INDEX IF NOT EXISTS idx_pos_top_pos ON training_position_topics(position_id);
CREATE INDEX IF NOT EXISTS idx_pos_top_top ON training_position_topics(topic_id);

-- BẢNG 22: THÔNG BÁO NỘI BỘ TRONG ỨNG DỤNG (IN-APP NOTIFICATIONS)
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id INTEGER REFERENCES users(id),
    recipient_unit_id INTEGER REFERENCES units(id),
    recipient_role VARCHAR(50), -- 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'DEADLINE_WARNING' | 'SUBMISSION_REOPENED' | 'REQUEST_STATUS_UPDATED' | 'NEW_EMPLOYEE_REQUEST' | 'SYSTEM'
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unit ON notifications(recipient_unit_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_demand_sub_unit_coll ON training_demand_submissions(collection_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_demand_pos_sub ON training_demand_positions(submission_id);
CREATE INDEX IF NOT EXISTS idx_demand_top_pos ON training_demand_topics(demand_position_id);
CREATE INDEX IF NOT EXISTS idx_demand_top_top ON training_demand_topics(topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_top_pos_unique ON training_demand_topics(demand_position_id, topic_id);

-- BẢNG 23: ĐỀ XUẤT NHU CẦU ĐÀO TẠO NGOÀI KHUNG (MỤC 2.8)
CREATE TABLE IF NOT EXISTS training_demand_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES training_demand_submissions(id) ON DELETE CASCADE,
    proposal_name VARCHAR(255) NOT NULL,
    target_audience VARCHAR(255),
    participant_count INTEGER NOT NULL DEFAULT 1,
    expected_duration VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proposals_sub ON training_demand_proposals(submission_id);


