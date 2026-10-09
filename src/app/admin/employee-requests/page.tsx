'use client';

import React, { useState, useEffect } from 'react';
import {
  UserPlus, CheckCircle2, XCircle, Clock, Search, Filter, 
  Building2, Calendar, FileText, Check, AlertCircle, RefreshCw
} from 'lucide-react';

interface EmployeeRequest {
  id: number;
  exam_id: number;
  unit_id: number;
  unit_code: string;
  unit_name: string;
  exam_title: string;
  employee_code: string;
  elearning_account: string;
  full_name: string;
  position?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_by_name?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

export default function AdminEmployeeRequestsPage() {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal xử lý duyệt / từ chối
  const [selectedReq, setSelectedReq] = useState<EmployeeRequest | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [modalError, setModalError] = useState('');
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`/api/employee-requests?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleOpenAction = (req: EmployeeRequest, action: 'APPROVE' | 'REJECT') => {
    setSelectedReq(req);
    setActionType(action);
    setReviewNote(action === 'APPROVE' ? 'Đã duyệt bổ sung vào CSDL Master' : '');
    setModalError('');
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !actionType) return;

    if (actionType === 'REJECT' && (!reviewNote.trim() || reviewNote.trim().length < 5)) {
      setModalError('Vui lòng nhập lý do từ chối rõ ràng (tối thiểu 5 ký tự).');
      return;
    }

    setProcessing(true);
    setModalError('');

    try {
      const res = await fetch('/api/employee-requests/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedReq.id,
          action: actionType,
          reviewNote: reviewNote.trim()
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi xử lý đề nghị.');

      setBannerMessage({ type: 'success', text: resData.message });
      setSelectedReq(null);
      setActionType(null);
      await fetchRequests();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.employee_code.toLowerCase().includes(q) ||
      r.elearning_account.toLowerCase().includes(q) ||
      r.full_name.toLowerCase().includes(q) ||
      r.unit_name.toLowerCase().includes(q) ||
      r.unit_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-[#005F3E] flex items-center justify-center shrink-0">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Đề Nghị Bổ Sung Cán Bộ</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Quy trình Master DB
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Xét duyệt các trường hợp nhân sự chưa có trong CSDL Master được đơn vị đề nghị bổ sung
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRequests}
            disabled={loading}
            className="p-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{bannerMessage.text}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === 'ALL' ? 'bg-[#005F3E] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Tất cả ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === 'PENDING' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Chờ duyệt
          </button>
          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === 'APPROVED' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Đã duyệt
          </button>
          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === 'REJECTED' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Từ chối
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã CB, eLearning, họ tên, đơn vị..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#F8F9FA] text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3.5 w-12 text-center">STT</th>
                <th className="px-4 py-3.5 min-w-[160px]">Đơn vị đề nghị</th>
                <th className="px-4 py-3.5 font-mono">Mã CB</th>
                <th className="px-4 py-3.5 font-mono">eLearning</th>
                <th className="px-4 py-3.5 min-w-[140px]">Họ và tên</th>
                <th className="px-4 py-3.5 min-w-[180px]">Lý do đề nghị</th>
                <th className="px-4 py-3.5 text-center">Trạng thái</th>
                <th className="px-4 py-3.5 text-right pr-6">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    Đang tải danh sách đề nghị...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    Không có đề nghị bổ sung nào trong danh sách.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, idx) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{req.unit_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Mã ĐV: {req.unit_code}</div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                      {req.employee_code}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {req.elearning_account}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {req.full_name}
                      {req.position && <span className="block text-[11px] font-normal text-slate-500">Chức vụ: {req.position}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">
                      <p className="line-clamp-2">{req.reason}</p>
                      <span className="text-[10px] text-slate-400">
                        {new Date(req.created_at).toLocaleString('vi-VN')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {req.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Chờ duyệt</span>
                        </span>
                      )}
                      {req.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Đã duyệt</span>
                        </span>
                      )}
                      {req.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>Từ chối</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right pr-6">
                      {req.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenAction(req, 'APPROVE')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-[11px] shadow-xs transition-colors"
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => handleOpenAction(req, 'REJECT')}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-bold text-[11px] shadow-xs transition-colors"
                          >
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {req.review_note || 'Đã xử lý'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Review */}
      {selectedReq && actionType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-4 text-white font-bold flex items-center justify-between ${
              actionType === 'APPROVE' ? 'bg-[#005F3E]' : 'bg-[#A81D22]'
            }`}>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                <span className="text-sm">
                  {actionType === 'APPROVE' ? 'Phê duyệt bổ sung cán bộ' : 'Từ chối đề nghị bổ sung'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAction} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div>Đơn vị: <strong className="text-slate-900">{selectedReq.unit_name}</strong></div>
                <div>Cán bộ: <strong className="text-slate-900">{selectedReq.full_name}</strong> (Mã: {selectedReq.employee_code})</div>
                <div>eLearning: <span className="font-mono text-slate-700">{selectedReq.elearning_account}</span></div>
                <div>Lý do đề nghị: <em className="text-slate-600">"{selectedReq.reason}"</em></div>
              </div>

              {actionType === 'APPROVE' ? (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-[11px]">
                  Cán bộ sẽ được tự động thêm vào <strong>CSDL Master (employees)</strong>. Sau đó đơn vị có thể bấm <strong>"Kiểm tra lại (Revalidate)"</strong> để cập nhật danh sách thí sinh mà không cần tải lại file.
                </div>
              ) : (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-[11px]">
                  Vui lòng nêu rõ lý do từ chối để đơn vị rà soát lại thông tin nhân sự.
                </div>
              )}

              {modalError && (
                <div className="p-2 bg-rose-50 border border-rose-300 rounded text-rose-800 font-semibold">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {actionType === 'APPROVE' ? 'Ghi chú phê duyệt:' : 'Lý do từ chối (Bắt buộc):'}
                </label>
                <textarea
                  rows={3}
                  required={actionType === 'REJECT'}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={actionType === 'APPROVE' ? 'Nhập ghi chú...' : 'Nêu rõ lý do từ chối...'}
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedReq(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className={`px-4 py-2 font-bold text-white rounded-lg shadow-xs ${
                    actionType === 'APPROVE' ? 'bg-[#005F3E] hover:bg-[#004d32]' : 'bg-[#A81D22] hover:bg-[#8e191d]'
                  } disabled:opacity-50`}
                >
                  {processing ? 'Đang xử lý...' : actionType === 'APPROVE' ? 'Xác nhận Duyệt' : 'Xác nhận Từ chối'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
