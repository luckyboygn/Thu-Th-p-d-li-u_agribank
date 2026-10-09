import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền cập nhật CSDL.' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'UPSERT'; // 'UPSERT' | 'FULL_SYNC'

    if (!file) {
      return NextResponse.json({ error: 'Vui lòng chọn file Excel.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[] = xlsx.utils.sheet_to_json(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File Excel không có dữ liệu.' }, { status: 400 });
    }

    // Nhận diện cột
    const firstRow = rows[0];
    const codeKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('mã cán bộ') || k.toLowerCase().includes('mã cb') || k.toLowerCase() === 'macb');
    const elearnKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('tên đăng nhập') || k.toLowerCase().includes('e-learning') || k.toLowerCase().includes('elearning'));
    const nameKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('họ') || k.toLowerCase().includes('tên'));
    const unitKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('đơn vị') || k.toLowerCase().includes('chi nhánh'));

    if (!codeKey || !elearnKey) {
      return NextResponse.json({ 
        error: `Không tìm thấy cột bắt buộc trong file. Cần có cột Mã cán bộ và Tên đăng nhập/eLearning.` 
      }, { status: 400 });
    }

    // Kiểm tra tính toàn vẹn 1-1 trong file
    const seenCodes = new Map<string, string>();
    const seenElearns = new Map<string, string>();
    const qualityErrors: string[] = [];

    const fileMap = new Map<string, { code: string; elearn: string; name: string; unit: string; raw: any }>();

    rows.forEach((r, idx) => {
      const code = String(r[codeKey] || '').trim();
      const elearn = String(r[elearnKey] || '').trim().toLowerCase();
      const name = nameKey ? String(r[nameKey] || '').trim() : '';
      const unit = unitKey ? String(r[unitKey] || '').trim() : '';

      if (!code || !elearn) return;

      if (seenCodes.has(code) && seenCodes.get(code) !== elearn) {
        qualityErrors.push(`Dòng ${idx + 2}: Mã cán bộ ${code} được gán cho nhiều tài khoản eLearning khác nhau (${seenCodes.get(code)} và ${elearn}).`);
      }
      if (seenElearns.has(elearn) && seenElearns.get(elearn) !== code) {
        qualityErrors.push(`Dòng ${idx + 2}: Tài khoản eLearning ${elearn} được gán cho nhiều Mã cán bộ khác nhau (${seenElearns.get(elearn)} và ${code}).`);
      }

      seenCodes.set(code, elearn);
      seenElearns.set(elearn, code);
      fileMap.set(code, { code, elearn, name, unit, raw: r });
    });

    if (qualityErrors.length > 0) {
      return NextResponse.json({
        error: 'File vi phạm nguyên tắc quan hệ 1-1 giữa Mã cán bộ và Tài khoản eLearning!',
        qualityErrors: qualityErrors.slice(0, 20),
        totalErrors: qualityErrors.length
      }, { status: 422 });
    }

    const db = getDatabase();

    // Chuẩn bị statement
    const existingEmployees = db.prepare('SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status FROM employees').all() as any[];
    const dbMap = new Map<string, any>();
    existingEmployees.forEach(emp => {
      dbMap.set(emp.employee_code, emp);
    });

    const insertEmployee = db.prepare(`
      INSERT INTO employees (employee_code, elearning_account, full_name, unit_code, status, raw_info)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?)
    `);

    const updateEmployee = db.prepare(`
      UPDATE employees
      SET elearning_account = ?, full_name = ?, unit_code = ?, status = 'ACTIVE', raw_info = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const deactivateEmployee = db.prepare(`
      UPDATE employees
      SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertHistory = db.prepare(`
      INSERT INTO employee_history (employee_id, employee_code, action_type, old_values, new_values, changed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let createdCount = 0;
    let updatedCount = 0;
    let reactivatedCount = 0;
    let deactivatedCount = 0;
    let unchangedCount = 0;

    db.exec('BEGIN TRANSACTION;');

    try {
      // 1. Xử lý các dòng trong file
      for (const [code, item] of fileMap.entries()) {
        const existing = dbMap.get(code);

        if (!existing) {
          // INSERT mới
          const infoJson = JSON.stringify(item.raw);
          const result = insertEmployee.run(item.code, item.elearn, item.name, item.unit, infoJson);
          const newId = Number(result.lastInsertRowid);

          insertHistory.run(
            newId,
            item.code,
            'CREATED',
            null,
            JSON.stringify({ elearn: item.elearn, name: item.name, unit: item.unit, status: 'ACTIVE' }),
            session.id
          );
          createdCount++;
        } else {
          const isInactive = existing.status === 'INACTIVE';
          const hasInfoChange = (
            existing.elearning_account.toLowerCase() !== item.elearn ||
            (item.name && existing.full_name !== item.name) ||
            (item.unit && existing.unit_code !== item.unit)
          );

          if (isInactive) {
            // REACTIVATED
            updateEmployee.run(
              item.elearn,
              item.name || existing.full_name,
              item.unit || existing.unit_code,
              JSON.stringify(item.raw),
              existing.id
            );

            insertHistory.run(
              existing.id,
              existing.employee_code,
              'REACTIVATED',
              JSON.stringify({ status: existing.status, elearn: existing.elearning_account, name: existing.full_name, unit: existing.unit_code }),
              JSON.stringify({ status: 'ACTIVE', elearn: item.elearn, name: item.name || existing.full_name, unit: item.unit || existing.unit_code }),
              session.id
            );
            reactivatedCount++;
          } else if (hasInfoChange) {
            // UPDATED
            updateEmployee.run(
              item.elearn,
              item.name || existing.full_name,
              item.unit || existing.unit_code,
              JSON.stringify(item.raw),
              existing.id
            );

            insertHistory.run(
              existing.id,
              existing.employee_code,
              'UPDATED',
              JSON.stringify({ elearn: existing.elearning_account, name: existing.full_name, unit: existing.unit_code }),
              JSON.stringify({ elearn: item.elearn, name: item.name || existing.full_name, unit: item.unit || existing.unit_code }),
              session.id
            );
            updatedCount++;
          } else {
            unchangedCount++;
          }
        }
      }

      // 2. Nếu là FULL_SYNC: deactivate cán bộ không có trong file
      if (mode === 'FULL_SYNC') {
        for (const [code, existing] of dbMap.entries()) {
          if (existing.status === 'ACTIVE' && !fileMap.has(code)) {
            deactivateEmployee.run(existing.id);

            insertHistory.run(
              existing.id,
              existing.employee_code,
              'DEACTIVATED',
              JSON.stringify({ status: 'ACTIVE', elearn: existing.elearning_account, name: existing.full_name, unit: existing.unit_code }),
              JSON.stringify({ status: 'INACTIVE', reason: 'Vắng mặt trong file đồng bộ mới nhất' }),
              session.id
            );
            deactivatedCount++;
          }
        }
      }

      db.exec('COMMIT;');
    } catch (err: any) {
      db.exec('ROLLBACK;');
      console.error('Error applying master db:', err);
      return NextResponse.json({ error: 'Lỗi cập nhật CSDL: ' + err.message }, { status: 500 });
    }

    // Ghi audit log
    logAudit({
      userId: session.id,
      username: session.username,
      action: 'SYNC_MASTER_DB',
      entityType: 'MASTER_EMPLOYEES',
      details: {
        mode,
        fileName: file.name,
        createdCount,
        updatedCount,
        reactivatedCount,
        deactivatedCount,
        unchangedCount,
        totalFileRows: fileMap.size
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật CSDL trung tâm thành công (${mode === 'FULL_SYNC' ? 'Đồng bộ toàn bộ' : 'Cập nhật / Bổ sung'})!`,
      summary: {
        mode,
        createdCount,
        updatedCount,
        reactivatedCount,
        deactivatedCount,
        unchangedCount,
        totalFileRows: fileMap.size
      }
    });

  } catch (error: any) {
    console.error('Apply master error:', error);
    return NextResponse.json({ error: 'Lỗi xử lý file: ' + error.message }, { status: 500 });
  }
}
