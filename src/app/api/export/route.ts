import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import * as xlsx from 'xlsx';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // 'errors' | 'unit' | 'all'
  const uploadId = searchParams.get('uploadId');
  const examId = searchParams.get('examId');
  const unitIdParam = searchParams.get('unitId');

  const db = getDatabase();

  try {
    // 1. XUẤT DANH SÁCH LỖI (EXPORT ERRORS)
    if (type === 'errors') {
      if (!uploadId) return NextResponse.json({ error: 'Thiếu uploadId.' }, { status: 400 });

      const upload = db.prepare(`
        SELECT u.*, un.unit_code, un.unit_name, ex.title as exam_title
        FROM exam_uploads u
        JOIN units un ON u.unit_id = un.id
        JOIN exams ex ON u.exam_id = ex.id
        WHERE u.id = ?
      `).get(uploadId) as any;

      if (!upload) return NextResponse.json({ error: 'Không tìm thấy upload.' }, { status: 404 });
      if (session.role === 'UNIT_ADMIN' && upload.unit_id !== session.unitId) {
        return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
      }

      const errors = db.prepare(`
        SELECT row_index as 'Dòng Excel',
               employee_code as 'Mã cán bộ',
               elearning_account as 'Tài khoản eLearning',
               error_type as 'Loại lỗi',
               error_message as 'Chi tiết lỗi',
               created_at as 'Thời gian kiểm tra'
        FROM validation_errors
        WHERE upload_id = ?
        ORDER BY row_index ASC
      `).all(uploadId);

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(errors);
      xlsx.utils.book_append_sheet(wb, ws, 'Danh_Sach_Loi');

      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeUnit = (upload.unit_name || 'Don_vi').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, '_');
      const filename = `Danh_sach_loi_${safeUnit}_v${upload.version}.xlsx`;

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: upload.unit_id,
        action: 'EXPORT_ERRORS',
        details: { uploadId, count: errors.length }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // 2. XUẤT KẾT QUẢ THEO ĐƠN VỊ (BẢO TOÀN 100% CỘT GỐC + CỘT TRẠNG THÁI HỆ THỐNG)
    if (type === 'unit') {
      if (!uploadId) return NextResponse.json({ error: 'Thiếu uploadId.' }, { status: 400 });

      const upload = db.prepare(`
        SELECT u.*, un.unit_code, un.unit_name, ex.title as exam_title
        FROM exam_uploads u
        JOIN units un ON u.unit_id = un.id
        JOIN exams ex ON u.exam_id = ex.id
        WHERE u.id = ?
      `).get(uploadId) as any;

      if (!upload) return NextResponse.json({ error: 'Không tìm thấy upload.' }, { status: 404 });
      if (session.role === 'UNIT_ADMIN' && upload.unit_id !== session.unitId) {
        return NextResponse.json({ error: 'Không có quyền truy cập.' }, { status: 403 });
      }

      const records = db.prepare(`
        SELECT row_index, raw_data, validation_status, validation_message, created_at
        FROM exam_records
        WHERE upload_id = ?
        ORDER BY row_index ASC
      `).all(uploadId) as any[];

      const exportRows = records.map(r => {
        const raw = r.raw_data ? JSON.parse(r.raw_data) : {};
        // Giữ nguyên 100% các cột Excel ban đầu của đơn vị
        // Thêm các cột hệ thống vào cuối bảng
        return {
          ...raw,
          'Validation Status': r.validation_status === 'VALID' ? 'HỢP LỆ' : 'LỖI',
          'Validation Message': r.validation_message || '',
          'Checked At': r.created_at
        };
      });

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Ket_Qua_Thi_Sinh');

      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeUnit = (upload.unit_name || 'Don_vi').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, '_');
      const filename = `Ket_qua_${safeUnit}_v${upload.version}.xlsx`;

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: upload.unit_id,
        action: 'EXPORT_UNIT_RECORDS',
        details: { uploadId, count: records.length }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // 3. XUẤT TỔNG HỢP TOÀN BỘ ĐƠN VỊ TOÀN HỆ THỐNG (SUPER ADMIN ONLY)
    if (type === 'all') {
      if (session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền xuất tổng hợp toàn hệ thống.' }, { status: 403 });
      }
      if (!examId) return NextResponse.json({ error: 'Thiếu examId.' }, { status: 400 });

      const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
      if (!exam) return NextResponse.json({ error: 'Không tìm thấy kỳ thi.' }, { status: 404 });

      // Lấy bản ghi của các upload chính thức mới nhất (hoặc upload mới nhất đã validate hợp lệ)
      const officialUploads = db.prepare(`
        SELECT u.id, u.unit_id, un.unit_code, un.unit_name, u.version
        FROM exam_uploads u
        JOIN units un ON u.unit_id = un.id
        WHERE u.exam_id = ? AND (u.status = 'OFFICIAL_SUBMITTED' OR (u.status = 'VALIDATED' AND u.error_rows = 0))
          AND u.id IN (
            SELECT MAX(id) FROM exam_uploads WHERE exam_id = ? GROUP BY unit_id
          )
        ORDER BY un.unit_code ASC
      `).all(examId, examId) as any[];

      const allValidRecords: any[] = [];

      for (const up of officialUploads) {
        const records = db.prepare(`
          SELECT row_index, raw_data, validation_status, created_at
          FROM exam_records
          WHERE upload_id = ? AND validation_status = 'VALID'
          ORDER BY row_index ASC
        `).all(up.id) as any[];

        for (const r of records) {
          const raw = r.raw_data ? JSON.parse(r.raw_data) : {};
          allValidRecords.push({
            'Mã Đơn Vị Hệ Thống': up.unit_code,
            'Tên Đơn Vị Hệ Thống': up.unit_name,
            'Phiên Bản File': `v${up.version}`,
            ...raw,
            'Trạng Thái Xác Thực': 'HỢP LỆ',
            'Thời Gian Đối Chiếu': r.created_at
          });
        }
      }

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(allValidRecords);
      xlsx.utils.book_append_sheet(wb, ws, 'Tong_Hop_Toan_Bo_Don_Vi');

      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `Tong_hop_toan_bo_don_vi_${exam.code}_${Date.now()}.xlsx`;

      logAudit({
        userId: session.id,
        username: session.username,
        action: 'EXPORT_CONSOLIDATED_ALL',
        details: { examId, totalUnits: officialUploads.length, totalRecords: allValidRecords.length }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // 4. XUẤT FILE MẪU CHUẨN ĐỂ CÁC ĐƠN VỊ NHẬP LIỆU (EXPORT TEMPLATE)
    if (type === 'template') {
      let targetUnitId = session.unitId;
      if (session.role === 'SUPER_ADMIN' && unitIdParam) {
        targetUnitId = parseInt(unitIdParam);
      }

      let unitCode = '';
      let unitName = '';
      if (targetUnitId) {
        const u = db.prepare('SELECT unit_code, unit_name FROM units WHERE id = ?').get(targetUnitId) as any;
        if (u) {
          unitCode = u.unit_code;
          unitName = u.unit_name;
        }
      }

      const { generateTemplateWorkbook } = await import('@/lib/excel');
      const wb = generateTemplateWorkbook(unitCode, unitName);
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = unitCode 
        ? `Mau_Dang_Ky_Thi_Sinh_${unitCode}_${(unitName || '').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, '_')}.xlsx`
        : 'Mau_Dang_Ky_Thi_Sinh_Chuan.xlsx';

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: targetUnitId || null,
        action: 'DOWNLOAD_TEMPLATE',
        details: { unitCode, unitName }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // 5. XUẤT FILE MẪU DATABASE CÁN BỘ TRUNG TÂM (EXPORT MASTER TEMPLATE)
    if (type === 'master-template') {
      const { generateMasterTemplateWorkbook } = await import('@/lib/excel');
      const wb = generateMasterTemplateWorkbook();
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = 'Mau_Database_Can_Bo_Trung_Tam_34000_Nguoi.xlsx';

      logAudit({
        userId: session.id,
        username: session.username,
        unitId: session.unitId || null,
        action: 'DOWNLOAD_MASTER_TEMPLATE',
        details: { filename }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    // 6. XUẤT NHẬT KÝ KIỂM TOÁN (EXPORT AUDIT LOGS)
    if (type === 'audit-logs') {
      if (session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền xuất Nhật ký kiểm toán.' }, { status: 403 });
      }

      const q = searchParams.get('q') || '';
      const actionFilter = searchParams.get('action') || 'ALL';
      const entityTypeFilter = searchParams.get('entity_type') || 'ALL';
      const fromDate = searchParams.get('from_date') || '';
      const toDate = searchParams.get('to_date') || '';

      let whereClauses: string[] = ['1=1'];
      const params: any[] = [];

      if (q.trim()) {
        const term = `%${q.trim()}%`;
        whereClauses.push('(l.username LIKE ? OR l.action LIKE ? OR l.details LIKE ? OR l.entity_id LIKE ? OR u.unit_code LIKE ? OR u.unit_name LIKE ?)');
        params.push(term, term, term, term, term, term);
      }

      if (actionFilter !== 'ALL') {
        whereClauses.push('l.action = ?');
        params.push(actionFilter);
      }

      if (entityTypeFilter !== 'ALL') {
        whereClauses.push('l.entity_type = ?');
        params.push(entityTypeFilter);
      }

      if (fromDate.trim()) {
        whereClauses.push("date(l.created_at) >= date(?)");
        params.push(fromDate.trim());
      }

      if (toDate.trim()) {
        whereClauses.push("date(l.created_at) <= date(?)");
        params.push(toDate.trim());
      }

      const whereStr = whereClauses.join(' AND ');
      const logs = db.prepare(`
        SELECT l.*, u.unit_code, u.unit_name
        FROM audit_logs l
        LEFT JOIN units u ON l.unit_id = u.id
        WHERE ${whereStr}
        ORDER BY l.id DESC
        LIMIT 5000
      `).all(...params) as any[];

      const exportRows = logs.map((log, idx) => ({
        'STT': idx + 1,
        'Thời gian ghi nhận': log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '',
        'Người thực hiện': log.username || 'SYSTEM',
        'Mã đơn vị': log.unit_code || '',
        'Tên đơn vị': log.unit_name || '',
        'Địa chỉ IP': log.ip_address || '',
        'Hành động': log.action || '',
        'Loại đối tượng': log.entity_type || '',
        'Mã đối tượng': log.entity_id || '',
        'Chi tiết nhật ký': log.details || ''
      }));

      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(exportRows);
      xlsx.utils.book_append_sheet(wb, ws, 'Nhat_Ky_Kiem_Toan');

      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `Nhat_ky_kiem_toan_${new Date().toISOString().slice(0, 10)}.xlsx`;

      logAudit({
        userId: session.id,
        username: session.username,
        action: 'EXPORT_REPORT',
        entityType: 'AUDIT_LOG',
        details: { count: logs.length, filename }
      });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      });
    }

    return NextResponse.json({ error: 'Loại export không hợp lệ.' }, { status: 400 });

  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Lỗi xuất file Excel: ' + error.message }, { status: 500 });
  }
}
