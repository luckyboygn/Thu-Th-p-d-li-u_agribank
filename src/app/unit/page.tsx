'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, 
  Download, RefreshCw, Send, History, LogOut, Building, Calendar,
  Search, Eye, ShieldCheck, ChevronRight, FileText, Info, Key, UploadCloud,
  Building2, GraduationCap, Layers, Filter, Clock, Check, ChevronLeft,
  AlertCircle, ArrowRight, Lock, Home, UserPlus
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { ERROR_LABELS, getErrorLabel, getErrorDescription, getErrorBadgeClass } from '@/lib/error-labels';
import DeadlineBanner from '@/components/DeadlineBanner';

interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  role: string;
  unitId: number;
  unitCode?: string;
  unitName?: string;
}

interface UnitRow {
  unitId: number;
  unitCode: string;
  unitName: string;
  userAccount?: string;
  uploadId: number | null;
  version: number | null;
  fileName: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  candidateStatus: 'CHƯA_UPLOAD' | 'GỬI_CHÍNH_THỨC' | 'HỢP_LỆ' | 'CÓ_LỖI';
  trainingSubmissionId: number | null;
  trainingProgramsCount: number;
  trainingParticipantsCount: number;
  trainingStatus: 'CHƯA_KÊ_KHAI' | 'ĐANG_SOẠN' | 'ĐÃ_GỬI_CHÍNH_THỨC' | 'MỞ_LẠI';
  overallStatus: 'CHƯA_NỘP' | 'ĐÃ_NỘP' | 'CÓ_LỖI' | 'ĐANG_SOẠN';
  lastUpdated: string | null;
}

interface AdminSummary {
  totalUnits: number;
  uploadedUnits: number;
  pendingUnits: number;
  completedUnits: number;
  errorUnits: number;
  totalCandidates: number;
  validCandidates: number;
  errorCandidates: number;
  trainingSubmittedCount: number;
  trainingPendingCount: number;
  trainingDraftCount: number;
  totalTrainingDemand: number;
  masterEmployeesCount: number;
}

interface UnitDashboardData {
  unit: { id: number; unit_code: string; unit_name: string; user_account?: string };
  exam: { id: number; code: string; title: string; status: string; start_at?: string | null; end_at?: string | null } | null;
  allExams?: Array<{ id: number; code: string; title: string; status: string; start_date?: string; end_date?: string; start_at?: string | null; end_at?: string | null }>;
  forms?: any[];
  latestUpload: any | null;
  errors: any[];
  uploadHistory: any[];
  deadlineExtension?: { new_end_at: string; reason: string } | null;
  reopenInfo?: { reason: string; reopened_at: string; reopened_by_name?: string } | null;
}

function UnitDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<UserInfo | null>(null);
  const [data, setData] = useState<UnitDashboardData | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Training demand data for unit overview
  const [trainingData, setTrainingData] = useState<any | null>(null);

  // Tab views: TASKS (Việc cần làm), CANDIDATES (Danh sách thí sinh), TRAINING (Khảo sát đào tạo), HISTORY (Lịch sử gửi file), NETWORK (Tổng quan mạng lưới)
  const [activeTab, setActiveTab] = useState<'TASKS' | 'CANDIDATES' | 'TRAINING' | 'HISTORY' | 'NETWORK'>('TASKS');
  const [candidatesSubTab, setCandidatesSubTab] = useState<'ERRORS' | 'RECORDS' | 'HISTORY'>('ERRORS');

  // Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState<'IDLE' | 'READING' | 'VALIDATING' | 'DONE'>('IDLE');
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [selectedHeaderRow, setSelectedHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({ employeeCodeCol: '', elearningAccountCol: '', fullNameCol: '' });

  // Modal confirm submit
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submittingOfficial, setSubmittingOfficial] = useState(false);

  // Error Table filtering & pagination
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('ALL');
  const [errorSearchQuery, setErrorSearchQuery] = useState<string>('');
  const [errorPage, setErrorPage] = useState<number>(1);
  const errorPageSize = 15;

  // Records viewer states
  const [records, setRecords] = useState<any[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsFilter, setRecordsFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [recordsSearchQuery, setRecordsSearchQuery] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // 1.6 Đề nghị bổ sung cán bộ & Kiểm tra lại (Revalidate)
  const [showEmpReqModal, setShowEmpReqModal] = useState(false);
  const [empReqForm, setEmpReqForm] = useState({ employeeCode: '', elearningAccount: '', fullName: '', position: '', reason: '' });
  const [submittingEmpReq, setSubmittingEmpReq] = useState(false);
  const [revalidating, setRevalidating] = useState(false);

  // Sync tab with URL query parameter
  useEffect(() => {
    if (tabParam === 'CANDIDATES' || tabParam === 'ERRORS' || tabParam === 'UPLOAD') {
      setActiveTab('CANDIDATES');
      setCandidatesSubTab('ERRORS');
    } else if (tabParam === 'RECORDS') {
      setActiveTab('CANDIDATES');
      setCandidatesSubTab('RECORDS');
    } else if (tabParam === 'HISTORY') {
      setActiveTab('HISTORY');
    } else if (tabParam === 'TRAINING') {
      setActiveTab('TRAINING');
    } else if (tabParam === 'NETWORK' || tabParam === 'OVERVIEW') {
      setActiveTab('NETWORK');
    } else if (tabParam === 'TASKS') {
      setActiveTab('TASKS');
    }
  }, [tabParam]);

  // Network overview states (all units)
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [unitList, setUnitList] = useState<UnitRow[]>([]);
  const [networkSearch, setNetworkSearch] = useState('');
  const [networkStatusFilter, setNetworkStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'DRAFT' | 'ERROR' | 'NOT_YET'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'CANDIDATE_LIST' | 'TRAINING_DEMAND'>('ALL');

  const loadData = async (examId?: number, catFilter = categoryFilter) => {
    try {
      setLoading(true);
      const userRes = await fetch('/api/auth/me');
      if (!userRes.ok) {
        router.push('/login');
        return;
      }
      const userData = await userRes.json();
      setUser(userData.user);

      const targetExamId = examId || selectedExamId;
      
      // 1. Fetch dữ liệu riêng của đơn vị hiện tại
      const res = await fetch(`/api/dashboard/unit${targetExamId ? `?examId=${targetExamId}` : ''}`);
      const dashData = await res.json();
      setData(dashData);
      const resolvedExamId = dashData.exam?.id || targetExamId || null;
      setSelectedExamId(resolvedExamId);

      // 2. Fetch khảo sát nhu cầu đào tạo của đơn vị
      try {
        const tdRes = await fetch('/api/training-demand');
        if (tdRes.ok) {
          const tdJson = await tdRes.json();
          setTrainingData(tdJson);
        }
      } catch (tdErr) {
        console.error('Error fetching training demand:', tdErr);
      }

      // 3. Fetch dữ liệu toàn mạng lưới (toàn bộ đơn vị)
      try {
        const queryParams = new URLSearchParams();
        if (resolvedExamId) queryParams.set('examId', String(resolvedExamId));
        if (catFilter !== 'ALL') queryParams.set('formFilter', catFilter);
        const adminRes = await fetch(`/api/dashboard/admin?${queryParams.toString()}`);
        if (adminRes.ok) {
          const adminData = await adminRes.json();
          setAdminSummary(adminData.summary);
          setUnitList(adminData.unitList || []);
        }
      } catch (adminErr) {
        console.error('Error fetching network overview:', adminErr);
      }

      if (dashData.latestUpload?.id) {
        loadRecords(dashData.latestUpload.id, 1, recordsFilter, recordsSearchQuery);
      } else {
        setRecords([]);
        setRecordsTotal(0);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (uploadId: number, page = 1, status = 'ALL', q = '') => {
    try {
      setLoadingRecords(true);
      const url = `/api/records?uploadId=${uploadId}&page=${page}&limit=20&status=${status}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const resData = await res.json();
      if (res.ok) {
        setRecords(resData.records || []);
        setRecordsTotal(resData.total || 0);
        setRecordsPage(resData.page || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. CHỌN FILE VÀ GỌI PREVIEW
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data?.exam?.id) return;

    setSelectedFile(file);
    setUploading(true);
    setUploadStep('READING');
    setUploadProgress(25);
    setActionMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('examId', String(data.exam.id));
      formData.append('mode', 'preview');

      setUploadProgress(50);
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(85);
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Lỗi khi đọc file preview.');
      }

      setPreviewData(resData);
      setSelectedSheet(resData.selectedSheet || resData.sheets[0]);
      setSelectedHeaderRow(resData.detectedHeaderRow);
      setMapping(resData.suggestedMapping);
      setShowPreviewModal(true);
      setUploadProgress(100);
      setUploadStep('IDLE');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
      setUploadStep('IDLE');
    } finally {
      setUploading(false);
    }
  };

  // 2. XÁC NHẬN MAPPING VÀ CHẠY VALIDATION THỰC TẾ
  const handleExecuteUpload = async () => {
    if (!selectedFile || !data?.exam?.id) return;

    setUploading(true);
    setUploadStep('VALIDATING');
    setUploadProgress(30);
    setShowPreviewModal(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('examId', String(data.exam.id));
      formData.append('sheetName', selectedSheet);
      formData.append('headerRowIndex', String(selectedHeaderRow));
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('mode', 'execute');

      setUploadProgress(65);
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(90);
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Lỗi khi upload và đối chiếu kiểm tra file.');
      }

      setUploadProgress(100);
      setUploadStep('DONE');
      setActionMessage({
        type: resData.errorRows === 0 ? 'success' : 'error',
        text: `Đã xử lý xong phiên bản v${resData.version}: ${resData.validRows}/${resData.totalRows} cán bộ hợp lệ. ${resData.errorRows > 0 ? `Phát hiện ${resData.errorRows} dòng lỗi cần khắc phục.` : 'Tất cả thông tin hoàn toàn hợp lệ!'}`
      });

      await loadData();
      setActiveTab('CANDIDATES');
      setCandidatesSubTab('ERRORS');
      setErrorPage(1);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      setUploadStep('IDLE');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 3. XÁC NHẬN GỬI CHÍNH THỨC
  const handleConfirmOfficialSubmit = async () => {
    if (!data?.latestUpload?.id) return;
    if (data.latestUpload.error_rows > 0) {
      setActionMessage({ type: 'error', text: 'Không thể gửi chính thức khi file vẫn còn lỗi. Vui lòng khắc phục lỗi và upload lại.' });
      setShowConfirmModal(false);
      return;
    }

    try {
      setSubmittingOfficial(true);
      const res = await fetch('/api/confirm-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: data.latestUpload.id }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi gửi chính thức.');

      setActionMessage({ type: 'success', text: 'Đã xác nhận gửi chính thức danh sách thí sinh thành công!' });
      setShowConfirmModal(false);
      await loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingOfficial(false);
    }
  };

  // 1.6 Kiểm tra lại (Revalidate) upload hiện có
  const handleRevalidateUpload = async () => {
    if (!data?.latestUpload?.id) return;
    setRevalidating(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/uploads/${data.latestUpload.id}/revalidate`, { method: 'POST' });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi đối chiếu lại danh sách.');

      setActionMessage({
        type: resData.errorRows === 0 ? 'success' : 'error',
        text: resData.message || 'Đã đối chiếu lại dữ liệu thành công!'
      });
      await loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setRevalidating(false);
    }
  };

  // 1.6 Mở modal đề nghị bổ sung cán bộ
  const handleOpenEmpReq = (errRow: any) => {
    setEmpReqForm({
      employeeCode: errRow.employee_code || '',
      elearningAccount: errRow.elearning_account || '',
      fullName: '',
      position: '',
      reason: ''
    });
    setShowEmpReqModal(true);
  };

  const handleSubmitEmpReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.exam?.id) return;
    setSubmittingEmpReq(true);
    try {
      const res = await fetch('/api/employee-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: data.exam.id,
          employeeCode: empReqForm.employeeCode,
          elearningAccount: empReqForm.elearningAccount,
          fullName: empReqForm.fullName,
          position: empReqForm.position,
          reason: empReqForm.reason
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi gửi đề nghị.');

      setActionMessage({ type: 'success', text: 'Đã gửi đề nghị bổ sung cán bộ tới Ban Quản trị!' });
      setShowEmpReqModal(false);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingEmpReq(false);
    }
  };

  const latest = data?.latestUpload;
  const isOfficial = latest?.status === 'OFFICIAL_SUBMITTED';
  const hasErrors = (latest?.error_rows || 0) > 0;
  const rawErrors = data?.errors || [];

  // Thống kê lỗi theo từng loại (Summary badges)
  const errorSummaryByType = useMemo(() => {
    const summary: Record<string, number> = {};
    rawErrors.forEach((err: any) => {
      const type = err.error_type || 'UNKNOWN';
      summary[type] = (summary[type] || 0) + 1;
    });
    return summary;
  }, [rawErrors]);

  // Lọc và tìm kiếm bảng lỗi
  const filteredErrors = useMemo(() => {
    return rawErrors.filter((err: any) => {
      if (errorTypeFilter !== 'ALL' && err.error_type !== errorTypeFilter) {
        return false;
      }
      if (errorSearchQuery.trim()) {
        const q = errorSearchQuery.trim().toLowerCase();
        const matchRow = String(err.row_index).includes(q);
        const matchEmp = (err.employee_code || '').toLowerCase().includes(q);
        const matchElearning = (err.elearning_account || '').toLowerCase().includes(q);
        const matchMsg = (err.error_message || '').toLowerCase().includes(q);
        if (!matchRow && !matchEmp && !matchElearning && !matchMsg) return false;
      }
      return true;
    });
  }, [rawErrors, errorTypeFilter, errorSearchQuery]);

  // Phân trang bảng lỗi
  const totalErrorPages = Math.max(1, Math.ceil(filteredErrors.length / errorPageSize));
  const paginatedErrors = useMemo(() => {
    const start = (errorPage - 1) * errorPageSize;
    return filteredErrors.slice(start, start + errorPageSize);
  }, [filteredErrors, errorPage, errorPageSize]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#005F3E] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 text-sm font-medium">Đang tải không gian làm việc của đơn vị...</p>
        </div>
      </div>
    );
  }

  const myUnitId = data?.unit?.id;

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        className="hidden"
        disabled={uploading || isOfficial || data?.exam?.status === 'CLOSED'}
      />

      {/* Deadline Countdown Banner */}
      {data?.exam && (
        <DeadlineBanner
          title={`Kỳ thi "${data.exam.title}"`}
          startAt={data.exam.start_at}
          endAt={data.deadlineExtension?.new_end_at || data.exam.end_at}
          status={data.exam.status}
          isExtended={!!data.deadlineExtension}
          extensionReason={data.deadlineExtension?.reason}
        />
      )}

      {/* 1.4 Banner thông báo bài nộp đã được Quản trị viên mở lại */}
      {latest?.status === 'REOPENED' && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
            <RefreshCw className="w-4 h-4 animate-spin" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                BÀI NỘP ĐƯỢC MỞ LẠI
              </span>
              <span className="text-xs text-amber-700 font-medium">
                Quản trị viên đã mở lại quyền chỉnh sửa danh sách thí sinh
              </span>
            </div>
            <p className="text-xs font-semibold text-amber-950 mt-1.5 bg-white/80 p-2.5 rounded-lg border border-amber-200/60">
              <span className="font-bold text-amber-900">Lý do mở lại: </span>
              {data?.reopenInfo?.reason || 'Vui lòng kiểm tra lại thông tin thí sinh, khắc phục sai lệch và nộp lại bản mới.'}
            </p>
            <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
              <span>Đơn vị có thể tải lên file Excel mới để cập nhật danh sách và nộp lại chính thức.</span>
            </p>
          </div>
        </div>
      )}

      {/* TOP HEADER CARD: Unit Title & Active Exam Selector */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span>CỔNG KÊ KHAI ĐƠN VỊ</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>MÃ ĐƠN VỊ: {data?.unit?.unit_code}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#005F3E] flex items-center gap-2 mt-0.5">
            <span>{data?.unit?.unit_name || 'Chi nhánh Agribank'}</span>
            <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              {data?.unit?.user_account || user?.username}
            </span>
          </h2>
        </div>

        {/* Exam Selector and Refresh */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
            <select
              value={selectedExamId || ''}
              onChange={(e) => loadData(parseInt(e.target.value))}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            >
              {data?.allExams?.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.code}) — {ex.status === 'OPEN' ? 'Đang mở tiếp nhận' : 'Đã đóng'}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadData()}
            title="Làm mới dữ liệu"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* ACTION MESSAGES */}
      {actionMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          actionMessage.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <div className="flex items-center gap-3 text-xs sm:text-sm font-medium">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* TOP TAB NAVIGATION BAR (Thống nhất 4 tab rõ ràng) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-1.5 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('TASKS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'TASKS'
              ? 'bg-[#005F3E] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Việc cần làm</span>
          {(hasErrors || (!latest && data?.exam?.status === 'OPEN')) && (
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('CANDIDATES');
            setCandidatesSubTab('ERRORS');
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'CANDIDATES'
              ? 'bg-[#005F3E] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Danh sách thí sinh</span>
          {hasErrors ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#A81D22] text-white">
              {latest.error_rows} lỗi
            </span>
          ) : isOfficial ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
              Đã nộp
            </span>
          ) : latest ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
              0 lỗi
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveTab('TRAINING')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'TRAINING'
              ? 'bg-[#005F3E] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Khảo sát đào tạo</span>
          {trainingData?.submission?.status === 'SUBMITTED' ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
              Đã gửi
            </span>
          ) : trainingData?.submission?.status === 'DRAFT' ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-900">
              Đang soạn
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'HISTORY'
              ? 'bg-[#005F3E] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lịch sử gửi file ({data?.uploadHistory?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('NETWORK')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ml-auto ${
            activeTab === 'NETWORK'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Tổng quan mạng lưới ({adminSummary?.totalUnits || unitList?.length || 155} ĐV)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: VIỆC CẦN LÀM (MẶC ĐỊNH - HIỂN THỊ TRẠNG THÁI CHÍNH ĐƠN VỊ MÌNH) */}
      {/* ========================================================================= */}
      {activeTab === 'TASKS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* THẺ 1: TIẾN ĐỘ THI NGHIỆP VỤ */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Danh sách Cán bộ thi nghiệp vụ</h3>
                      <p className="text-[11px] text-slate-500">{data?.exam?.title || 'Kỳ thi đang diễn ra'}</p>
                    </div>
                  </div>
                  {/* Status Badge */}
                  {!latest ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      Chưa nộp file
                    </span>
                  ) : isOfficial ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Đã gửi chính thức
                    </span>
                  ) : hasErrors ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-[#A81D22] border border-rose-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Còn {latest.error_rows} lỗi
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Hợp lệ - Chờ gửi
                    </span>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[11px] text-slate-500 font-medium">Phiên bản</div>
                      <div className="text-base font-bold text-slate-800 mt-0.5">
                        {latest ? `v${latest.version}` : '-'}
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                      <div className="text-[11px] text-emerald-700 font-medium">Hợp lệ</div>
                      <div className="text-base font-bold text-emerald-700 mt-0.5">
                        {latest?.valid_rows || 0}
                      </div>
                    </div>
                    <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                      <div className="text-[11px] text-rose-700 font-medium">Số lỗi</div>
                      <div className="text-base font-bold text-rose-700 mt-0.5">
                        {latest?.error_rows || 0}
                      </div>
                    </div>
                  </div>

                  {latest && (
                    <div className="text-xs text-slate-500 space-y-1 pt-2">
                      <p>
                        <span className="font-semibold text-slate-700">File gần nhất:</span> {latest.file_name}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Thời gian cập nhật:</span>{' '}
                        {new Date(latest.created_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  )}

                  {!latest && (
                    <p className="text-xs text-slate-500 italic py-2">
                      Đơn vị chưa nạp file danh sách thí sinh dự thi. Vui lòng tải file mẫu Excel và nộp danh sách để hệ thống tiến hành đối chiếu.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <a
                  href="/api/export?type=template"
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải file Excel mẫu</span>
                </a>

                <div className="flex items-center gap-2">
                  {isOfficial && (
                    <Link
                      href={latest?.receipt_code ? `/unit/receipt?code=${latest.receipt_code}` : `/unit/receipt?type=EXAM_UPLOAD&id=${latest?.id}`}
                      target="_blank"
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#005F3E] border border-emerald-300 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                      title="Mở hoặc in Tờ biên nhận điện tử"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Biên nhận</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('CANDIDATES');
                      setCandidatesSubTab('ERRORS');
                    }}
                    className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span>{isOfficial ? 'Xem danh sách đã gửi' : hasErrors ? 'Khắc phục lỗi ngay' : 'Đến trang nộp file'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* THẺ 2: TIẾN ĐỘ KHẢO SÁT NHU CẦU ĐÀO TẠO */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Khảo sát Nhu cầu Đào tạo</h3>
                      <p className="text-[11px] text-slate-500">
                        {trainingData?.collection?.title || 'Đợt khảo sát nhu cầu đào tạo'}
                      </p>
                    </div>
                  </div>
                  {/* Status Badge */}
                  {trainingData?.submission?.status === 'SUBMITTED' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Đã gửi chính thức
                    </span>
                  ) : trainingData?.submission?.status === 'REOPENED' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                      Mở lại để sửa
                    </span>
                  ) : trainingData?.submission?.status === 'DRAFT' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Đang soạn thảo
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      Chưa kê khai
                    </span>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-100">
                      <div className="text-[11px] text-teal-700 font-medium">Chương trình đã chọn</div>
                      <div className="text-base font-bold text-teal-800 mt-0.5">
                        {trainingData?.summary?.programCount || trainingData?.declaredPrograms?.length || 0}
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                      <div className="text-[11px] text-emerald-700 font-medium">Tổng số người đăng ký</div>
                      <div className="text-base font-bold text-emerald-800 mt-0.5">
                        {trainingData?.summary?.totalParticipants || 0}
                      </div>
                    </div>
                  </div>

                  {trainingData?.submission ? (
                    <div className="text-xs text-slate-500 space-y-1 pt-2">
                      <p>
                        <span className="font-semibold text-slate-700">Mã đợt:</span>{' '}
                        {trainingData?.collection?.code || 'KS_2026'}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Cập nhật lúc:</span>{' '}
                        {new Date(trainingData.submission.updated_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-2">
                      Đơn vị chưa tiến hành đăng ký nhu cầu đào tạo. Hãy vào khảo sát để chọn các chuyên đề trong khung và ngoài khung cần đào tạo năm 2026.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {trainingData?.collection?.status === 'OPEN' ? 'Đợt khảo sát đang mở' : 'Đợt khảo sát đã kết thúc'}
                </span>

                <div className="flex items-center gap-2">
                  {trainingData?.submission?.status === 'SUBMITTED' && (
                    <Link
                      href={trainingData?.submission?.receipt_code ? `/unit/receipt?code=${trainingData.submission.receipt_code}` : `/unit/receipt?type=TRAINING_DEMAND&id=${trainingData?.submission?.id}`}
                      target="_blank"
                      className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                      title="Mở hoặc in Tờ biên nhận khảo sát đào tạo điện tử"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Biên nhận</span>
                    </Link>
                  )}
                  <Link
                    href="/unit/training-demand"
                    className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span>
                      {trainingData?.submission?.status === 'SUBMITTED' ? 'Xem phiếu khảo sát' : 'Vào kê khai đào tạo'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* HƯỚNG DẪN & QUY ĐỊNH BẮT BUỘC */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#005F3E]" />
              <span>Quy định nộp dữ liệu và đối chiếu kiểm tra 2 chiều</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black">1</span>
                  <span>Kiểm tra 2 chiều CSDL</span>
                </div>
                <p>
                  Mã cán bộ và tài khoản eLearning phải khớp đúng 100% với cùng một người trong CSDL nhân sự toàn hàng.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black">2</span>
                  <span>Khắc phục lỗi trực tiếp</span>
                </div>
                <p>
                  Xem danh sách dòng lỗi, chỉnh sửa file Excel và upload lại (v2, v3...) cho đến khi số lỗi giảm về 0.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-black">3</span>
                  <span>Xác nhận gửi chính thức</span>
                </div>
                <p>
                  Khi 0 lỗi, bấm "Xác nhận gửi chính thức" để hoàn tất nghĩa vụ báo cáo. Dữ liệu sẽ khóa và chuyển về BTC.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DANH SÁCH THÍ SINH (UPLOAD + BÁO LỖI + TOÀN BỘ DANH SÁCH) */}
      {/* ========================================================================= */}
      {activeTab === 'CANDIDATES' && (
        <div className="space-y-6">
          {/* KHU VỰC TẢI LÊN EXCEL & THANH HÀNH ĐỘNG */}
          <div className="bg-white rounded-2xl shadow-xs border border-emerald-200 p-6 bg-gradient-to-r from-emerald-50/50 via-white to-amber-50/20 space-y-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-[#005F3E] text-white rounded-xl shadow-xs">
                    <FileSpreadsheet className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                      {latest ? `Nộp lại file Excel (Phiên bản hiện tại: v${latest.version})` : 'Nạp file Excel danh sách cán bộ'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      File định dạng .xlsx / .xls theo biểu mẫu chuẩn của Agribank. Hệ thống tự động đối chiếu ngay khi upload.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Nút Tải File Excel Mẫu */}
                <a
                  href="/api/export?type=template"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-xs transition-colors"
                  title="Tải file mẫu Excel chuẩn"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải File Mẫu</span>
                </a>

                {/* Nút Chọn File / Nộp Lại */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || isOfficial || data?.exam?.status === 'CLOSED'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Đang xử lý...' : isOfficial ? 'Đã khóa nộp' : latest ? 'Chọn file nộp bản mới' : 'Chọn file Excel nộp'}</span>
                </button>

                {/* Nút Gửi chính thức (Chỉ bật khi 0 lỗi và chưa nộp chính thức) */}
                {latest && !isOfficial && (
                  user?.role === 'UNIT_PREPARER' ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold" title="Tài khoản Người lập (Maker) hoàn thiện danh sách và trình Lãnh đạo duyệt">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Đã nạp bản kê (Chờ Người duyệt gửi chính thức)</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={hasErrors || uploading}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors ${
                        !hasErrors && !uploading
                          ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      }`}
                      title={hasErrors ? 'Vui lòng sửa toàn bộ lỗi trước khi gửi chính thức' : 'Xác nhận gửi danh sách chính thức lên Ban Tổ Chức'}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi chính thức</span>
                    </button>
                  )
                )}

                {/* Huy hiệu Đã gửi chính thức kèm thời gian & Nút xem biên nhận */}
                {isOfficial && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Đã gửi chính thức {latest.submitted_at ? `(${new Date(latest.submitted_at).toLocaleDateString('vi-VN')})` : ''}</span>
                    </div>
                    <Link
                      href={latest.receipt_code ? `/unit/receipt?code=${latest.receipt_code}` : `/unit/receipt?type=EXAM_UPLOAD&id=${latest.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      title="Mở hoặc in Tờ biên nhận nộp điện tử chính thức"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Xem biên nhận nộp</span>
                    </Link>
                  </div>
                )}

                {/* Tải kết quả Excel */}
                {latest && (
                  <a
                    href={`/api/export?type=unit&uploadId=${latest.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Tải kết quả</span>
                  </a>
                )}
              </div>
            </div>

            {/* Thanh tiến trình trạng thái Upload */}
            {uploading && (
              <div className="pt-3 border-t border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span className="text-[#005F3E] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
                    <span>
                      {uploadStep === 'READING' ? 'Đang đọc và phân tích cấu trúc file Excel...' :
                       uploadStep === 'VALIDATING' ? 'Đang chạy đối chiếu 2 chiều với CSDL nhân sự...' :
                       'Hoàn tất xử lý.'}
                    </span>
                  </span>
                  <span className="font-bold text-slate-900">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#005F3E] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* SUB-TABS: BÁO LỖI / DANH SÁCH HỢP LỆ */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
            <button
              onClick={() => setCandidatesSubTab('ERRORS')}
              className={`pb-2 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                candidatesSubTab === 'ERRORS'
                  ? 'border-[#005F3E] text-[#005F3E]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Kết quả đối chiếu & Lỗi ({rawErrors.length})</span>
            </button>

            <button
              onClick={() => {
                setCandidatesSubTab('RECORDS');
                if (latest?.id) loadRecords(latest.id, 1, recordsFilter, recordsSearchQuery);
              }}
              className={`pb-2 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                candidatesSubTab === 'RECORDS'
                  ? 'border-[#005F3E] text-[#005F3E]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Toàn bộ danh sách ({latest?.total_rows || 0})</span>
            </button>
          </div>

          {/* SUB-TAB 1: BẢNG BÁO LỖI */}
          {candidatesSubTab === 'ERRORS' && (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden space-y-4 p-5">
              {!latest ? (
                <div className="p-12 text-center">
                  <UploadCloud className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-800 text-base">Chưa có file nào được nạp</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Vui lòng bấm nút <strong>"Chọn file Excel nộp"</strong> ở trên để hệ thống tiến hành đối chiếu.
                  </p>
                </div>
              ) : rawErrors.length === 0 ? (
                <div className="p-12 text-center bg-emerald-50/30 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="w-12 h-12 text-[#005F3E] mx-auto mb-3" />
                  <h4 className="font-bold text-slate-900 text-base">
                    Tuyệt vời! Toàn bộ {latest.valid_rows} bản ghi đều hợp lệ (0 lỗi).
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Danh sách cán bộ của đơn vị đã hoàn toàn khớp đúng hai chiều với CSDL nhân sự toàn hệ thống.
                  </p>
                  {!isOfficial && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowConfirmModal(true)}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        <span>Xác nhận gửi chính thức ngay</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* TÓM TẮT SỐ LỖI & CẢNH BÁO THEO TỪNG LOẠI Ở ĐẦU BẢNG (Badges) */}
                  <div>
                    <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Chi tiết phản hồi ({rawErrors.length}):</span>
                        {latest?.error_rows > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            {latest.error_rows} lỗi bắt buộc sửa
                          </span>
                        )}
                        {(latest?.warning_rows || 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            {latest.warning_rows} cảnh báo (không chặn nộp)
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-normal">Bấm vào nhãn để lọc nhanh</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setErrorTypeFilter('ALL');
                          setErrorPage(1);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                          errorTypeFilter === 'ALL'
                            ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Tất cả ({rawErrors.length})
                      </button>

                      {Object.entries(errorSummaryByType).map(([type, count]) => {
                        const isSelected = errorTypeFilter === type;
                        const label = getErrorLabel(type);
                        const isWarning = type === 'UNIT_MISMATCH';
                        const activeColor = isWarning
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-bold'
                          : 'bg-[#A81D22] text-white border-[#A81D22] shadow-xs font-bold';
                        const inactiveColor = isWarning
                          ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100';

                        return (
                          <button
                            key={type}
                            onClick={() => {
                              setErrorTypeFilter(isSelected ? 'ALL' : type);
                              setErrorPage(1);
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                              isSelected ? activeColor : inactiveColor
                            }`}
                          >
                            <span>{label}</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 font-bold">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* THANH TÌM KIẾM VÀ LỌC LỖI */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                      <div className="relative w-full">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={errorSearchQuery}
                          onChange={(e) => {
                            setErrorSearchQuery(e.target.value);
                            setErrorPage(1);
                          }}
                          placeholder="Tìm theo số dòng, mã cán bộ, tài khoản..."
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRevalidateUpload}
                        disabled={revalidating || !latest?.id || isOfficial}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#005F3E] rounded-xl text-xs font-bold border border-emerald-300 disabled:opacity-50 transition-colors"
                        title="Đối chiếu lại danh sách với Master DB mà không cần tải lại file Excel"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin' : ''}`} />
                        <span>{revalidating ? 'Đang kiểm tra...' : 'Kiểm tra lại (Revalidate)'}</span>
                      </button>
                      <a
                        href={`/api/export?type=errors&uploadId=${latest?.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-[#A81D22] rounded-xl text-xs font-bold border border-rose-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải danh sách lỗi ({rawErrors.length})</span>
                      </a>
                    </div>
                  </div>

                  {/* BẢNG LỖI VỚI NHÃN TIẾNG VIỆT HÀNH CHÍNH */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#F8F9FA] text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 w-16 text-center">Dòng</th>
                          <th className="px-4 py-3 w-32 font-mono">Mã cán bộ</th>
                          <th className="px-4 py-3 w-36 font-mono">Tài khoản eLearning</th>
                          <th className="px-4 py-3 w-48">Phân loại lỗi</th>
                          <th className="px-4 py-3">Nội dung chi tiết & Hướng dẫn sửa</th>
                          <th className="px-4 py-3 w-28 text-right pr-5">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedErrors.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                              Không tìm thấy dòng lỗi nào phù hợp với bộ lọc tìm kiếm.
                            </td>
                          </tr>
                        ) : (
                          paginatedErrors.map((err: any, idx: number) => {
                            const label = getErrorLabel(err.error_type);
                            const badgeClass = getErrorBadgeClass(err.error_type);
                            const canRequestAdd = ['UNKNOWN_BOTH', 'UNKNOWN_EMPLOYEE_CODE', 'UNKNOWN_ELEARNING', 'WRONG_EMPLOYEE_CODE', 'WRONG_ELEARNING'].includes(err.error_type);

                            const isWarning = err.severity === 'WARNING' || err.error_type === 'UNIT_MISMATCH';

                            return (
                              <tr key={idx} className={`${isWarning ? 'hover:bg-amber-50/40 bg-amber-50/10' : 'hover:bg-rose-50/40'} transition-colors`}>
                                <td className="px-4 py-3 text-center font-bold text-slate-900 bg-slate-50/50">
                                  {err.row_index}
                                </td>
                                <td className="px-4 py-3 font-semibold text-slate-800 font-mono">
                                  {err.employee_code || '<Trống>'}
                                </td>
                                <td className="px-4 py-3 font-mono text-slate-800">
                                  {err.elearning_account || '<Trống>'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${badgeClass}`}>
                                    {label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-700 font-medium">
                                  <div className={`${isWarning ? 'text-amber-800' : 'text-rose-700'} font-semibold`}>
                                    {err.error_message}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{getErrorDescription(err.error_type)}</div>
                                </td>
                                <td className="px-4 py-3 text-right pr-5">
                                  {canRequestAdd && !isOfficial && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEmpReq(err)}
                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap"
                                      title="Gửi yêu cầu đề nghị Ban Quản trị bổ sung cán bộ này vào CSDL Master"
                                    >
                                      Đề nghị bổ sung
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* PHÂN TRANG BẢNG LỖI */}
                  {filteredErrors.length > errorPageSize && (
                    <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
                      <span>
                        Hiển thị {paginatedErrors.length} / {filteredErrors.length} dòng lỗi (Trang {errorPage} / {totalErrorPages})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={errorPage <= 1}
                          onClick={() => setErrorPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Trước
                        </button>
                        <span className="px-2 font-bold">{errorPage}</span>
                        <button
                          disabled={errorPage >= totalErrorPages}
                          onClick={() => setErrorPage((p) => Math.min(totalErrorPages, p + 1))}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: TOÀN BỘ DANH SÁCH BẢN GHI */}
          {candidatesSubTab === 'RECORDS' && (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden space-y-4 p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={recordsSearchQuery}
                      onChange={(e) => setRecordsSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && latest?.id) {
                          loadRecords(latest.id, 1, recordsFilter, recordsSearchQuery);
                        }
                      }}
                      placeholder="Tìm theo Mã CB, eLearning, Họ tên..."
                      className="pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs w-64 focus:ring-2 focus:ring-[#005F3E]"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (latest?.id) loadRecords(latest.id, 1, recordsFilter, recordsSearchQuery);
                    }}
                    className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700"
                  >
                    Tìm
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Lọc theo:</span>
                  <select
                    value={recordsFilter}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setRecordsFilter(val);
                      if (latest?.id) loadRecords(latest.id, 1, val, recordsSearchQuery);
                    }}
                    className="border border-slate-300 rounded-xl text-xs px-3 py-2 focus:ring-2 focus:ring-[#005F3E] font-semibold"
                  >
                    <option value="ALL">Tất cả ({latest?.total_rows || 0})</option>
                    <option value="VALID">Chỉ hợp lệ ({latest?.valid_rows || 0})</option>
                    <option value="INVALID">Chỉ bị lỗi ({latest?.error_rows || 0})</option>
                  </select>
                </div>
              </div>

              {loadingRecords ? (
                <div className="p-8 text-center text-xs text-slate-500">Đang tải bản ghi...</div>
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Không tìm thấy bản ghi nào.</div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-[#F8F9FA] text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-14 text-center">Dòng</th>
                        <th className="px-3 py-2.5 w-28">Trạng thái</th>
                        <th className="px-3 py-2.5 w-28 font-mono">Mã cán bộ</th>
                        <th className="px-3 py-2.5 w-32 font-mono">eLearning</th>
                        <th className="px-3 py-2.5">Họ và tên</th>
                        <th className="px-3 py-2.5">Chức vụ / Phòng ban</th>
                        <th className="px-3 py-2.5">Ngày / Ca thi</th>
                        <th className="px-3 py-2.5">Ghi chú lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r, i) => {
                        const raw = r.rawData || {};
                        const chucVu = raw['Chức danh/chức vụ'] || raw['Chức vụ'] || raw['Phòng ban/chức vụ'] || '-';
                        const caThi = raw['Ca kiểm tra'] || raw['Ngày kiểm tra'] || raw['Ngày thi'] || '-';

                        return (
                          <tr key={i} className={r.validation_status === 'VALID' ? 'hover:bg-slate-50' : 'bg-rose-50/40 hover:bg-rose-50'}>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-800">{r.row_index}</td>
                            <td className="px-3 py-2.5">
                              {r.validation_status === 'VALID' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> HỢP LỆ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <XCircle className="w-3 h-3 text-rose-600" /> LỖI
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{r.employee_code}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-800">{r.elearning_account}</td>
                            <td className="px-3 py-2.5 font-medium">{r.full_name || raw['Họ và tên'] || '-'}</td>
                            <td className="px-3 py-2.5 text-slate-600">{chucVu}</td>
                            <td className="px-3 py-2.5 text-slate-600">{caThi}</td>
                            <td className="px-3 py-2.5 text-rose-600 text-[11px]">{r.validation_message || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Phân trang records */}
              {recordsTotal > 20 && (
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
                  <span>Hiển thị trang {recordsPage} / {Math.ceil(recordsTotal / 20)} ({recordsTotal} bản ghi)</span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={recordsPage <= 1}
                      onClick={() => latest?.id && loadRecords(latest.id, recordsPage - 1, recordsFilter, recordsSearchQuery)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Trước
                    </button>
                    <button
                      disabled={recordsPage >= Math.ceil(recordsTotal / 20)}
                      onClick={() => latest?.id && loadRecords(latest.id, recordsPage + 1, recordsFilter, recordsSearchQuery)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: KHẢO SÁT ĐÀO TẠO (THÔNG TIN TÓM TẮT & CHUYỂN TRANG) */}
      {/* ========================================================================= */}
      {activeTab === 'TRAINING' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-teal-800" />
                <span>Khảo sát Nhu cầu Đào tạo năm 2026</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Thu thập chỉ tiêu học viên đăng ký theo từng chương trình và chuyên đề.
              </p>
            </div>
            <Link
              href="/unit/training-demand"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              <span>Vào trang Khảo sát chi tiết</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Trạng thái hồ sơ</div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {trainingData?.submission?.status === 'SUBMITTED' ? 'Đã gửi chính thức' :
                 trainingData?.submission?.status === 'DRAFT' ? 'Đang soạn thảo' :
                 trainingData?.submission?.status === 'REOPENED' ? 'Mở lại cho sửa' : 'Chưa kê khai'}
              </div>
            </div>

            <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-100">
              <div className="text-xs font-medium text-teal-700">Chương trình đã chọn</div>
              <div className="text-base font-bold text-teal-900 mt-1">
                {trainingData?.summary?.programCount || trainingData?.declaredPrograms?.length || 0} chương trình
              </div>
            </div>

            <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
              <div className="text-xs font-medium text-emerald-700">Tổng lượt người đăng ký</div>
              <div className="text-base font-bold text-emerald-900 mt-1">
                {trainingData?.summary?.totalParticipants || 0} lượt người
              </div>
            </div>
          </div>

          {trainingData?.declaredPrograms && trainingData.declaredPrograms.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Các chương trình đơn vị đã đăng ký:
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {trainingData.declaredPrograms.map((p: any) => (
                  <div key={p.program_id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-slate-900">{p.program_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Mã: {p.program_code} | Nhóm: {p.group_name}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 text-sm">{p.sum_participants}</span>
                      <span className="text-slate-500 text-[11px] ml-1">người</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LỊCH SỬ GỬI FILE & PHIÊN BẢN */}
      {/* ========================================================================= */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-5 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Lịch sử các lần upload & Phiên bản (Version Trail)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Lưu giữ mọi snapshot dữ liệu và kết quả đối chiếu qua các lần sửa đổi của đơn vị.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-[#F8F9FA] text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Phiên bản</th>
                  <th className="px-4 py-3.5">Tên file đã nộp</th>
                  <th className="px-4 py-3.5">Thời gian upload</th>
                  <th className="px-4 py-3.5 text-center">Tổng dòng</th>
                  <th className="px-4 py-3.5 text-center">Hợp lệ</th>
                  <th className="px-4 py-3.5 text-center">Số lỗi</th>
                  <th className="px-4 py-3.5">Trạng thái</th>
                  <th className="px-4 py-3.5 text-right pr-6">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!data?.uploadHistory || data.uploadHistory.length === 0) ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400 text-xs">
                      Chưa có lịch sử upload nào được ghi nhận.
                    </td>
                  </tr>
                ) : (
                  data.uploadHistory.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3.5 font-bold text-slate-900">v{item.version}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-800">{item.file_name}</td>
                      <td className="px-4 py-3.5 text-slate-500">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-3.5 text-center font-bold">{item.total_rows}</td>
                      <td className="px-4 py-3.5 text-center text-emerald-600 font-bold">{item.valid_rows}</td>
                      <td className="px-4 py-3.5 text-center text-rose-600 font-bold">{item.error_rows}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'OFFICIAL_SUBMITTED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          item.error_rows === 0 ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {item.status === 'OFFICIAL_SUBMITTED' ? 'ĐÃ NỘP CHÍNH THỨC' : item.error_rows === 0 ? 'HỢP LỆ' : 'CÓ LỖI'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right pr-6">
                        <a
                          href={`/api/export?type=unit&uploadId=${item.id}`}
                          className="text-emerald-700 hover:underline font-semibold"
                        >
                          Tải file v{item.version}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TỔNG QUAN MẠNG LƯỚI (TAB PHỤ: BẢNG TOÀN BỘ ĐƠN VỊ TỰ XEM NHAU) */}
      {/* ========================================================================= */}
      {activeTab === 'NETWORK' && (() => {
        const filteredUnits = unitList.filter((u) => {
          const matchSearch =
            u.unitCode.toLowerCase().includes(networkSearch.toLowerCase()) ||
            u.unitName.toLowerCase().includes(networkSearch.toLowerCase()) ||
            (u.userAccount && u.userAccount.toLowerCase().includes(networkSearch.toLowerCase()));

          if (!matchSearch) return false;

          if (categoryFilter === 'CANDIDATE_LIST') {
            if (networkStatusFilter === 'SUBMITTED') return u.candidateStatus === 'GỬI_CHÍNH_THỨC' || u.candidateStatus === 'HỢP_LỆ';
            if (networkStatusFilter === 'ERROR') return u.candidateStatus === 'CÓ_LỖI';
            if (networkStatusFilter === 'NOT_YET') return u.candidateStatus === 'CHƯA_UPLOAD';
            return true;
          }

          if (categoryFilter === 'TRAINING_DEMAND') {
            if (networkStatusFilter === 'SUBMITTED') return u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC';
            if (networkStatusFilter === 'DRAFT') return u.trainingStatus === 'ĐANG_SOẠN';
            if (networkStatusFilter === 'NOT_YET') return u.trainingStatus === 'CHƯA_KÊ_KHAI';
            return true;
          }

          if (networkStatusFilter === 'SUBMITTED') return u.overallStatus === 'ĐÃ_NỘP';
          if (networkStatusFilter === 'DRAFT') return u.overallStatus === 'ĐANG_SOẠN';
          if (networkStatusFilter === 'ERROR') return u.overallStatus === 'CÓ_LỖI';
          if (networkStatusFilter === 'NOT_YET') return u.overallStatus === 'CHƯA_NỘP';

          return true;
        });

        const totalUnits = unitList.length;

        return (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden space-y-4">
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Tiến độ Thu thập Dữ liệu Toàn Mạng lưới</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {filteredUnits.length} / {totalUnits} đơn vị
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đơn vị của bạn được đánh dấu viền nổi bật để dễ dàng theo dõi và đối chiếu chéo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Lọc trạng thái */}
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                  <span className="text-slate-400 pl-2">
                    <Filter className="w-3.5 h-3.5" />
                  </span>
                  <button
                    onClick={() => setNetworkStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      networkStatusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setNetworkStatusFilter('SUBMITTED')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      networkStatusFilter === 'SUBMITTED' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    Đã nộp
                  </button>
                  <button
                    onClick={() => setNetworkStatusFilter('NOT_YET')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      networkStatusFilter === 'NOT_YET' ? 'bg-amber-500 text-slate-950 shadow-xs font-bold' : 'text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    Chưa nộp
                  </button>
                  <button
                    onClick={() => setNetworkStatusFilter('ERROR')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      networkStatusFilter === 'ERROR' ? 'bg-[#A81D22] text-white shadow-xs' : 'text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Có lỗi
                  </button>
                </div>

                {/* Tìm kiếm */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={networkSearch}
                    onChange={(e) => setNetworkSearch(e.target.value)}
                    placeholder="Tìm mã ĐV, tên đơn vị..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-[#F8F9FA] text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px]">
                  <tr>
                    <th className="px-5 py-3.5 w-14 text-center">STT</th>
                    <th className="px-5 py-3.5 w-36">Tài khoản</th>
                    <th className="px-5 py-3.5 min-w-[240px]">Tên Đơn vị</th>
                    <th className="px-5 py-3.5 w-24 text-center">Mã ĐV</th>
                    <th className="px-5 py-3.5 w-36 text-center">Danh sách thi</th>
                    <th className="px-5 py-3.5 w-40 text-center">Nhu cầu Đào tạo</th>
                    <th className="px-5 py-3.5 w-32 text-center">Trạng thái chung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                        Không tìm thấy đơn vị nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map((u, i) => {
                      const isCurrentUnit = u.unitId === myUnitId;

                      let candBadge = <span className="text-slate-400 text-[11px] italic">Chưa nộp</span>;
                      if (u.candidateStatus === 'GỬI_CHÍNH_THỨC') {
                        candBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Đã gửi ({u.validRows})
                          </span>
                        );
                      } else if (u.candidateStatus === 'CÓ_LỖI') {
                        candBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-[#A81D22] border border-rose-300">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            Lỗi {u.errorRows} dòng
                          </span>
                        );
                      } else if (u.candidateStatus === 'HỢP_LỆ') {
                        candBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                            Hợp lệ ({u.validRows})
                          </span>
                        );
                      }

                      let trainBadge = <span className="text-slate-400 text-[11px] italic">Chưa đăng ký</span>;
                      if (u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') {
                        trainBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Đã gửi ({u.trainingParticipantsCount})
                          </span>
                        );
                      } else if (u.trainingStatus === 'ĐANG_SOẠN') {
                        trainBadge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Đang soạn ({u.trainingParticipantsCount})
                          </span>
                        );
                      }

                      let overallBadge = <span className="text-slate-400 text-[11px] italic">Chưa hoàn thành</span>;
                      if (u.overallStatus === 'ĐÃ_NỘP') {
                        overallBadge = (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                            HOÀN THÀNH
                          </span>
                        );
                      } else if (u.overallStatus === 'CÓ_LỖI') {
                        overallBadge = (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#A81D22] text-white">
                            CẦN XỬ LÝ LỖI
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={u.unitId}
                          className={`transition-colors ${
                            isCurrentUnit
                              ? 'bg-emerald-50/70 font-semibold ring-1 ring-inset ring-emerald-500/30'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-5 py-3.5 text-center font-bold text-slate-500">{i + 1}</td>
                          <td className="px-5 py-3.5 font-mono text-slate-700">{u.userAccount || '-'}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span>{u.unitName}</span>
                              {isCurrentUnit && (
                                <span className="text-[10px] font-bold text-[#005F3E] bg-emerald-100 px-2 py-0.5 rounded-full">
                                  (Đơn vị của bạn)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-600">{u.unitCode}</td>
                          <td className="px-5 py-3.5 text-center">{candBadge}</td>
                          <td className="px-5 py-3.5 text-center">{trainBadge}</td>
                          <td className="px-5 py-3.5 text-center">{overallBadge}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN GỬI CHÍNH THỨC (A2) */}
      {/* ========================================================================= */}
      {showConfirmModal && latest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">Xác nhận gửi chính thức</h3>
                  <p className="text-[11px] text-slate-500">Chuyển dữ liệu lên Ban Tổ Chức</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kỳ thi / Khảo sát:</span>
                  <span className="font-bold text-slate-900 text-right">{data?.exam?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tên file Excel:</span>
                  <span className="font-bold text-slate-900 truncate max-w-[200px]">{latest.file_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phiên bản gửi:</span>
                  <span className="font-bold text-slate-900">v{latest.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng số cán bộ hợp lệ:</span>
                  <span className="font-bold text-emerald-700 text-sm">{latest.valid_rows} người</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số lượng lỗi:</span>
                  <span className="font-bold text-emerald-700">0 lỗi</span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Lưu ý quan trọng:</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Sau khi gửi chính thức, hồ sơ của đơn vị sẽ được chuyển sang chế độ <strong>"Đã nộp chính thức" (Chỉ xem)</strong>. Đơn vị sẽ không thể upload đè file mới trừ khi được Ban Tổ Chức duyệt mở lại.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submittingOfficial}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmOfficialSubmit}
                disabled={submittingOfficial}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                {submittingOfficial ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Xác nhận gửi chính thức</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW & MAPPING MODAL */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>Xác nhận Cấu trúc & Cột đối chiếu</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  File: {previewData.fileInfo?.name} ({(previewData.fileInfo?.size / 1024).toFixed(1)} KB)
                </p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sheet dữ liệu:</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => setSelectedSheet(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2 text-xs font-semibold focus:ring-2 focus:ring-[#005F3E]"
                  >
                    {previewData.sheets?.map((s: string) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dòng tiêu đề (Header Row trong Excel):
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={selectedHeaderRow + 1}
                    onChange={(e) => setSelectedHeaderRow(Math.max(0, parseInt(e.target.value || '1') - 1))}
                    className="w-full border border-slate-300 rounded-xl p-2 text-xs font-mono font-semibold focus:ring-2 focus:ring-[#005F3E]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Tự động nhận diện ở dòng {selectedHeaderRow + 1}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Mapping cột bắt buộc để xác thực 2 chiều
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-rose-700 mb-1">
                      * Cột Mã cán bộ:
                    </label>
                    <select
                      value={mapping.employeeCodeCol}
                      onChange={(e) => setMapping({ ...mapping, employeeCodeCol: e.target.value })}
                      className="w-full border border-rose-300 bg-rose-50/50 rounded-xl p-2 text-xs font-semibold focus:ring-2 focus:ring-[#005F3E]"
                    >
                      <option value="">-- Chọn cột --</option>
                      {previewData.headers?.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-rose-700 mb-1">
                      * Cột Tài khoản eLearning:
                    </label>
                    <select
                      value={mapping.elearningAccountCol}
                      onChange={(e) => setMapping({ ...mapping, elearningAccountCol: e.target.value })}
                      className="w-full border border-rose-300 bg-rose-50/50 rounded-xl p-2 text-xs font-semibold focus:ring-2 focus:ring-[#005F3E]"
                    >
                      <option value="">-- Chọn cột --</option>
                      {previewData.headers?.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cột Họ và tên:
                    </label>
                    <select
                      value={mapping.fullNameCol}
                      onChange={(e) => setMapping({ ...mapping, fullNameCol: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl p-2 text-xs font-semibold focus:ring-2 focus:ring-[#005F3E]"
                    >
                      <option value="">-- Chọn cột --</option>
                      {previewData.headers?.map((h: string) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">
                  Xem trước 5 dòng dữ liệu mẫu sau tiêu đề:
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-48 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-700">
                      <tr>
                        {previewData.headers?.slice(0, 7).map((h: string, idx: number) => (
                          <th key={idx} className="px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.sampleRows?.map((row: any, rIdx: number) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {previewData.headers?.slice(0, 7).map((h: string, cIdx: number) => (
                            <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap text-slate-600">
                              {String(row[h] !== undefined ? row[h] : '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteUpload}
                disabled={!mapping.employeeCodeCol || !mapping.elearningAccountCol}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác nhận & Chạy đối chiếu 2 chiều</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1.6 Modal Đề nghị bổ sung cán bộ */}
      {showEmpReqModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-amber-500 text-slate-950 font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                <span className="text-sm">Đề nghị bổ sung cán bộ vào CSDL</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmpReqModal(false)}
                className="text-slate-900 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEmpReq} className="p-5 space-y-4 text-xs">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px]">
                Trường hợp nhân sự có trong danh sách đơn vị nhưng chưa được cập nhật trong CSDL Master. Vui lòng cung cấp thông tin để Ban Quản trị phê duyệt bổ sung.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã cán bộ (bắt buộc):</label>
                <input
                  type="text"
                  required
                  value={empReqForm.employeeCode}
                  onChange={(e) => setEmpReqForm({ ...empReqForm, employeeCode: e.target.value })}
                  placeholder="Ví dụ: NV01234"
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tài khoản eLearning (bắt buộc):</label>
                <input
                  type="text"
                  required
                  value={empReqForm.elearningAccount}
                  onChange={(e) => setEmpReqForm({ ...empReqForm, elearningAccount: e.target.value })}
                  placeholder="Ví dụ: nva_1300"
                  className="w-full p-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên cán bộ (bắt buộc):</label>
                <input
                  type="text"
                  required
                  value={empReqForm.fullName}
                  onChange={(e) => setEmpReqForm({ ...empReqForm, fullName: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chức vụ / Vị trí:</label>
                <input
                  type="text"
                  value={empReqForm.position}
                  onChange={(e) => setEmpReqForm({ ...empReqForm, position: e.target.value })}
                  placeholder="Ví dụ: Cán bộ Tín dụng, Kế toán..."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lý do đề nghị (tối thiểu 5 ký tự):</label>
                <textarea
                  rows={2}
                  required
                  value={empReqForm.reason}
                  onChange={(e) => setEmpReqForm({ ...empReqForm, reason: e.target.value })}
                  placeholder="Ví dụ: Cán bộ mới tiếp nhận tháng 01/2026; chuyển công tác từ đơn vị khác..."
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#005F3E] text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEmpReqModal(false)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingEmpReq}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs"
                >
                  {submittingEmpReq ? 'Đang gửi...' : 'Gửi đề nghị bổ sung'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        username={user?.username}
      />
    </div>
  );
}

export default function UnitDashboardPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-600 text-sm">Đang tải...</p>
          </div>
        </div>
      }
    >
      <UnitDashboardContent />
    </React.Suspense>
  );
}
