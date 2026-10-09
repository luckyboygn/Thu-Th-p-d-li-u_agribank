'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileCheck2,
  Printer,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

function ReceiptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code && (!type || !id)) {
      setError('Thiếu thông tin tra cứu biên nhận.');
      setLoading(false);
      return;
    }

    async function fetchReceipt() {
      try {
        setLoading(true);
        const url = code
          ? `/api/receipt?code=${encodeURIComponent(code)}`
          : `/api/receipt?type=${encodeURIComponent(type!)}&id=${encodeURIComponent(id!)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi tra cứu biên nhận.');
        setReceipt(data.receipt);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchReceipt();
  }, [code, type, id]);


  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#005F3E] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-600">Đang khởi tạo biên nhận điện tử...</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 max-w-md w-full p-6 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-800">Không tìm thấy biên nhận</h2>
          <p className="text-xs text-slate-600">{error || 'Mã biên nhận không hợp lệ hoặc bạn không có quyền truy cập.'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const isExam = receipt.targetType === 'EXAM_UPLOAD';
  const formattedDate = new Date(receipt.submittedAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6">
      {/* Top Action Bar (Ẩn khi in ấn) */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>In / Xuất PDF Biên nhận</span>
        </button>
      </div>

      {/* TỜ BIÊN NHẬN ĐIỆN TỬ CHUẨN A4 AGRIBANK */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-12 text-slate-800 print:shadow-none print:border-none print:p-0">
        {/* Quốc hiệu / Tiêu ngữ Agribank */}
        <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
              NGÂN HÀNG NÔNG NGHIỆP VÀ PHÁT TRIỂN NÔNG THÔN VIỆT NAM
            </div>
            <div className="text-sm font-black text-[#A81D22] mt-0.5 uppercase tracking-wide">
              {receipt.unitName || `CHI NHÁNH ${receipt.unitCode}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Mã đơn vị: <strong>{receipt.unitCode}</strong>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
              CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
            </div>
            <div className="text-[11px] font-semibold text-slate-600 mt-0.5 italic">
              Độc lập - Tự do - Hạnh phúc
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Hà Nội, ngày {new Date(receipt.submittedAt).getDate()} tháng {new Date(receipt.submittedAt).getMonth() + 1} năm {new Date(receipt.submittedAt).getFullYear()}
            </div>
          </div>
        </div>

        {/* Tiêu đề Biên nhận */}
        <div className="text-center my-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold print:border-slate-400">
            <ShieldCheck className="w-4 h-4 text-[#005F3E]" />
            <span>XÁC NHẬN NỘP HỒ SƠ CHÍNH THỨC</span>
          </div>

          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            BIÊN NHẬN NỘP DỮ LIỆU ĐIỆN TỬ
          </h1>

          <div className="text-xs font-mono font-bold text-slate-600 bg-slate-50 inline-block px-3 py-1 rounded-md border border-slate-200">
            MÃ BIÊN NHẬN: <span className="text-[#005F3E]">{receipt.receiptCode}</span>
          </div>
        </div>

        {/* Nội dung chi tiết */}
        <div className="space-y-6 text-xs sm:text-sm">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-3">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Hạng mục kê khai:</span>
              <span className="font-bold text-slate-900 uppercase">
                {isExam ? 'DANH SÁCH THÍ SINH DỰ THI' : 'KHẢO SÁT NHU CẦU ĐÀO TẠO'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Đợt thu thập / Kỳ thi:</span>
              <span className="font-bold text-slate-900 text-right">{receipt.title}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Đơn vị tự kê khai:</span>
              <span className="font-bold text-slate-900 text-right">
                {receipt.unitName} (Mã: {receipt.unitCode})
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Thời điểm nộp chính thức:</span>
              <span className="font-bold text-slate-900">{formattedDate}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
              <span className="text-slate-500 font-medium">Tổng số lượng bản ghi:</span>
              <span className="font-extrabold text-[#005F3E] text-base">
                {receipt.totalRecords} {isExam ? 'thí sinh hợp lệ (0 lỗi)' : 'lượt học viên đăng ký'}
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 font-medium">Người duyệt nộp (Approver):</span>
              <span className="font-bold text-slate-900">{receipt.approvedByName || receipt.submittedByName}</span>
            </div>
          </div>

          {/* Dấu kiểm tra bảo mật (Checksum & Verification) */}
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Trạng thái hồ sơ: ĐÃ GỬI CHÍNH THỨC LÊN HỆ THỐNG</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Dữ liệu đã được khóa an toàn, lưu vết toàn vẹn và có giá trị xác nhận chính thức trước Ban Tổ chức.
              </p>
            </div>

            <div className="text-right pl-4">
              <div className="text-[10px] text-slate-400 font-mono">DẤU KIỂM TRA</div>
              <div className="font-mono font-bold text-sm text-slate-800 tracking-wider">
                #{receipt.checksum}
              </div>
            </div>
          </div>

          {/* Chữ ký số / Ký xác nhận hai cấp */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
            <div>
              <div className="font-bold text-slate-700 uppercase">NGƯỜI LẬP BIỂU</div>
              <div className="text-[11px] text-slate-400 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
              <div className="h-16 flex items-center justify-center">
                <span className="text-slate-400 font-mono text-[11px]">[Ký điện tử bởi hệ thống]</span>
              </div>
              <div className="font-bold text-slate-900">{receipt.submittedByName}</div>
            </div>

            <div>
              <div className="font-bold text-slate-700 uppercase">THỦ TRƯỞNG ĐƠN VỊ DUYỆT</div>
              <div className="text-[11px] text-slate-400 italic mt-0.5">(Ký, đóng dấu hoặc duyệt số)</div>
              <div className="h-16 flex items-center justify-center">
                <div className="border border-emerald-500 text-emerald-800 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  ĐÃ PHÊ DUYỆT ĐIỆN TỬ
                </div>
              </div>
              <div className="font-bold text-slate-900">{receipt.approvedByName || receipt.submittedByName}</div>
            </div>
          </div>
        </div>

        {/* Footer ghi chú */}
        <div className="mt-12 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
          Hệ thống Thu thập Thông tin & Khảo sát Đào tạo Toàn hàng Agribank • Thời gian trích xuất biên nhận: {new Date().toLocaleString('vi-VN')}
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Đang tải biên nhận...</div>}>
      <ReceiptContent />
    </Suspense>
  );
}
