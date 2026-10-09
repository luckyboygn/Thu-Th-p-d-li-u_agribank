import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getReceiptByCode, getReceiptByTarget, ReceiptInfo } from '@/lib/receipt';

// GET: Lấy thông tin chi tiết biên nhận theo receiptCode hoặc theo (targetType & targetId)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type') as 'EXAM_UPLOAD' | 'TRAINING_DEMAND' | null;
  const id = searchParams.get('id') ? parseInt(searchParams.get('id')!) : null;

  if (!code && (!type || !id)) {
    return NextResponse.json({ error: 'Thiếu mã biên nhận (code) hoặc tham số đối tượng (type, id).' }, { status: 400 });
  }

  const db = getDatabase();
  let receipt: ReceiptInfo | null = null;

  if (code) {
    receipt = getReceiptByCode(db, code.trim());
  } else if (type && id) {
    receipt = getReceiptByTarget(db, type, id);
  }

  if (!receipt) {
    return NextResponse.json({ error: 'Không tìm thấy biên nhận phù hợp hoặc hồ sơ chưa được gửi chính thức.' }, { status: 404 });
  }

  // Kiểm soát phân quyền: Đơn vị chỉ được xem biên nhận của chính mình (Super Admin và Viewer được xem)
  const isUnitRole = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(session.role);
  if (isUnitRole && receipt.unitId !== session.unitId) {
    return NextResponse.json({ error: 'Bạn không có quyền xem biên nhận của đơn vị khác.' }, { status: 403 });
  }

  return NextResponse.json({ receipt });
}

