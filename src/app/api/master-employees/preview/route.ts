import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền truy cập.' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'UPSERT'; // 'UPSERT' hoặc 'FULL_SYNC'

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
        error: `Không tìm thấy cột bắt buộc trong file. Cần có cột Mã cán bộ và Tên đăng nhập/eLearning. (Tìm thấy: ${Object.keys(firstRow).join(', ')})` 
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

    // Đọc toàn bộ DB hiện tại
    const db = getDatabase();
    const existingEmployees = db.prepare('SELECT id, employee_code, elearning_account, full_name, unit_code, unit_name, status FROM employees').all() as any[];
    const dbMap = new Map<string, any>();
    existingEmployees.forEach(emp => {
      dbMap.set(emp.employee_code, emp);
    });

    const toCreate: any[] = [];
    const toUpdate: any[] = [];
    const toReactivate: any[] = [];
    const unchanged: any[] = [];
    const toDeactivate: any[] = [];

    // Duyệt qua các bản ghi trong file
    for (const [code, item] of fileMap.entries()) {
      const existing = dbMap.get(code);
      if (!existing) {
        toCreate.push({
          code: item.code,
          elearn: item.elearn,
          name: item.name,
          unit: item.unit,
          action: 'CREATED',
          reason: 'Cán bộ mới chưa có trong hệ thống'
        });
      } else {
        const isInactive = existing.status === 'INACTIVE';
        const hasInfoChange = (
          existing.elearning_account.toLowerCase() !== item.elearn ||
          (item.name && existing.full_name !== item.name) ||
          (item.unit && existing.unit_code !== item.unit)
        );

        if (isInactive) {
          toReactivate.push({
            id: existing.id,
            code: item.code,
            elearn: item.elearn,
            name: item.name || existing.full_name,
            unit: item.unit || existing.unit_code,
            oldValues: {
              status: existing.status,
              elearn: existing.elearning_account,
              name: existing.full_name,
              unit: existing.unit_code
            },
            action: 'REACTIVATED',
            reason: 'Cán bộ đang nghỉ/chuyển được kích hoạt lại'
          });
        } else if (hasInfoChange) {
          toUpdate.push({
            id: existing.id,
            code: item.code,
            elearn: item.elearn,
            name: item.name || existing.full_name,
            unit: item.unit || existing.unit_code,
            oldValues: {
              elearn: existing.elearning_account,
              name: existing.full_name,
              unit: existing.unit_code
            },
            action: 'UPDATED',
            reason: 'Thay đổi thông tin (eLearning, họ tên hoặc đơn vị)'
          });
        } else {
          unchanged.push({ code: item.code });
        }
      }
    }

    // Nếu là FULL_SYNC: kiểm tra các cán bộ trong DB đang ACTIVE nhưng vắng mặt trong file
    if (mode === 'FULL_SYNC') {
      for (const [code, existing] of dbMap.entries()) {
        if (existing.status === 'ACTIVE' && !fileMap.has(code)) {
          toDeactivate.push({
            id: existing.id,
            code: existing.employee_code,
            elearn: existing.elearning_account,
            name: existing.full_name,
            unit: existing.unit_code || existing.unit_name,
            action: 'DEACTIVATED',
            reason: 'Vắng mặt trong file đồng bộ mới nhất'
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      summary: {
        totalFileRows: fileMap.size,
        createCount: toCreate.length,
        updateCount: toUpdate.length,
        reactivateCount: toReactivate.length,
        deactivateCount: toDeactivate.length,
        unchangedCount: unchanged.length
      },
      previewSamples: {
        toCreate: toCreate.slice(0, 50),
        toUpdate: toUpdate.slice(0, 50),
        toReactivate: toReactivate.slice(0, 50),
        toDeactivate: toDeactivate.slice(0, 50)
      }
    });

  } catch (error: any) {
    console.error('Preview error:', error);
    return NextResponse.json({ error: 'Lỗi phân tích file xem trước: ' + error.message }, { status: 500 });
  }
}
