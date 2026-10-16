'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  PlusCircle,
  FolderOpen,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  UploadCloud,
  FileSearch,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Calendar,
  X,
  Edit2,
  GraduationCap,
  FileSpreadsheet,
  Layers,
  Filter
} from 'lucide-react';

interface Exam {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  start_date: string | null;
  end_date: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  task_type?: 'CANDIDATE_EXAM' | 'TRAINING_DEMAND' | string | null;
}

interface Unit {
  id: number;
  unit_code: string;
  unit_name: string;
}

export default function AdminExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Phân loại đợt khi tạo mới
  const [newTaskType, setNewTaskType] = useState<'CANDIDATE_EXAM' | 'TRAINING_DEMAND'>('CANDIDATE_EXAM');
  // Bộ lọc phân loại trong danh sách
  const [filterTaskType, setFilterTaskType] = useState<'ALL' | 'CANDIDATE_EXAM' | 'TRAINING_DEMAND'>('ALL');

  // Form tạo mới
  const [newExamCode, setNewExamCode] = useState('');
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDesc, setNewExamDesc] = useState('');
  const [newExamStartAt, setNewExamStartAt] = useState('');
  const [newExamEndAt, setNewExamEndAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Sửa Hạn chót
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [editStartAt, setEditStartAt] = useState('');
  const [editEndAt, setEditEndAt] = useState('');
  const [updatingDeadline, setUpdatingDeadline] = useState(false);

  // Modal Gia hạn riêng cho đơn vị
  const [extendingExam, setExtendingExam] = useState<Exam | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<number | ''>('');
  const [newExtensionEndAt, setNewExtensionEndAt] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [granting, setGranting] = useState(false);
  const [existingExtensions, setExistingExtensions] = useState<any[]>([]);

  const fetchExams = async (filter = filterTaskType) => {
    try {
      setLoading(true);
      const url = filter === 'ALL' ? '/api/exams' : `/api/exams?taskType=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setExams(data.exams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await fetch('/api/units');
      if (res.ok) {
        const d = await res.json();
        setUnits(d.units || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchExams();
    fetchUnits();
  }, []);

  const handleToggleStatus = async (examId: number, currentStatus: string) => {
    const isLocking = currentStatus === 'OPEN';
    const actionLabel = isLocking ? 'KHÓA đợt thu thập (đóng tiếp nhận nộp file)' : 'MỞ LẠI đợt thu thập';
    if (!confirm(`Bạn có chắc chắn muốn ${actionLabel}?`)) return;

    try {
      const nextStatus = isLocking ? 'CLOSED' : 'OPEN';
      const res = await fetch('/api/exams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, status: nextStatus })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật');
      setMessage({ type: 'success', text: `Đã ${isLocking ? 'khóa' : 'mở lại'} đợt thu thập thành công!` });
      fetchExams();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleTaskType = async (examId: number, currentType?: string | null) => {
    const isCurrentlySurvey = currentType === 'TRAINING_DEMAND';
    const nextType = isCurrentlySurvey ? 'CANDIDATE_EXAM' : 'TRAINING_DEMAND';
    const label = nextType === 'TRAINING_DEMAND' ? 'Khảo sát nhu cầu đào tạo' : 'Thu thập danh sách cán bộ thi nghiệp vụ';
    if (!confirm(`Bạn có chắc chắn muốn chuyển phân loại đợt này sang "${label}"?`)) return;

    try {
      const res = await fetch('/api/exams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, taskType: nextType })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật phân loại');
      setMessage({ type: 'success', text: `Đã chuyển phân loại đợt sang "${label}" thành công!` });
      fetchExams(filterTaskType);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamCode || !newExamTitle) {
      setMessage({ type: 'error', text: 'Vui lòng điền đủ Mã đợt và Tên đợt.' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: newExamCode,
          title: newExamTitle,
          description: newExamDesc,
          taskType: newTaskType,
          startAt: newExamStartAt ? new Date(newExamStartAt).toISOString() : null,
          endAt: newExamEndAt ? new Date(newExamEndAt).toISOString() : null
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Không thể tạo đợt thu thập.');
      const successMsg = newTaskType === 'TRAINING_DEMAND'
        ? 'Khởi tạo đợt Khảo sát nhu cầu đào tạo mới thành công! Đợt đã được đưa vào phân hệ Khảo sát đào tạo.'
        : 'Khởi tạo đợt Thu thập danh sách cán bộ phục vụ thi mới thành công!';
      setMessage({ type: 'success', text: successMsg });
      setNewExamCode('');
      setNewExamTitle('');
      setNewExamDesc('');
      setNewExamStartAt('');
      setNewExamEndAt('');
      fetchExams(filterTaskType);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (ex: Exam) => {
    setEditingExam(ex);
    // Convert ISO to datetime-local string YYYY-MM-DDTHH:mm
    if (ex.start_at) {
      const d = new Date(ex.start_at);
      setEditStartAt(d.toISOString().slice(0, 16));
    } else {
      setEditStartAt('');
    }
    if (ex.end_at) {
      const d = new Date(ex.end_at);
      setEditEndAt(d.toISOString().slice(0, 16));
    } else {
      setEditEndAt('');
    }
  };

  const handleSaveDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;
    setUpdatingDeadline(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingExam.id,
          startAt: editStartAt ? new Date(editStartAt).toISOString() : null,
          endAt: editEndAt ? new Date(editEndAt).toISOString() : null
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật thời hạn');
      setMessage({ type: 'success', text: `Đã cập nhật thời hạn cho đợt "${editingExam.title}" thành công!` });
      setEditingExam(null);
      fetchExams();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingDeadline(false);
    }
  };

  const openExtensionModal = async (ex: Exam) => {
    setExtendingExam(ex);
    setSelectedUnitId('');
    setNewExtensionEndAt('');
    setExtensionReason('');
    try {
      const res = await fetch(`/api/deadline-extensions?targetType=EXAM&targetId=${ex.id}`);
      if (res.ok) {
        const d = await res.json();
        setExistingExtensions(d.extensions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGrantExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendingExam || !selectedUnitId || !newExtensionEndAt || !extensionReason) {
      alert('Vui lòng điền đầy đủ đơn vị, hạn chót mới và lý do.');
      return;
    }
    setGranting(true);
    try {
      const res = await fetch('/api/deadline-extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: Number(selectedUnitId),
          targetType: 'EXAM',
          targetId: extendingExam.id,
          newEndAt: new Date(newExtensionEndAt).toISOString(),
          reason: extensionReason
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cấp gia hạn');
      setMessage({ type: 'success', text: d.message || 'Cấp gia hạn thành công!' });
      setExtendingExam(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#005F3E] flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-[#005F3E]" />
            Quản Lý Các Đợt Thu Thập Dữ Liệu
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Khởi tạo và phân loại các đợt thu thập thông tin thi nghiệp vụ hoặc khảo sát nhu cầu đào tạo toàn hàng, quản lý hạn chót và cấp gia hạn cho các đơn vị.
          </p>
        </div>

        <button
          onClick={() => fetchExams(filterTaskType)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </button>
      </div>

      {/* Thông báo */}
      {message && (
        <div
          className={`p-4 rounded-lg border text-xs font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Form Tạo kỳ mới */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E2E8F0]">
          <PlusCircle className="w-5 h-5 text-[#005F3E]" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Khởi tạo đợt thu thập dữ liệu mới
          </h2>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Khối Chọn phân loại đợt thu thập */}
          <div className="p-4 bg-[#F4F6F8] rounded-xl border border-[#E2E8F0]">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
              Phân loại mục đích đợt thu thập <span className="text-[#A81D22]">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label
                onClick={() => setNewTaskType('CANDIDATE_EXAM')}
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                  newTaskType === 'CANDIDATE_EXAM'
                    ? 'bg-emerald-50/90 border-[#005F3E] ring-2 ring-[#005F3E]/20 text-[#005F3E]'
                    : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="taskType"
                  value="CANDIDATE_EXAM"
                  checked={newTaskType === 'CANDIDATE_EXAM'}
                  onChange={() => setNewTaskType('CANDIDATE_EXAM')}
                  className="mt-0.5 text-[#005F3E] focus:ring-[#005F3E]"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <FileSpreadsheet className="w-4 h-4 text-[#005F3E]" />
                    1. Thu thập thông tin phục vụ thi nghiệp vụ
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Đơn vị tải file Excel danh sách cán bộ, đối chiếu 2 chiều với CSDL nhân sự. Đợt này hiển thị ở phân hệ <strong>Thi nghiệp vụ cán bộ</strong>.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setNewTaskType('TRAINING_DEMAND')}
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                  newTaskType === 'TRAINING_DEMAND'
                    ? 'bg-teal-50/90 border-teal-600 ring-2 ring-teal-600/20 text-teal-800'
                    : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="taskType"
                  value="TRAINING_DEMAND"
                  checked={newTaskType === 'TRAINING_DEMAND'}
                  onChange={() => setNewTaskType('TRAINING_DEMAND')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <GraduationCap className="w-4 h-4 text-teal-600" />
                    2. Khảo sát nhu cầu đào tạo
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Đơn vị kê khai số lượng học viên theo khung chương trình & chuyên đề năm 2027. Tự động đưa vào phân hệ <strong>Khảo sát nhu cầu đào tạo</strong>.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {newTaskType === 'TRAINING_DEMAND' ? 'Mã đợt khảo sát' : 'Mã đợt thi nghiệp vụ'}{' '}
                <span className="text-[#A81D22]">*</span>
              </label>
              <input
                type="text"
                required
                value={newExamCode}
                onChange={(e) => setNewExamCode(e.target.value.toUpperCase())}
                placeholder={newTaskType === 'TRAINING_DEMAND' ? 'VD: KS_DAO_TAO_2027_DOT2' : 'VD: EXAM_11_2026'}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {newTaskType === 'TRAINING_DEMAND' ? 'Tên đợt khảo sát đào tạo' : 'Tên kỳ thi nghiệp vụ'}{' '}
                <span className="text-[#A81D22]">*</span>
              </label>
              <input
                type="text"
                required
                value={newExamTitle}
                onChange={(e) => setNewExamTitle(e.target.value)}
                placeholder={
                  newTaskType === 'TRAINING_DEMAND'
                    ? 'VD: Khảo sát nhu cầu đào tạo triển khai công tác đào tạo năm 2027 (Đợt 2)'
                    : 'VD: Kỳ kiểm tra nghiệp vụ chuyên môn định kỳ tháng 11/2026'
                }
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả ngắn</label>
              <input
                type="text"
                value={newExamDesc}
                onChange={(e) => setNewExamDesc(e.target.value)}
                placeholder={newTaskType === 'TRAINING_DEMAND' ? 'VD: Khảo sát bổ sung' : 'VD: Thu thập định kỳ'}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Thời gian bắt đầu mở</label>
              <input
                type="datetime-local"
                value={newExamStartAt}
                onChange={(e) => setNewExamStartAt(e.target.value)}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Hạn chót kết thúc</label>
              <input
                type="datetime-local"
                value={newExamEndAt}
                onChange={(e) => setNewExamEndAt(e.target.value)}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>

            <div className="md:col-span-2 flex items-end justify-end">
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 bg-[#005F3E] hover:bg-[#004d32] text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                {creating
                  ? 'Đang khởi tạo...'
                  : newTaskType === 'TRAINING_DEMAND'
                  ? 'Khởi tạo đợt khảo sát mới'
                  : 'Khởi tạo đợt thi mới'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Danh sách các kỳ hiện có */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#005F3E]" />
            <span>Danh sách các đợt thu thập ({exams.length})</span>
          </h2>

          {/* Tabs Filter */}
          <div className="flex items-center gap-1 bg-[#F4F6F8] p-1 rounded-lg border border-[#E2E8F0] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setFilterTaskType('ALL');
                fetchExams('ALL');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                filterTaskType === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({exams.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterTaskType('CANDIDATE_EXAM');
                fetchExams('CANDIDATE_EXAM');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                filterTaskType === 'CANDIDATE_EXAM'
                  ? 'bg-[#005F3E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Phục vụ thi
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterTaskType('TRAINING_DEMAND');
                fetchExams('TRAINING_DEMAND');
              }}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                filterTaskType === 'TRAINING_DEMAND'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Khảo sát đào tạo
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-lg border border-[#E2E8F0] text-center text-xs text-slate-500">
            Đang tải danh sách đợt thu thập...
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white p-10 rounded-lg border border-[#E2E8F0] text-center text-xs text-slate-500">
            Không tìm thấy đợt thu thập nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {exams.map((ex) => {
              const isOpen = ex.status === 'OPEN';
              const isSurvey = ex.task_type === 'TRAINING_DEMAND';

              return (
                <div
                  key={ex.id}
                  className="bg-white rounded-lg border border-[#E2E8F0] p-5 shadow-xs hover:border-[#005F3E]/40 transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-extrabold text-base text-slate-900">
                          {ex.title}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 font-mono text-[11px] font-bold text-slate-700 rounded">
                          {ex.code}
                        </span>

                        {/* Badge Phân loại đợt */}
                        {isSurvey ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 bg-teal-50 text-teal-800 border-teal-300">
                            <GraduationCap className="w-3 h-3 text-teal-700" />
                            Khảo sát nhu cầu đào tạo
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 bg-emerald-50 text-[#005F3E] border-emerald-300">
                            <FileSpreadsheet className="w-3 h-3 text-[#005F3E]" />
                            Phục vụ thi nghiệp vụ
                          </span>
                        )}

                        {/* Badge Trạng thái mở/khóa */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                            isOpen
                              ? 'bg-emerald-50 text-[#005F3E] border-emerald-300'
                              : 'bg-rose-50 text-[#A81D22] border-rose-300'
                          }`}
                        >
                          {isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {isOpen ? 'Đang mở nộp file' : 'Đã đóng nộp file'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {ex.description || 'Chưa có mô tả bổ sung cho đợt thu thập này.'}
                      </p>
                      
                      {/* Hiển thị mốc thời hạn */}
                      <div className="flex items-center gap-4 text-[11px] text-slate-600 pt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <strong>Bắt đầu:</strong>{' '}
                          {ex.start_at
                            ? new Date(ex.start_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                            : 'Mở tự do'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <strong>Hạn chót:</strong>{' '}
                          {ex.end_at ? (
                            <span className="text-[#A81D22] font-bold">
                              {new Date(ex.end_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                            </span>
                          ) : (
                            'Không giới hạn'
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(ex)}
                        className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3 h-3 text-slate-500" />
                        <span>Sửa hạn chót</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openExtensionModal(ex)}
                        className="px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Calendar className="w-3 h-3 text-amber-700" />
                        <span>Gia hạn đơn vị</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleTaskType(ex.id, ex.task_type)}
                        title="Chuyển đổi qua lại giữa Thi nghiệp vụ và Khảo sát đào tạo"
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3 text-slate-500" />
                        <span>Đổi loại đợt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(ex.id, ex.status)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        {isOpen ? 'Khóa đợt' : 'Mở lại đợt'}
                      </button>

                      {isSurvey ? (
                        <Link
                          href="/admin/training-demand"
                          className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                        >
                          <span>Quản lý Khảo Sát</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <Link
                          href={`/admin?examId=${ex.id}`}
                          className="px-4 py-1.5 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                        >
                          <span>Vào Dashboard</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* 4 Quy trình */}
                  {isSurvey ? (
                    <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                        <div className="font-bold text-teal-900 flex items-center gap-1.5">
                          <GraduationCap className="w-4 h-4 text-teal-700" />
                          Kê khai nhu cầu
                        </div>
                        <div className="text-[11px] text-teal-700 mt-1">
                          Đơn vị nhập số lượng theo 11 khóa/chuyên đề
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                        <div className="font-bold text-teal-900 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-teal-700" />
                          5 Nhóm đối tượng
                        </div>
                        <div className="text-[11px] text-teal-700 mt-1">
                          BGĐ, Trưởng phòng, Phó phòng, NV, Khác
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                        <div className="font-bold text-teal-900 flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-teal-700" />
                          Tổng hợp toàn hàng
                        </div>
                        <div className="text-[11px] text-teal-700 mt-1">
                          Thống kê tiến độ nộp và tổng số học viên
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                        <div className="font-bold text-teal-900 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-4 h-4 text-teal-700" />
                          Xuất biểu mẫu 2027
                        </div>
                        <div className="text-[11px] text-teal-700 mt-1">
                          Tải file Excel tổng hợp kế hoạch đào tạo
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-[#F4F6F8] border border-[#E2E8F0]">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <UploadCloud className="w-4 h-4 text-[#005F3E]" />
                          Upload dữ liệu
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Thu thập file kê khai các chi nhánh
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-[#F4F6F8] border border-[#E2E8F0]">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <FileSearch className="w-4 h-4 text-blue-600" />
                          Đối chiếu 2 chiều
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Khớp Mã cán bộ ↔ eLearning
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-[#F4F6F8] border border-[#E2E8F0]">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-[#A81D22]" />
                          Danh sách lỗi
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Bóc tách sai sót & cảnh báo chi tiết
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-[#F4F6F8] border border-[#E2E8F0]">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-purple-600" />
                          Báo cáo thống kê
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Tổng hợp toàn hệ thống
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Sửa Thời Hạn */}
      {editingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#005F3E]" />
                Sửa Hạn Chót Kỳ Thi
              </h3>
              <button
                onClick={() => setEditingExam(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Đang chỉnh sửa thời hạn cho kỳ: <strong>{editingExam.title}</strong> ({editingExam.code})
            </p>

            <form onSubmit={handleSaveDeadline} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Thời gian bắt đầu nhận file</label>
                <input
                  type="datetime-local"
                  value={editStartAt}
                  onChange={(e) => setEditStartAt(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hạn chót kết thúc</label>
                <input
                  type="datetime-local"
                  value={editEndAt}
                  onChange={(e) => setEditEndAt(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updatingDeadline}
                  className="px-4 py-2 bg-[#005F3E] text-white rounded-lg text-xs font-bold hover:bg-[#004d32] disabled:opacity-50"
                >
                  {updatingDeadline ? 'Đang lưu...' : 'Lưu thời hạn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấp Gia Hạn Riêng */}
      {extendingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                Cấp Gia Hạn Riêng Cho Đơn Vị
              </h3>
              <button
                onClick={() => setExtendingExam(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Đợt: <strong>{extendingExam.title}</strong>
            </p>

            <form onSubmit={handleGrantExtension} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn đơn vị cần gia hạn <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(Number(e.target.value))}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                >
                  <option value="">-- Chọn đơn vị --</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code} - {u.unit_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hạn chót mới cho đơn vị <span className="text-rose-600">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newExtensionEndAt}
                  onChange={(e) => setNewExtensionEndAt(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do gia hạn <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  placeholder="VD: Đơn vị gặp sự cố mạng hoặc có chỉ đạo bổ sung rà soát..."
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setExtendingExam(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={granting}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
                >
                  {granting ? 'Đang cấp...' : 'Xác nhận cấp gia hạn'}
                </button>
              </div>
            </form>

            {/* Danh sách đã gia hạn */}
            {existingExtensions.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Các đơn vị đang được gia hạn ({existingExtensions.length}):</h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {existingExtensions.map((ext: any) => (
                    <div key={ext.id} className="p-2 bg-slate-50 border rounded-lg text-[11px] flex justify-between items-center">
                      <div>
                        <strong className="text-slate-800">{ext.unit_code} - {ext.unit_name}</strong>
                        <div className="text-slate-500">Lý do: {ext.reason}</div>
                      </div>
                      <div className="text-right font-mono text-[#A81D22] font-bold">
                        {new Date(ext.new_end_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
