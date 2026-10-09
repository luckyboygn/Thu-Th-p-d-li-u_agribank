'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Building2,
  FileText,
  KeyRound,
  UploadCloud,
  CheckCircle2,
  Download,
  Calendar,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info
} from 'lucide-react';

interface AuditLog {
  id: number;
  user_id: number | null;
  username: string;
  unit_code: string | null;
  unit_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Bộ lọc
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [entityTypeFilter, setEntityTypeFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([]);

  // Modal Chi tiết
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async (pageNum = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: String(limit),
        q: search,
        action: actionFilter,
        entity_type: entityTypeFilter,
        from_date: fromDate,
        to_date: toDate
      });

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.availableActions) setAvailableActions(data.availableActions);
      if (data.availableEntityTypes) setAvailableEntityTypes(data.availableEntityTypes);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page, actionFilter, entityTypeFilter]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setActionFilter('ALL');
    setEntityTypeFilter('ALL');
    setFromDate('');
    setToDate('');
    setPage(1);
    setTimeout(() => {
      fetchLogs(1);
    }, 0);
  };

  const getExportUrl = () => {
    const params = new URLSearchParams({
      type: 'audit-logs',
      q: search,
      action: actionFilter,
      entity_type: entityTypeFilter,
      from_date: fromDate,
      to_date: toDate
    });
    return `/api/export?${params.toString()}`;
  };

  // Badge màu theo Action
  const getActionBadge = (action: string) => {
    if (action.includes('LOGIN') || action.includes('PASSWORD')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (action.includes('CREATE') || action.includes('ADD')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('SYNC')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (action.includes('CONFIRM') || action.includes('APPROVE') || action.includes('SUBMIT')) {
      return 'bg-teal-100 text-teal-800 border-teal-200';
    }
    if (action.includes('REOPEN') || action.includes('REJECT') || action.includes('LOCK')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (action.includes('EXPORT') || action.includes('DOWNLOAD')) {
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#005F3E] flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-[#005F3E]" />
            Nhật Ký Kiểm Toán Toàn Diện (System Audit Logs)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ghi vết đầy đủ mọi hành động thay đổi dữ liệu, cấu hình, phân quyền, đăng nhập và xuất báo cáo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Nút Xuất Excel */}
          <a
            href={getExportUrl()}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            Xuất Excel Nhật Ký
          </a>

          {/* Nút Refresh */}
          <button
            onClick={() => fetchLogs(page)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Bộ Lọc Đa Tiêu Chí */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
        <form onSubmit={handleFilterSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* 1. Tìm kiếm từ khóa */}
            <div className="md:col-span-2 relative">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Từ khóa tìm kiếm:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Người dùng, đơn vị, mã đối tượng, chi tiết..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>
            </div>

            {/* 2. Lọc theo Hành động */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Hành động:</label>
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              >
                <option value="ALL">-- Tất cả hành động --</option>
                {availableActions.map((act) => (
                  <option key={act} value={act}>{act}</option>
                ))}
              </select>
            </div>

            {/* 3. Lọc theo Loại đối tượng */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Loại đối tượng:</label>
              <select
                value={entityTypeFilter}
                onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              >
                <option value="ALL">-- Tất cả đối tượng --</option>
                {availableEntityTypes.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </div>

            {/* 4. Khoảng ngày */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Từ ngày:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-600">Đến ngày:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-[#E2E8F0] rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Đặt lại
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#005F3E] text-white rounded-lg text-xs font-bold hover:bg-[#004d32] transition-colors"
              >
                Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Bảng Hiển Thị Audit Logs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700">
            Kết quả tra cứu: <span className="text-[#005F3E]">{total.toLocaleString('vi-VN')}</span> bản ghi
          </div>
          <div className="text-xs text-slate-500">
            Trang {page} / {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#F4F6F8] font-bold text-slate-700 uppercase text-[11px] border-b border-[#E2E8F0]">
              <tr>
                <th className="px-3 py-3 w-12 text-center">STT</th>
                <th className="px-3 py-3 w-36">Thời gian</th>
                <th className="px-3 py-3 w-32">Người dùng</th>
                <th className="px-3 py-3 w-40">Đơn vị</th>
                <th className="px-3 py-3 w-36">Hành động</th>
                <th className="px-3 py-3 w-28">Đối tượng</th>
                <th className="px-3 py-3 w-24">Mã ĐT</th>
                <th className="px-3 py-3">Chi tiết tóm tắt</th>
                <th className="px-3 py-3 w-20 text-center">Xem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-500 text-xs">
                    Đang tải nhật ký kiểm toán...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-500 text-xs">
                    Không tìm thấy bản ghi nhật ký nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                      {(page - 1) * limit + index + 1}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : '-'}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">
                      {log.username}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {log.unit_code ? `${log.unit_code}` : '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium">
                      {log.entity_type || '-'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 text-[11px]">
                      {log.entity_id || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-md truncate text-[11px]" title={log.details || ''}>
                      {log.details || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {log.details ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#005F3E]" />
                        </button>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
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
            Hiển thị {logs.length} / {total.toLocaleString('vi-VN')} bản ghi
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 border border-[#E2E8F0] bg-white rounded-lg hover:bg-slate-100 disabled:opacity-40 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 text-slate-700">
              {page} / {totalPages}
            </span>
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

      {/* MODAL XEM CHI TIẾT AUDIT LOG */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#005F3E] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-300" />
                  Chi Tiết Nhật Ký Kiểm Toán #{selectedLog.id}
                </h3>
                <p className="text-[11px] text-emerald-100 mt-0.5">
                  Hành động: {selectedLog.action} | Thực hiện bởi: {selectedLog.username}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500">Thời gian:</span>{' '}
                  <span className="text-slate-800 font-mono">
                    {selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleString('vi-VN') : '-'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Địa chỉ IP:</span>{' '}
                  <span className="text-slate-800 font-mono">{selectedLog.ip_address || 'N/A'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Đơn vị:</span>{' '}
                  <span className="text-slate-800">
                    {selectedLog.unit_code ? `${selectedLog.unit_code} - ${selectedLog.unit_name || ''}` : 'Không áp dụng'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Đối tượng liên quan:</span>{' '}
                  <span className="text-slate-800 font-semibold">
                    {selectedLog.entity_type ? `${selectedLog.entity_type} (ID: ${selectedLog.entity_id || '-'})` : 'N/A'}
                  </span>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-700 mb-1.5">Dữ liệu chi tiết (Payload / Attributes):</div>
                <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-64 whitespace-pre-wrap">
                  {(() => {
                    try {
                      const parsed = JSON.parse(selectedLog.details || '{}');
                      return JSON.stringify(parsed, null, 2);
                    } catch {
                      return selectedLog.details;
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
