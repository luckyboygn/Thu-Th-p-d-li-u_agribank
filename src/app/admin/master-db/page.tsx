'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Search,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Users,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  X,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  UserX,
  Settings,
  Clock
} from 'lucide-react';

interface MasterEmployee {
  id: number;
  employee_code: string;
  elearning_account: string;
  full_name: string;
  unit_code: string | null;
  unit_name: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

interface HistoryItem {
  id: number;
  action_type: string;
  old_values: string | null;
  new_values: string | null;
  created_at: string;
  changed_by_name: string | null;
  changed_by_username: string | null;
}

interface PreviewSummary {
  totalFileRows: number;
  createCount: number;
  updateCount: number;
  reactivateCount: number;
  deactivateCount: number;
  unchangedCount: number;
}

export default function AdminMasterDbPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employees, setEmployees] = useState<MasterEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);

  // Cấu hình inactive severity
  const [severitySetting, setSeveritySetting] = useState<'WARNING' | 'ERROR'>('WARNING');
  const [updatingSeverity, setUpdatingSeverity] = useState(false);

  // Modal Lịch sử
  const [selectedEmp, setSelectedEmp] = useState<MasterEmployee | null>(null);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Modal Import & Preview
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'UPSERT' | 'FULL_SYNC'>('UPSERT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewSamples, setPreviewSamples] = useState<{
    toCreate: any[];
    toUpdate: any[];
    toReactivate: any[];
    toDeactivate: any[];
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewErrorDetails, setPreviewErrorDetails] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyResultMsg, setApplyResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load danh sách Master và Thống kê
  const loadData = async (query = search, pageNum = page, status = statusFilter) => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/master-employees?q=${encodeURIComponent(query)}&page=${pageNum}&limit=${limit}&status=${status}`
      );
      const data = await res.json();
      setEmployees(data.employees || []);
      setTotal(data.total || 0);
      setActiveCount(data.activeCount || 0);
      setInactiveCount(data.inactiveCount || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Load cấu hình severity
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/master-employees/settings');
      if (res.ok) {
        const data = await res.json();
        setSeveritySetting(data.inactive_employee_severity || 'WARNING');
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadData(search, page, statusFilter);
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData(search, 1, statusFilter);
  };

  const handleUpdateSeverity = async (newSev: 'WARNING' | 'ERROR') => {
    try {
      setUpdatingSeverity(true);
      const res = await fetch('/api/master-employees/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: newSev }),
      });
      if (res.ok) {
        setSeveritySetting(newSev);
      }
    } catch (err) {
      console.error('Error updating severity:', err);
    } finally {
      setUpdatingSeverity(false);
    }
  };

  // Xem lịch sử cán bộ
  const openHistoryModal = async (emp: MasterEmployee) => {
    setSelectedEmp(emp);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/master-employees/${emp.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
      }
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Mở modal import
  const openImportDialog = () => {
    setSelectedFile(null);
    setPreviewSummary(null);
    setPreviewSamples(null);
    setPreviewError(null);
    setPreviewErrorDetails([]);
    setApplyResultMsg(null);
    setShowImportModal(true);
  };

  // Xử lý gửi Preview
  const handlePreview = async () => {
    if (!selectedFile) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewErrorDetails([]);
    setPreviewSummary(null);
    setPreviewSamples(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', importMode);

      const res = await fetch('/api/master-employees/preview', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || 'Lỗi kiểm tra dữ liệu file.');
        setPreviewErrorDetails(data.qualityErrors || []);
        return;
      }

      setPreviewSummary(data.summary);
      setPreviewSamples(data.previewSamples);
    } catch (err: any) {
      setPreviewError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Xử lý Apply cập nhật thật
  const handleApply = async () => {
    if (!selectedFile) return;
    setApplying(true);
    setPreviewError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', importMode);

      const res = await fetch('/api/master-employees/apply', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || 'Lỗi khi cập nhật CSDL.');
        return;
      }

      setApplyResultMsg({
        type: 'success',
        text: data.message || 'Cập nhật CSDL trung tâm thành công!',
      });
      setShowImportModal(false);
      setPage(1);
      loadData(search, 1, statusFilter);
    } catch (err: any) {
      setPreviewError(err.message || 'Lỗi kết nối khi cập nhật.');
    } finally {
      setApplying(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#005F3E] flex items-center gap-2.5">
            <Database className="w-6 h-6 text-[#005F3E]" />
            Cơ Sở Dữ Liệu Nhân Sự Trung Tâm (Master Database)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Nguồn chân lý duy nhất (Single Source of Truth) đối chiếu 1-1 giữa Mã cán bộ và Tài khoản eLearning.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút Tải file mẫu */}
          <a
            href="/api/export?type=master-template"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F2A900] hover:bg-[#d99700] text-slate-900 rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            Tải File Mẫu
          </a>

          {/* Nút Import file Excel */}
          <button
            type="button"
            onClick={openImportDialog}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Nạp / Đồng Bộ CSDL Gốc
          </button>
        </div>
      </div>

      {/* Thông báo kết quả áp dụng nếu có */}
      {applyResultMsg && (
        <div
          className={`p-4 rounded-lg border text-xs font-medium flex items-center justify-between ${
            applyResultMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-[#A81D22]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{applyResultMsg.text}</span>
          </div>
          <button
            onClick={() => setApplyResultMsg(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Thẻ thống kê tổng số Master */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg border border-[#E2E8F0] shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Tổng Cán Bộ Toàn Hàng
          </div>
          <div className="text-3xl font-extrabold text-[#005F3E] mt-2">
            {total.toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Toàn bộ nhân sự trong CSDL</div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-[#E2E8F0] shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Đang Hoạt Động</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="text-3xl font-extrabold text-emerald-700 mt-2">
            {activeCount.toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Nhân sự hợp lệ đăng ký thi</div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-[#E2E8F0] shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Ngừng Hoạt Động</span>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <div className="text-3xl font-extrabold text-[#A81D22] mt-2">
            {inactiveCount.toLocaleString('vi-VN')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Nghỉ việc, điều chuyển hoặc vắng mặt</div>
        </div>

        {/* Cấu hình Mức độ xử lý Thí sinh Inactive */}
        <div className="bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-[#005F3E]" />
              Xử Lý Thí Sinh Inactive
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Quy tắc khi đơn vị kê khai cán bộ đã ngừng hoạt động:
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleUpdateSeverity('WARNING')}
              disabled={updatingSeverity}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-bold border transition-colors ${
                severitySetting === 'WARNING'
                  ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Cảnh báo (WARNING)
            </button>
            <button
              type="button"
              onClick={() => handleUpdateSeverity('ERROR')}
              disabled={updatingSeverity}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-bold border transition-colors ${
                severitySetting === 'ERROR'
                  ? 'bg-rose-100 border-rose-400 text-rose-900 shadow-xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Chặn nộp (ERROR)
            </button>
          </div>
        </div>
      </div>

      {/* Bảng Dữ Liệu Master Table */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs overflow-hidden">
        {/* Thanh công cụ tìm kiếm và Bộ lọc trạng thái */}
        <div className="p-4 bg-slate-50 border-b border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo Mã CB, eLearning, Họ tên..."
                className="w-full pl-9 pr-20 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 px-3 py-1 bg-[#005F3E] text-white rounded text-[11px] font-bold hover:bg-[#004d32]"
              >
                Tìm
              </button>
            </form>

            {/* Bộ lọc trạng thái */}
            <div className="flex items-center border border-[#E2E8F0] rounded-lg bg-white overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => { setStatusFilter('ALL'); setPage(1); }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  statusFilter === 'ALL' ? 'bg-[#005F3E] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('ACTIVE'); setPage(1); }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  statusFilter === 'ACTIVE' ? 'bg-[#005F3E] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Đang hoạt động
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('INACTIVE'); setPage(1); }}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  statusFilter === 'INACTIVE' ? 'bg-[#005F3E] text-white font-bold' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Ngừng hoạt động
              </button>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-500 self-end sm:self-auto">
            Hiển thị {employees.length} / {total.toLocaleString('vi-VN')} bản ghi
          </div>
        </div>

        {/* Bảng hiển thị */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#F4F6F8] font-bold text-slate-700 uppercase text-[11px] border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3 w-14 text-center">STT</th>
                <th className="px-4 py-3 w-36 font-mono text-[#005F3E]">Mã cán bộ</th>
                <th className="px-4 py-3 w-40 font-mono text-[#005F3E]">Tài khoản eLearning</th>
                <th className="px-4 py-3">Họ và tên cán bộ</th>
                <th className="px-4 py-3">Đơn vị / Chi nhánh</th>
                <th className="px-4 py-3 w-32 text-center">Trạng thái</th>
                <th className="px-4 py-3 w-28 text-center">Lịch sử</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 text-xs">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500 text-xs">
                    Không tìm thấy bản ghi nào phù hợp.
                  </td>
                </tr>
              ) : (
                employees.map((emp, index) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 bg-slate-50/50">
                      {emp.employee_code}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#005F3E]">
                      {emp.elearning_account}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {emp.full_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {emp.unit_code || emp.unit_name ? `${emp.unit_code || ''} - ${emp.unit_name || ''}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {emp.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <UserCheck className="w-3 h-3 text-emerald-600" />
                          Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                          <UserX className="w-3 h-3 text-slate-500" />
                          Ngừng hoạt động
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => openHistoryModal(emp)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-colors"
                      >
                        <History className="w-3 h-3 text-slate-500" />
                        Biến động
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        <div className="p-4 bg-slate-50 border-t border-[#E2E8F0] flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Trang {page} / {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 border border-[#E2E8F0] bg-white rounded-lg hover:bg-slate-100 disabled:opacity-40 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 border border-[#E2E8F0] bg-white rounded-lg hover:bg-slate-100 disabled:opacity-40 text-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: XEM LỊCH SỬ BIẾN ĐỘNG CỦA CÁN BỘ */}
      {showHistoryModal && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#005F3E] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-300" />
                  Lịch Sử Biến Động: {selectedEmp.full_name} ({selectedEmp.employee_code})
                </h3>
                <p className="text-[11px] text-emerald-100 mt-0.5">
                  Tài khoản eLearning: {selectedEmp.elearning_account} | Đơn vị: {selectedEmp.unit_code || 'Chưa gán'}
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {loadingHistory ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Đang tải lịch sử biến động...
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Chưa ghi nhận biến động nào cho cán bộ này.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-4 pl-4 space-y-6">
                  {historyList.map((item) => {
                    const badgeColor =
                      item.action_type === 'CREATED'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : item.action_type === 'UPDATED'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : item.action_type === 'REACTIVATED'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300';

                    const actionLabel =
                      item.action_type === 'CREATED'
                        ? 'Tạo mới trong CSDL'
                        : item.action_type === 'UPDATED'
                        ? 'Cập nhật thông tin'
                        : item.action_type === 'REACTIVATED'
                        ? 'Kích hoạt lại hoạt động'
                        : 'Ngừng hoạt động (Inactive)';

                    return (
                      <div key={item.id} className="relative">
                        <div className="absolute -left-[25px] top-1.5 w-3 h-3 rounded-full bg-[#005F3E] border-2 border-white shadow-xs"></div>
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                            {actionLabel}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(item.created_at).toLocaleString('vi-VN')}
                          </span>
                        </div>

                        <div className="mt-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                          {item.changed_by_name && (
                            <div className="text-[11px] text-slate-500">
                              Người thực hiện: <span className="font-semibold text-slate-700">{item.changed_by_name}</span> ({item.changed_by_username})
                            </div>
                          )}
                          {item.old_values && (
                            <div className="text-[11px] text-slate-600">
                              <span className="font-medium text-slate-500">Giá trị cũ:</span> {item.old_values}
                            </div>
                          )}
                          {item.new_values && (
                            <div className="text-[11px] text-slate-800">
                              <span className="font-medium text-slate-600">Giá trị mới:</span> {item.new_values}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NẠP VÀ ĐỒNG BỘ CSDL GỐC (2 BƯỚC: PREVIEW -> APPLY) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#005F3E] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                  Nạp và Đồng Bộ Cơ Sở Dữ Liệu Nhân Sự Gốc
                </h3>
                <p className="text-[11px] text-emerald-100 mt-0.5">
                  Quy trình 2 bước: Xem trước biến động & Xác nhận áp dụng an toàn
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Bước 1: Chọn chế độ & File */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-800">1. Chọn chế độ nạp dữ liệu:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      importMode === 'UPSERT'
                        ? 'bg-emerald-50 border-[#005F3E] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="UPSERT"
                      checked={importMode === 'UPSERT'}
                      onChange={() => { setImportMode('UPSERT'); setPreviewSummary(null); }}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-bold text-[#005F3E]">Cập nhật / Bổ sung (Mặc định)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Thêm cán bộ mới, cập nhật cán bộ đổi thông tin. Cán bộ vắng mặt trong file vẫn giữ nguyên.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      importMode === 'FULL_SYNC'
                        ? 'bg-amber-50 border-[#F2A900] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="FULL_SYNC"
                      checked={importMode === 'FULL_SYNC'}
                      onChange={() => { setImportMode('FULL_SYNC'); setPreviewSummary(null); }}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-bold text-amber-800">Đồng bộ toàn bộ (Full Sync)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Cán bộ vắng mặt trong file sẽ tự động chuyển sang <span className="font-semibold text-rose-700">Ngừng hoạt động (INACTIVE)</span>.
                      </div>
                    </div>
                  </label>
                </div>

                <div className="pt-2">
                  <div className="text-xs font-bold text-slate-800 mb-1.5">2. Chọn file Excel (.xlsx, .xls):</div>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={(e) => {
                        setSelectedFile(e.target.files?.[0] || null);
                        setPreviewSummary(null);
                        setPreviewError(null);
                      }}
                      className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#005F3E] file:text-white hover:file:bg-[#004d32] cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handlePreview}
                      disabled={!selectedFile || previewLoading}
                      className="px-4 py-1.5 bg-[#F2A900] hover:bg-[#d99700] text-slate-900 rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                    >
                      {previewLoading ? 'Đang phân tích...' : 'Xem Trước Biến Động'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Thông báo lỗi phân tích */}
              {previewError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-[#A81D22] text-xs">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#A81D22]" />
                    {previewError}
                  </div>
                  {previewErrorDetails.length > 0 && (
                    <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px]">
                      {previewErrorDetails.slice(0, 5).map((detail, idx) => (
                        <li key={idx}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Kết quả Preview */}
              {previewSummary && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Kết Quả Dự Báo Biến Động CSDL (Tổng {previewSummary.totalFileRows} dòng trong file)
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-[11px] font-bold text-emerald-800">Thêm Mới</div>
                      <div className="text-xl font-extrabold text-emerald-700 mt-1">
                        +{previewSummary.createCount.toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="text-[11px] font-bold text-blue-800">Cập Nhật</div>
                      <div className="text-xl font-extrabold text-blue-700 mt-1">
                        ~{previewSummary.updateCount.toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-[11px] font-bold text-amber-800">Kích Hoạt Lại</div>
                      <div className="text-xl font-extrabold text-amber-700 mt-1">
                        ↺{previewSummary.reactivateCount.toLocaleString('vi-VN')}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                      <div className="text-[11px] font-bold text-rose-800">Ngừng Hoạt Động</div>
                      <div className="text-xl font-extrabold text-rose-700 mt-1">
                        ✗{previewSummary.deactivateCount.toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  {/* Bảng xem trước danh sách biến động mẫu */}
                  {previewSamples && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px] text-slate-700">
                        <thead className="bg-slate-100 font-bold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-1.5">Mã CB</th>
                            <th className="px-3 py-1.5">eLearning</th>
                            <th className="px-3 py-1.5">Họ tên</th>
                            <th className="px-3 py-1.5">Đơn vị</th>
                            <th className="px-3 py-1.5">Loại biến động</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {previewSamples.toCreate.slice(0, 10).map((item, idx) => (
                            <tr key={`create-${idx}`} className="bg-emerald-50/50">
                              <td className="px-3 py-1 font-mono font-bold text-slate-800">{item.code}</td>
                              <td className="px-3 py-1 font-mono text-[#005F3E]">{item.elearn}</td>
                              <td className="px-3 py-1">{item.name}</td>
                              <td className="px-3 py-1">{item.unit || '-'}</td>
                              <td className="px-3 py-1 font-bold text-emerald-700">Thêm mới</td>
                            </tr>
                          ))}
                          {previewSamples.toUpdate.slice(0, 10).map((item, idx) => (
                            <tr key={`update-${idx}`} className="bg-blue-50/50">
                              <td className="px-3 py-1 font-mono font-bold text-slate-800">{item.code}</td>
                              <td className="px-3 py-1 font-mono text-[#005F3E]">{item.elearn}</td>
                              <td className="px-3 py-1">{item.name}</td>
                              <td className="px-3 py-1">{item.unit || '-'}</td>
                              <td className="px-3 py-1 font-bold text-blue-700">Cập nhật</td>
                            </tr>
                          ))}
                          {previewSamples.toDeactivate.slice(0, 10).map((item, idx) => (
                            <tr key={`deact-${idx}`} className="bg-rose-50/50">
                              <td className="px-3 py-1 font-mono font-bold text-slate-800">{item.code}</td>
                              <td className="px-3 py-1 font-mono text-slate-500">{item.elearn}</td>
                              <td className="px-3 py-1">{item.name}</td>
                              <td className="px-3 py-1">{item.unit || '-'}</td>
                              <td className="px-3 py-1 font-bold text-rose-700">Ngừng hoạt động</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={!previewSummary || applying}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
              >
                {applying ? 'Đang áp dụng vào CSDL...' : 'Xác Nhận Áp Dụng CSDL'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
