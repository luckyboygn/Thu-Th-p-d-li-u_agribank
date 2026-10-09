import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// GET: Lấy danh sách đơn vị (hỗ trợ tìm kiếm, lọc trạng thái, phân loại, vùng miền)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'ALL';
  const region = searchParams.get('region') || 'ALL';
  const unitType = searchParams.get('unitType') || 'ALL';

  const db = getDatabase();

  if (session.role === 'SUPER_ADMIN' || session.role === 'VIEWER') {
    let query = `
      SELECT u.id, u.unit_code, u.unit_name, u.status, u.unit_type, u.region, u.parent_unit_id, u.created_at,
             p.unit_name as parent_unit_name, p.unit_code as parent_unit_code,
             (SELECT COUNT(*) FROM exam_uploads WHERE unit_id = u.id) as upload_count,
             (SELECT COUNT(*) FROM training_demand_submissions WHERE unit_id = u.id) as demand_count,
             (SELECT COUNT(*) FROM users WHERE unit_id = u.id) as user_count
      FROM units u
      LEFT JOIN units p ON u.parent_unit_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (q.trim()) {
      query += ` AND (LOWER(u.unit_code) LIKE ? OR LOWER(u.unit_name) LIKE ?)`;
      const term = `%${q.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    if (status !== 'ALL') {
      query += ` AND u.status = ?`;
      params.push(status);
    }

    if (region !== 'ALL') {
      query += ` AND u.region = ?`;
      params.push(region);
    }

    if (unitType !== 'ALL') {
      query += ` AND u.unit_type = ?`;
      params.push(unitType);
    }

    query += ` ORDER BY CAST(u.unit_code AS INTEGER) ASC, u.unit_code ASC`;

    const units = db.prepare(query).all(...params);

    // Tính thống kê theo vùng và loại cho màn hình quản trị
    const regionStats = db.prepare(`
      SELECT region, COUNT(*) as count
      FROM units
      WHERE status = 'ACTIVE'
      GROUP BY region
    `).all();

    const typeStats = db.prepare(`
      SELECT unit_type, COUNT(*) as count
      FROM units
      WHERE status = 'ACTIVE'
      GROUP BY unit_type
    `).all();

    return NextResponse.json({ units, regionStats, typeStats });
  } else {
    // Unit Admin chỉ được lấy thông tin đơn vị mình
    const unit = db.prepare(`
      SELECT u.id, u.unit_code, u.unit_name, u.status, u.unit_type, u.region, u.parent_unit_id, u.created_at,
             p.unit_name as parent_unit_name, p.unit_code as parent_unit_code
      FROM units u
      LEFT JOIN units p ON u.parent_unit_id = p.id
      WHERE u.id = ?
    `).get(session.unitId) as any;
    return NextResponse.json({ units: unit ? [unit] : [] });
  }
}

