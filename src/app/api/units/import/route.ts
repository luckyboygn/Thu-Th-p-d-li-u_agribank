import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền nhập phân cấp đơn vị.' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Vui lòng chọn file Excel để tải lên.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File Excel không có dữ liệu dòng nào.' }, { status: 400 });
    }

    const db = getDatabase();

    // Map chuẩn hóa tên vùng miền
    const normalizeRegion = (val: string): string => {
      const s = (val || '').trim().toLowerCase();
      if (s.includes('trung') || s.includes('mien_trung')) return 'MIEN_TRUNG';
      if (s.includes('tây nguyên') || s.includes('tay_nguyen')) return 'TAY_NGUYEN';
      if (s.includes('nam') || s.includes('mien_nam')) return 'MIEN_NAM';
      if (s.includes('trụ sở') || s.includes('hội sở') || s.includes('ho')) return 'HO';
      return 'MIEN_BAC';
    };

    // Map chuẩn hóa phân loại đơn vị
    const normalizeType = (val: string): string => {
      const s = (val || '').trim().toLowerCase();
      if (s.includes('trụ sở') || s.includes('hội sở') || s === 'ho') return 'HO';
      if (s.includes('loại 2') || s.includes('loại ii') || s.includes('branch_l2')) return 'BRANCH_L2';
      if (s.includes('công ty con') || s.includes('sự nghiệp') || s.includes('subsidiary')) return 'SUBSIDIARY';
      return 'BRANCH_L1';
    };

    let updatedCount = 0;
    let notFoundCount = 0;
    const errors: string[] = [];

    db.exec('BEGIN TRANSACTION;');
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Tìm cột mã đơn vị
        const unitCode = String(row['Mã đơn vị'] || row['Mã ĐV'] || row['unit_code'] || row['Mã'] || '').trim();
        if (!unitCode) continue;

        const regionRaw = String(row['Vùng miền'] || row['Vùng'] || row['Khu vực'] || row['region'] || '');
        const typeRaw = String(row['Phân loại'] || row['Loại đơn vị'] || row['Cấp đơn vị'] || row['unit_type'] || '');
        const parentCodeRaw = String(row['Mã đơn vị cấp trên'] || row['Đơn vị cha'] || row['parent_unit_code'] || '').trim();

        const region = normalizeRegion(regionRaw);
        const unitType = normalizeType(typeRaw);

        // Tìm đơn vị trong DB
        const unit = db.prepare('SELECT id FROM units WHERE LOWER(unit_code) = LOWER(?)').get(unitCode) as any;
        if (!unit) {
          notFoundCount++;
          continue;
        }

        let parentId: number | null = null;
        if (parentCodeRaw && parentCodeRaw !== unitCode) {
          const parentUnit = db.prepare('SELECT id FROM units WHERE LOWER(unit_code) = LOWER(?)').get(parentCodeRaw) as any;
          if (parentUnit) parentId = parentUnit.id;
        }

        db.prepare(`
          UPDATE units
          SET region = ?, unit_type = ?, parent_unit_id = COALESCE(?, parent_unit_id)
          WHERE id = ?
        `).run(region, unitType, parentId, unit.id);

        updatedCount++;
      }

      db.exec('COMMIT;');
    } catch (e: any) {
      db.exec('ROLLBACK;');
      throw e;
    }

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'IMPORT_UNIT_HIERARCHY',
      details: {
        fileName: file.name,
        totalRows: rows.length,
        updatedUnits: updatedCount,
        notFoundUnits: notFoundCount
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật phân cấp & vùng miền thành công cho ${updatedCount} đơn vị! (${notFoundCount} mã không tìm thấy trong DB)`,
      updatedCount,
      notFoundCount
    });
  } catch (error: any) {
    console.error('Lỗi nhập Excel phân cấp đơn vị:', error);
    return NextResponse.json({ error: 'Lỗi xử lý file Excel: ' + error.message }, { status: 500 });
  }
}
