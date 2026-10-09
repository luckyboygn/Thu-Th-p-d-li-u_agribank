'use client';

import React, { useState, useEffect } from 'react';
import { 
  Database, Download, RefreshCw, ShieldAlert, CheckCircle2, 
  Calendar, HardDrive, Clock, ArrowLeft, Terminal, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';

interface BackupItem {
  fileName: string;
  sizeBytes: number;
  sizeMB: string;
  createdAt: string;
}

export default function AdminBackupPage() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/backup');
      const data = await res.json();
      if (res.ok) {
        setBackups(data.backups || []);
      } else {
        setMessage({ type: 'error', text: data.error || 'Lỗi khi tải danh sách sao lưu.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi tạo bản sao lưu.');

      setMessage({ type: 'success', text: `Tạo bản sao lưu thành công: ${data.backup?.fileName} (${data.backup?.sizeMB} MB)` });
      await fetchBackups();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-[#005F3E] flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Sao Lưu Cơ Sở Dữ Liệu</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                SQLite WAL (An toàn)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tạo bản snapshot dữ liệu định kỳ bằng VACUUM INTO, lưu trữ tối đa 14 bản gần nhất
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBackups}
            disabled={loading}
            className="p-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="px-4 py-2.5 bg-[#005F3E] hover:bg-[#004d32] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2"
          >
            {creating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Đang sao lưu...</span>
              </>
            ) : (
              <>
                <HardDrive className="w-4 h-4" />
                <span>Tạo bản sao lưu ngay</span>
              </>
            )}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5 border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Security & Operation Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <h4 className="font-bold">Nguyên tắc bảo vệ an toàn dữ liệu:</h4>
            <p>
              Hệ thống tự động sử dụng lệnh <code>VACUUM INTO</code> chuẩn SQLite. Thao tác sao lưu hoàn toàn an toàn ngay cả khi các đơn vị đang tải lên file hoặc kê khai đồng thời mà không làm gián đoạn hệ thống.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl flex items-start gap-3">
          <Terminal className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 space-y-1">
            <h4 className="font-bold">Quy trình Khôi phục dữ liệu (Restore):</h4>
            <p>
              Vì lý do an toàn tuyệt đối, chức năng phục hồi <strong>KHÔNG</strong> được cấp trên giao diện web. Quản trị viên thực hiện khôi phục trực tiếp trên máy chủ bằng lệnh:
            </p>
            <code className="block bg-slate-900 text-emerald-400 p-1.5 rounded-md font-mono text-[11px] mt-1">
              node scripts/restore_db.js
            </code>
          </div>
        </div>
      </div>

      {/* Backups Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-500" />
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Danh sách các bản sao lưu ({backups.length} tệp)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Tự động xoay vòng: Giữ tối đa 14 bản gần nhất
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#F8F9FA] text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
              <tr>
                <th className="px-5 py-3 w-14 text-center">STT</th>
                <th className="px-5 py-3">Tên file sao lưu</th>
                <th className="px-5 py-3 text-center">Dung lượng</th>
                <th className="px-5 py-3 text-center">Thời gian tạo</th>
                <th className="px-5 py-3 text-center">Toàn vẹn</th>
                <th className="px-5 py-3 text-right pr-6">Tải về máy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    Đang tải danh sách bản sao lưu...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    Chưa có bản sao lưu nào trong hệ thống. Bấm "Tạo bản sao lưu ngay" để lưu snapshot đầu tiên.
                  </td>
                </tr>
              ) : (
                backups.map((item, idx) => (
                  <tr key={item.fileName} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-center text-slate-400 font-medium">
                      {idx + 1}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900 flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{item.fileName}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-700">
                      {item.sizeMB} MB
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(item.createdAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>OK (Hợp lệ)</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right pr-6">
                      <a
                        href={`/api/backup/download?file=${encodeURIComponent(item.fileName)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-[#005F3E] text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải về</span>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