// POST: Super Admin tạo mới đơn vị
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền tạo đơn vị.' }, { status: 403 });
  }

  try {
    const { unitCode, unitName, status, unitType, region, parentUnitId } = await req.json();
    if (!unitCode || !unitName) {
      return NextResponse.json({ error: 'Mã đơn vị và Tên đơn vị là bắt buộc.' }, { status: 400 });
    }

    const trimmedCode = unitCode.trim();
    const trimmedName = unitName.trim();
    const unitStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const typeVal = unitType || 'BRANCH_L1';
    const regionVal = region || 'MIEN_BAC';
    const parentIdVal = parentUnitId ? parseInt(parentUnitId) : null;

    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM units WHERE LOWER(unit_code) = LOWER(?)').get(trimmedCode);
    if (existing) {
      return NextResponse.json({ error: `Mã đơn vị "${trimmedCode}" đã tồn tại trong hệ thống.` }, { status: 400 });
    }

    const res = db.prepare(`
      INSERT INTO units (unit_code, unit_name, status, unit_type, region, parent_unit_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(trimmedCode, trimmedName, unitStatus, typeVal, regionVal, parentIdVal);

    logAudit({
      userId: session.id,
      username: session.username,
      action: 'CREATE_UNIT',
      details: {
        unitId: res.lastInsertRowid,
        unitCode: trimmedCode,
        unitName: trimmedName,
        status: unitStatus,
        unitType: typeVal,
        region: regionVal,
        parentUnitId: parentIdVal
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      unitId: res.lastInsertRowid,
      message: `Đã thêm đơn vị "${trimmedName}" thành công!`
    });
  } catch (error: any) {
    console.error('Lỗi tạo đơn vị:', error);
    return NextResponse.json({ error: 'Lỗi khi tạo đơn vị: ' + error.message }, { status: 500 });
  }
}

// PUT: Super Admin sửa thông tin hoặc vô hiệu hóa đơn vị (Không cho phép xóa nếu có dữ liệu)
export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền cập nhật đơn vị.' }, { status: 403 });
  }

  try {
    const { id, unitCode, unitName, status, unitType, region, parentUnitId } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID đơn vị.' }, { status: 400 });
    }

    const db = getDatabase();
    const oldUnit = db.prepare('SELECT * FROM units WHERE id = ?').get(id) as any;
    if (!oldUnit) {
      return NextResponse.json({ error: 'Không tìm thấy đơn vị trong hệ thống.' }, { status: 404 });
    }

    // Nếu đổi unitCode, kiểm tra trùng
    if (unitCode && unitCode.trim().toLowerCase() !== oldUnit.unit_code.toLowerCase()) {
      const dup = db.prepare('SELECT id FROM units WHERE LOWER(unit_code) = LOWER(?) AND id != ?').get(unitCode.trim(), id);
      if (dup) {
        return NextResponse.json({ error: `Mã đơn vị "${unitCode.trim()}" đã được dùng bởi đơn vị khác.` }, { status: 400 });
      }
    }

    const typeVal = unitType !== undefined ? unitType : oldUnit.unit_type;
    const regVal = region !== undefined ? region : oldUnit.region;
    const parentVal = parentUnitId !== undefined ? (parentUnitId ? parseInt(parentUnitId) : null) : oldUnit.parent_unit_id;

    // Chặn đơn vị chọn chính mình làm đơn vị cấp trên
    if (parentVal && parentVal === id) {
      return NextResponse.json({ error: 'Đơn vị không thể chọn chính mình làm đơn vị cấp trên.' }, { status: 400 });
    }

    db.prepare(`
      UPDATE units
      SET unit_code = COALESCE(?, unit_code),
          unit_name = COALESCE(?, unit_name),
          status = COALESCE(?, status),
          unit_type = ?,
          region = ?,
          parent_unit_id = ?
      WHERE id = ?
    `).run(
      unitCode ? unitCode.trim() : null,
      unitName ? unitName.trim() : null,
      status || null,
      typeVal,
      regVal,
      parentVal,
      id
    );

    logAudit({
      userId: session.id,
      username: session.username,
      unitId: id,
      action: 'UPDATE_UNIT_HIERARCHY',
      details: {
        unitId: id,
        oldCode: oldUnit.unit_code,
        newCode: unitCode || oldUnit.unit_code,
        oldName: oldUnit.unit_name,
        newName: unitName || oldUnit.unit_name,
        oldStatus: oldUnit.status,
        newStatus: status || oldUnit.status,
        oldRegion: oldUnit.region,
        newRegion: regVal,
        oldType: oldUnit.unit_type,
        newType: typeVal,
        oldParentId: oldUnit.parent_unit_id,
        newParentId: parentVal
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('host')
    });

    return NextResponse.json({
      success: true,
      message: 'Cập nhật phân cấp đơn vị thành công!'
    });
  } catch (error: any) {
    console.error('Lỗi cập nhật đơn vị:', error);
    return NextResponse.json({ error: 'Lỗi khi cập nhật đơn vị: ' + error.message }, { status: 500 });
  }
}

// DELETE: Tuyệt đối không cho xóa đơn vị đã có dữ liệu ràng buộc, chỉ cho vô hiệu hóa
export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Chỉ Quản trị viên Trung tâm mới có quyền thao tác.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get('id') ? parseInt(searchParams.get('id')!) : null;
    if (!unitId) {
      return NextResponse.json({ error: 'Thiếu ID đơn vị.' }, { status: 400 });
    }

    const db = getDatabase();
    // Kiểm tra dữ liệu liên quan
    const uploadCount = (db.prepare('SELECT COUNT(*) as c FROM exam_uploads WHERE unit_id = ?').get(unitId) as any).c;
    const demandCount = (db.prepare('SELECT COUNT(*) as c FROM training_demand_submissions WHERE unit_id = ?').get(unitId) as any).c;
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE unit_id = ?').get(unitId) as any).c;

    if (uploadCount > 0 || demandCount > 0 || userCount > 0) {
      return NextResponse.json({
        error: `Đơn vị này đã có dữ liệu kê khai (${uploadCount} lần nộp file, ${demandCount} hồ sơ khảo sát, ${userCount} tài khoản). Hệ thống không cho phép xóa vĩnh viễn, vui lòng chuyển trạng thái sang Vô hiệu hóa (INACTIVE).`
      }, { status: 422 });
    }

    db.prepare('DELETE FROM units WHERE id = ?').run(unitId);
    return NextResponse.json({ success: true, message: 'Đã xóa đơn vị thành công vì chưa phát sinh dữ liệu.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Lỗi: ' + error.message }, { status: 500 });
  }
}
