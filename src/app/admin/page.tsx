'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Search,
  ChevronDown,
  RefreshCw,
  Building2,
  Download,
  AlertTriangle,
  GraduationCap,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
  Eye,
  ArrowUpDown,
  Lock,
  ChevronLeft,
  ChevronRight,
  Calendar
} from 'lucide-react';
import { getErrorLabel } from '@/lib/error-labels';

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

interface UnitRow {
  unitId: number;
  unitCode: string;
  unitName: string;
  userAccount?: string;
  unitType?: string;
  region?: string;
  // Cán bộ / file upload
  uploadId: number | null;
  version: number | null;
  fileName: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  candidateStatus: 'CHƯA_UPLOAD' | 'GỬI_CHÍNH_THỨC' | 'HỢP_LỆ' | 'CÓ_LỖI' | 'MỞ_LẠI';
  candidateStatusLabel?: string;
  candidateSubmittedAt?: string | null;
  // Khảo sát đào tạo
  trainingSubmissionId: number | null;
  trainingProgramsCount: number;
  trainingParticipantsCount: number;
  trainingStatus: 'CHƯA_KÊ_KHAI' | 'ĐANG_SOẠN' | 'ĐÃ_GỬI_CHÍNH_THỨC' | 'MỞ_LẠI';
  trainingStatusLabel?: string;
  trainingSubmittedAt?: string | null;
  // Trạng thái tổng quan
  overallStatus: 'CHƯA_NỘP' | 'ĐÃ_NỘP' | 'CÓ_LỖI' | 'ĐANG_SOẠN' | 'MỞ_LẠI';
  lastUpdated: string | null;
}

const REGION_LABELS: Record<string, string> = {
  MIEN_BAC: 'Miền Bắc',
  MIEN_TRUNG: 'Miền Trung',
  TAY_NGUYEN: 'Tây Nguyên',
  MIEN_NAM: 'Miền Nam',
  HO: 'Trụ sở chính'
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  BRANCH_L1: 'Chi nhánh Loại 1',
  BRANCH_L2: 'Chi nhánh Loại 2',
  HO: 'Trụ sở chính',
  SUBSIDIARY: 'Công ty con / ĐVSN'
};

type SortField = 'unitCode' | 'unitName' | 'totalRows' | 'candidateStatus' | 'trainingParticipantsCount' | 'trainingStatus' | 'overallStatus';
type SortOrder = 'asc' | 'desc';

function AdminDashboardContent() {
  const searchParams = useSearchParams();
  const examIdParam = searchParams.get('examId');
  const collectionIdParam = searchParams.get('collectionId');

  const [currentUser, setCurrentUser] = useState<{ role: string; username: string } | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [regionSummary, setRegionSummary] = useState<Record<string, { total: number; examSubmitted: number; trainingSubmitted: number }>>({});
  const [unitList, setUnitList] = useState<UnitRow[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [activeCampaignTask, setActiveCampaignTask] = useState<string>('CANDIDATE_EXAM');
  const [updatingCampaign, setUpdatingCampaign] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Bộ lọc Dashboard
  const [searchUnit, setSearchUnit] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'DRAFT' | 'ERROR' | 'NOT_YET'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'CANDIDATE_LIST' | 'TRAINING_DEMAND'>('ALL');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Sắp xếp cột & Phân trang (A4)
  const [sortField, setSortField] = useState<SortField>('unitCode');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal chi tiết đơn vị
  const [showUnitDetailModal, setShowUnitDetailModal] = useState(false);
  const [selectedUnitDetail, setSelectedUnitDetail] = useState<UnitRow | null>(null);
  const [unitErrors, setUnitErrors] = useState<any[]>([]);
  const [loadingUnitDetail, setLoadingUnitDetail] = useState(false);

  // 1.4 Modal Mở lại bài nộp (Super Admin)
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<{ type: 'EXAM_UPLOAD' | 'TRAINING_DEMAND'; id: number; unitName: string } | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState('');

  const handleUpdateCampaign = async (newTask: string) => {
    try {
      setUpdatingCampaign(true);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'active_campaign_task', value: newTask })
      });
      if (res.ok) {
        setActiveCampaignTask(newTask);
      } else {
        const errJson = await res.json();
        alert(errJson.error || 'Lỗi khi cập nhật cấu hình nhiệm vụ');
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setUpdatingCampaign(false);
    }
  };

  const loadData = async (targetExamId?: number, targetCollectionId?: number, catFilter = categoryFilter) => {
    try {
      setLoading(true);

      // Fetch user profile to detect VIEWER
      try {
        const userRes = await fetch('/api/auth/me');
        if (userRes.ok) {
          const uJson = await userRes.json();
          setCurrentUser(uJson.user);
        }
      } catch (uErr) {
        console.error('Failed to get auth profile', uErr);
      }

      const queryParams = new URLSearchParams();
      if (targetExamId) queryParams.set('examId', String(targetExamId));
      if (targetCollectionId) queryParams.set('collectionId', String(targetCollectionId));
      if (catFilter !== 'ALL') queryParams.set('formFilter', catFilter);

      const dashRes = await fetch(`/api/dashboard/admin?${queryParams.toString()}`);
      const dashData = await dashRes.json();

      setSummary(dashData.summary);
      setRegionSummary(dashData.regionSummary || {});
      setCollections(dashData.collections || []);
      setExams(dashData.exams || []);
      setUnitList(dashData.unitList || []);
      if (dashData.activeCampaignTask) {
        setActiveCampaignTask(dashData.activeCampaignTask);
      }

      if (dashData.selectedExam?.id) setSelectedExamId(dashData.selectedExam.id);
      if (dashData.selectedCollection?.id) setSelectedCollectionId(dashData.selectedCollection.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(
      examIdParam ? parseInt(examIdParam) : undefined,
      collectionIdParam ? parseInt(collectionIdParam) : undefined,
      categoryFilter
    );
  }, [examIdParam, collectionIdParam, categoryFilter]);

  const openUnitDetail = async (unit: UnitRow) => {
    setSelectedUnitDetail(unit);
    setShowUnitDetailModal(true);
    setLoadingUnitDetail(true);

    try {
      if (unit.uploadId) {
        const res = await fetch(`/api/dashboard/unit?unitId=${unit.unitId}&examId=${selectedExamId}`);
        const d = await res.json();
        setUnitErrors(d.errors || []);
      } else {
        setUnitErrors([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUnitDetail(false);
    }
  };

  const handleOpenReopenModal = (type: 'EXAM_UPLOAD' | 'TRAINING_DEMAND', id: number, unitName: string) => {
    setReopenTarget({ type, id, unitName });
    setReopenReason('');
    setReopenError('');
    setShowReopenModal(true);
  };

  const handleExecuteReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;

    if (!reopenReason.trim() || reopenReason.trim().length < 10) {
      setReopenError('Lý do mở lại phải có độ dài tối thiểu 10 ký tự.');
      return;
    }

    setReopening(true);
    setReopenError('');

    try {
      const res = await fetch('/api/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reopenTarget.type,
          id: reopenTarget.id,
          reason: reopenReason.trim()
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Lỗi khi mở lại bài nộp.');
      }

      setShowReopenModal(false);
      setShowUnitDetailModal(false);
      await loadData();
    } catch (err: any) {
      setReopenError(err.message);
    } finally {
      setReopening(false);
    }
  };

  // Logic sắp xếp cột
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Logic lọc dữ liệu đơn vị theo bộ lọc
  const filteredUnits = useMemo(() => {
    return unitList.filter((u) => {
      const matchSearch =
        u.unitCode.toLowerCase().includes(searchUnit.toLowerCase()) ||
        u.unitName.toLowerCase().includes(searchUnit.toLowerCase()) ||
        (u.userAccount && u.userAccount.toLowerCase().includes(searchUnit.toLowerCase()));

      if (!matchSearch) return false;
      if (regionFilter !== 'ALL' && u.region !== regionFilter) return false;
      if (typeFilter !== 'ALL' && u.unitType !== typeFilter) return false;

      if (categoryFilter === 'CANDIDATE_LIST') {
        if (statusFilter === 'SUBMITTED') return u.candidateStatus === 'GỬI_CHÍNH_THỨC' || u.candidateStatus === 'HỢP_LỆ';
        if (statusFilter === 'ERROR') return u.candidateStatus === 'CÓ_LỖI';
        if (statusFilter === 'NOT_YET') return u.candidateStatus === 'CHƯA_UPLOAD';
        return true;
      }

      if (categoryFilter === 'TRAINING_DEMAND') {
        if (statusFilter === 'SUBMITTED') return u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC';
        if (statusFilter === 'DRAFT') return u.trainingStatus === 'ĐANG_SOẠN' || u.trainingStatus === 'MỞ_LẠI';
        if (statusFilter === 'NOT_YET') return u.trainingStatus === 'CHƯA_KÊ_KHAI';
        return true;
      }

      // ALL (Tổng hợp)
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'SUBMITTED') return u.overallStatus === 'ĐÃ_NỘP';
      if (statusFilter === 'ERROR') return u.overallStatus === 'CÓ_LỖI';
      if (statusFilter === 'DRAFT') return u.overallStatus === 'ĐANG_SOẠN';
      if (statusFilter === 'NOT_YET') return u.overallStatus === 'CHƯA_NỘP';

      return true;
    });
  }, [unitList, searchUnit, statusFilter, categoryFilter]);

  // Sắp xếp danh sách đơn vị đã lọc
  const sortedUnits = useMemo(() => {
    const list = [...filteredUnits];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'unitCode') {
        cmp = a.unitCode.localeCompare(b.unitCode);
      } else if (sortField === 'unitName') {
        cmp = a.unitName.localeCompare(b.unitName);
      } else if (sortField === 'totalRows') {
        cmp = a.totalRows - b.totalRows;
      } else if (sortField === 'candidateStatus') {
        cmp = a.candidateStatus.localeCompare(b.candidateStatus);
      } else if (sortField === 'trainingParticipantsCount') {
        cmp = a.trainingParticipantsCount - b.trainingParticipantsCount;
      } else if (sortField === 'trainingStatus') {
        cmp = a.trainingStatus.localeCompare(b.trainingStatus);
      } else if (sortField === 'overallStatus') {
        cmp = a.overallStatus.localeCompare(b.overallStatus);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredUnits, sortField, sortOrder]);

  // Phân trang
  const effectivePageSize = pageSize === -1 ? sortedUnits.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedUnits.length / (effectivePageSize || 1)));
  const paginatedUnits = useMemo(() => {
    if (pageSize === -1) return sortedUnits;
    const start = (currentPage - 1) * pageSize;
    return sortedUnits.slice(start, start + pageSize);
  }, [sortedUnits, currentPage, pageSize]);

  // Xuất danh sách đơn vị chưa nộp (A4)
  const handleExportUnsubmittedUnits = () => {
    const unsubmitted = unitList.filter(u => 
      u.overallStatus === 'CHƯA_NỘP' || 
      u.candidateStatus === 'CHƯA_UPLOAD' || 
      u.trainingStatus === 'CHƯA_KÊ_KHAI'
    );

    if (unsubmitted.length === 0) {
      alert(`Tất cả ${totalUnits} đơn vị đều đã nộp hồ sơ!`);
      return;
    }

    // Xuất file CSV định dạng UTF-8 với BOM để Excel đọc đúng tiếng Việt
    const headers = ['STT', 'Mã Đơn vị', 'Tên Đơn vị', 'Tài khoản', 'Danh sách Cán bộ thi', 'Nhu cầu Đào tạo', 'Trạng thái chung'];
    const rows = unsubmitted.map((u, i) => [
      i + 1,
      `"${u.unitCode}"`,
      `"${u.unitName}"`,
      `"${u.userAccount || ''}"`,
      `"${u.candidateStatus === 'CHƯA_UPLOAD' ? 'Chưa nộp file' : u.candidateStatus === 'GỬI_CHÍNH_THỨC' ? 'Đã gửi' : u.candidateStatus === 'CÓ_LỖI' ? 'Có lỗi' : 'Hợp lệ'}"`,
      `"${u.trainingStatus === 'CHƯA_KÊ_KHAI' ? 'Chưa đăng ký' : u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC' ? 'Đã gửi' : 'Đang soạn'}"`,
      `"${u.overallStatus === 'CHƯA_NỘP' ? 'Chưa hoàn thành' : u.overallStatus === 'ĐÃ_NỘP' ? 'Hoàn thành' : 'Đang xử lý'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Danh_sach_don_vi_chua_nop_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isTrainingOnly = categoryFilter === 'TRAINING_DEMAND';
  const isCandidateOnly = categoryFilter === 'CANDIDATE_LIST';
  const isViewer = currentUser?.role === 'VIEWER';

  const totalUnits = summary?.totalUnits || unitList.length || 155;
  const submittedCount = isTrainingOnly
    ? summary?.trainingSubmittedCount || 0
    : isCandidateOnly
    ? summary?.completedUnits || summary?.uploadedUnits || 0
    : summary?.uploadedUnits || summary?.trainingSubmittedCount || 0;

  const pendingCount = totalUnits - submittedCount;
  const errorCount = isTrainingOnly ? 0 : summary?.errorUnits || 0;
  const draftCount = isTrainingOnly ? summary?.trainingDraftCount || 0 : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Trang Tổng quan */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 tracking-wider uppercase mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#005F3E]"></span>
            <span>BẢNG ĐIỀU KHIỂN TRUNG TÂM (DASHBOARD)</span>
            {isViewer && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                CHẾ ĐỘ CHỈ XEM
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Tổng quan Đợt Thu thập & Trạng thái {totalUnits} Đơn vị
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi thời gian thực tiến độ nộp dữ liệu, kết quả đối chiếu kiểm tra và hồ sơ khảo sát theo từng bộ lọc.
          </p>
        </div>

        {/* Bộ chọn Đợt / Kỳ thu thập */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Đợt thu thập:</span>
            <select
              value={selectedExamId || ''}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setSelectedExamId(id);
                loadData(id, selectedCollectionId || undefined, categoryFilter);
              }}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadData(selectedExamId || undefined, selectedCollectionId || undefined, categoryFilter)}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 transition-colors shadow-xs"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1.5 Cấu hình Nhiệm vụ đợt này giao cho 155 Đơn vị */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white rounded-2xl p-4 sm:p-5 border border-emerald-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#005F3E] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-[#005F3E]">
                CẤU HÌNH NHIỆM VỤ ĐỢT NÀY CHO 155 ĐƠN VỊ
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white text-emerald-800 border border-emerald-300 shadow-2xs">
                Màn hình &quot;Việc cần làm&quot;
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Quyết định nội dung Dashboard mà 155 Chi nhánh nhìn thấy khi vào hệ thống:
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            {
              id: 'CANDIDATE_EXAM',
              label: 'Chỉ Thi nghiệp vụ / Nhân sự',
              icon: FileSpreadsheet,
              desc: 'Kỳ thi cán bộ'
            },
            {
              id: 'TRAINING_DEMAND',
              label: 'Chỉ Khảo sát Đào tạo',
              icon: GraduationCap,
              desc: 'Nhu cầu đào tạo'
            },
            {
              id: 'BOTH',
              label: 'Cả 2 Nhiệm vụ',
              icon: Layers,
              desc: 'Hiển thị song song'
            },
            {
              id: 'AUTO',
              label: 'Tự động',
              icon: RefreshCw,
              desc: 'Theo đợt đang mở'
            }
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeCampaignTask === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={updatingCampaign || isViewer}
                onClick={() => handleUpdateCampaign(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-2xs ${
                  isSelected
                    ? 'bg-[#005F3E] text-white border-[#005F3E] shadow-sm ring-2 ring-emerald-500/20'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                } ${isViewer ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                title={item.desc}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. HÀNG 4 THẺ THỐNG KÊ KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng số đơn vị */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng Đơn vị</span>
            <span className="p-2 bg-slate-100 rounded-xl text-slate-600">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-slate-900">{totalUnits}</div>
            <div className="text-xs text-slate-400 mt-1">Toàn mạng lưới Agribank</div>
          </div>
        </div>

        {/* Card 2: Đã nộp dữ liệu */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Đã Gửi Dữ liệu</span>
            <span className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-emerald-700">{submittedCount}</div>
            <div className="text-xs text-emerald-600 font-semibold mt-1">
              Đạt {Math.round((submittedCount / totalUnits) * 100)}% tổng số đơn vị
            </div>
          </div>
        </div>

        {/* Card 3: Chưa nộp */}
        <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Chưa Gửi Hồ sơ</span>
            <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-[11px] font-black flex items-center justify-center shadow-xs">
              {pendingCount}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-amber-700">{pendingCount}</div>
            <div className="text-xs text-slate-400 mt-1">
              {draftCount > 0 ? `${draftCount} đơn vị đang soạn thảo` : 'Đang chờ nộp hồ sơ'}
            </div>
          </div>
        </div>

        {/* Card 4: Có lỗi hoặc Tổng nhu cầu */}
        {isTrainingOnly ? (
          <div className="bg-teal-900 text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-200 uppercase tracking-wider">Tổng Đăng ký Học</span>
              <GraduationCap className="w-5 h-5 text-teal-300" />
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-white">
                {(summary?.totalTrainingDemand || 0).toLocaleString('vi-VN')}
              </div>
              <div className="text-xs text-teal-200 mt-1">Lượt cán bộ có nhu cầu</div>
            </div>
          </div>
        ) : (
          <div className="bg-[#A81D22] text-white rounded-2xl p-5 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-100 uppercase tracking-wider">Phát hiện Lỗi</span>
              <AlertTriangle className="w-5 h-5 text-rose-200" />
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-white">{errorCount}</div>
              <div className="text-xs text-rose-200 mt-1">Đơn vị cần chỉnh sửa file</div>
            </div>
          </div>
        )}
      </div>

      {/* 3. BẢNG TIẾN TRÌNH THU THẬP & PHÂN LOẠI BIỂU MẪU */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#005F3E]" />
              <span>Phân loại Biểu mẫu & Nhiệm vụ Thu thập dữ liệu:</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tách biệt cơ chế Đối chiếu Master Database và Khảo sát Nhu cầu theo từng loại biểu mẫu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCategoryFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                categoryFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({totalUnits})
            </button>
            <button
              onClick={() => {
                setCategoryFilter('CANDIDATE_LIST');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                categoryFilter === 'CANDIDATE_LIST'
                  ? 'bg-[#005F3E] text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Danh sách Cán bộ thi</span>
            </button>
            <button
              onClick={() => {
                setCategoryFilter('TRAINING_DEMAND');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                categoryFilter === 'TRAINING_DEMAND'
                  ? 'bg-teal-800 text-white shadow-xs'
                  : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Khảo sát Đào tạo (Khung CT)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3B. TIẾN ĐỘ THU THẬP DỮ LIỆU THEO VÙNG MIỀN (MỤC 2.3) */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#005F3E]" />
            <span>Tiến độ Nộp Dữ liệu theo Vùng miền Toàn hệ thống Agribank</span>
          </div>
          <span className="text-[11px] text-slate-500">Bấm vào từng vùng miền để lọc nhanh danh sách chi nhánh</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['MIEN_BAC', 'MIEN_TRUNG', 'TAY_NGUYEN', 'MIEN_NAM'].map(rKey => {
            const rData = regionSummary[rKey] || { total: 0, examSubmitted: 0, trainingSubmitted: 0 };
            const submitted = isTrainingOnly ? rData.trainingSubmitted : rData.examSubmitted;
            const pct = rData.total > 0 ? Math.round((submitted / rData.total) * 100) : 0;
            const isSelected = regionFilter === rKey;

            return (
              <button
                key={rKey}
                onClick={() => {
                  setRegionFilter(isSelected ? 'ALL' : rKey);
                  setCurrentPage(1);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">{REGION_LABELS[rKey] || rKey}</span>
                  <span className="font-mono font-bold text-emerald-700">{pct}%</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-[#005F3E] h-full rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 flex justify-between">
                  <span>Đã nộp: <strong>{submitted}</strong>/{rData.total}</span>
                  <span>{rData.total - submitted > 0 ? `Còn ${rData.total - submitted}` : '100%'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. BẢNG TRẠNG THÁI CÁC ĐƠN VỊ KÈM THANH BỘ LỌC ĐA NĂNG (A4) */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Thanh công cụ tìm kiếm và lọc trạng thái */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Trạng thái Nộp dữ liệu theo từng Đơn vị</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {filteredUnits.length} / {totalUnits} đơn vị
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Danh sách chi tiết tài khoản kê khai, số bản ghi, phát hiện lỗi và trạng thái xác nhận
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Lọc theo Vùng miền */}
            <select
              value={regionFilter}
              onChange={(e) => { setRegionFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">Tất cả Vùng miền</option>
              {Object.entries(REGION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            {/* Lọc theo Phân loại đơn vị */}
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">Tất cả Phân loại</option>
              {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            {/* Nút Xuất danh sách đơn vị chưa nộp (A4) */}
            <button
              type="button"
              onClick={handleExportUnsubmittedUnits}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-colors"
              title="Xuất file danh sách các chi nhánh chưa nộp đủ hồ sơ"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Chưa nộp</span>
            </button>

            {/* Lọc theo trạng thái */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
                className={`px-2 py-1 rounded-lg font-semibold transition-colors ${
                  statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => { setStatusFilter('SUBMITTED'); setCurrentPage(1); }}
                className={`px-2 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  statusFilter === 'SUBMITTED' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Đã nộp</span>
              </button>
              <button
                onClick={() => { setStatusFilter('NOT_YET'); setCurrentPage(1); }}
                className={`px-2 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                  statusFilter === 'NOT_YET' ? 'bg-amber-500 text-slate-950 shadow-xs font-bold' : 'text-amber-800 hover:bg-amber-100'
                }`}
              >
                <XCircle className="w-3 h-3" />
                <span>Chưa nộp</span>
              </button>
              {!isTrainingOnly && (
                <button
                  onClick={() => { setStatusFilter('ERROR'); setCurrentPage(1); }}
                  className={`px-2 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 ${
                    statusFilter === 'ERROR' ? 'bg-[#A81D22] text-white shadow-xs' : 'text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Có lỗi</span>
                </button>
              )}
            </div>

            {/* Ô tìm kiếm đơn vị */}
            <div className="relative w-full sm:w-52">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchUnit}
                onChange={(e) => { setSearchUnit(e.target.value); setCurrentPage(1); }}
                placeholder="Mã ĐV, tên đơn vị, tài khoản..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Bảng dữ liệu có Sắp xếp theo cột (A4) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-[#F8F9FA] text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px] select-none">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">STT</th>
                <th className="px-4 py-3.5 w-36">Tài khoản Đơn vị</th>
                <th
                  onClick={() => handleSort('unitName')}
                  className="px-4 py-3.5 min-w-[220px] cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>Tên Đơn vị</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('unitCode')}
                  className="px-4 py-3.5 w-24 text-center cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Mã ĐV</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('candidateStatus')}
                  className="px-4 py-3.5 w-48 text-center cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Trạng thái Thí sinh</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('trainingStatus')}
                  className="px-4 py-3.5 w-48 text-center cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Trạng thái Đào tạo</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 w-24 text-right pr-6">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUnits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                    Không tìm thấy đơn vị nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                paginatedUnits.map((u, i) => {
                  const itemIndex = pageSize === -1 ? i + 1 : (currentPage - 1) * pageSize + i + 1;

                  // Hiển thị trạng thái Cán bộ (Chuẩn tiếng Việt kèm icon)
                  let candBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      <XCircle className="w-3 h-3 text-slate-400" />
                      <span>Chưa nộp</span>
                    </span>
                  );
                  if (u.candidateStatus === 'GỬI_CHÍNH_THỨC') {
                    candBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Đã nộp ({u.validRows})</span>
                      </span>
                    );
                  } else if (u.candidateStatus === 'MỞ_LẠI') {
                    candBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <RefreshCw className="w-3 h-3 text-amber-600" />
                        <span>Đã nộp (mở lại)</span>
                      </span>
                    );
                  } else if (u.candidateStatus === 'CÓ_LỖI') {
                    candBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-[#A81D22] border border-rose-300">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Có {u.errorRows} lỗi</span>
                      </span>
                    );
                  } else if (u.candidateStatus === 'HỢP_LỆ') {
                    candBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        <span>Hợp lệ ({u.validRows})</span>
                      </span>
                    );
                  }

                  // Hiển thị trạng thái Nhu cầu Đào tạo (Chuẩn tiếng Việt kèm icon)
                  let trainBadge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      <XCircle className="w-3 h-3 text-slate-400" />
                      <span>Chưa nộp</span>
                    </span>
                  );
                  if (u.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC') {
                    trainBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Đã nộp ({u.trainingParticipantsCount})</span>
                      </span>
                    );
                  } else if (u.trainingStatus === 'ĐANG_SOẠN' || u.trainingStatus === 'MỞ_LẠI') {
                    trainBadge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Đang soạn ({u.trainingParticipantsCount})</span>
                      </span>
                    );
                  }

                  return (
                    <tr key={u.unitId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 text-center text-slate-400 font-medium">
                        {itemIndex}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-[#005F3E] font-mono">
                        {u.userAccount || `${u.unitCode}_Admin`}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">
                        <div className="font-semibold text-slate-900">{u.unitName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {REGION_LABELS[u.region || ''] || u.region || 'Miền Bắc'}
                          </span>
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {UNIT_TYPE_LABELS[u.unitType || ''] || u.unitType || 'Chi nhánh Loại 1'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-600">
                        {u.unitCode}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {candBadge}
                          {u.candidateSubmittedAt && (
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(u.candidateSubmittedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {trainBadge}
                          {u.trainingSubmittedAt && (
                            <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(u.trainingSubmittedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right pr-6">
                        <button
                          type="button"
                          onClick={() => openUnitDetail(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                          title="Xem chi tiết hồ sơ đơn vị"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Chi tiết</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG DANH SÁCH ĐƠN VỊ (A4) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span>
              Hiển thị {paginatedUnits.length} / {sortedUnits.length} đơn vị
            </span>
            <div className="flex items-center gap-1.5 border-l border-slate-300 pl-3">
              <span>Số dòng/trang:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-semibold text-slate-800 focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={-1}>Tất cả ({sortedUnits.length})</option>
              </select>
            </div>
          </div>

          {pageSize !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 font-semibold text-slate-800">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. MODAL XEM CHI TIẾT ĐƠN VỊ & KẾT QUẢ ĐỐI CHIẾU */}
      {showUnitDetailModal && selectedUnitDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{selectedUnitDetail.unitName}</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-600 text-white">
                    {selectedUnitDetail.unitCode}
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Tài khoản đăng nhập: <strong className="text-white">{selectedUnitDetail.userAccount}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowUnitDetailModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Thân Modal */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nghiệp vụ 1: Danh sách Cán bộ thi */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Danh sách Cán bộ thi nghiệp vụ:</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {selectedUnitDetail.uploadId ? (
                      `File: ${selectedUnitDetail.fileName || 'Danh_sach.xlsx'} (v${selectedUnitDetail.version || 1})`
                    ) : (
                      'Chưa nộp file'
                    )}
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <span>Tổng dòng: <strong>{selectedUnitDetail.totalRows}</strong></span>
                      <span>Hợp lệ: <strong className="text-emerald-700">{selectedUnitDetail.validRows}</strong></span>
                      <span className={selectedUnitDetail.errorRows > 0 ? 'text-rose-700 font-bold' : ''}>
                        Lỗi: {selectedUnitDetail.errorRows}
                      </span>
                    </div>
                    {currentUser?.role === 'SUPER_ADMIN' && selectedUnitDetail.uploadId && (selectedUnitDetail.candidateStatus === 'GỬI_CHÍNH_THỨC' || selectedUnitDetail.candidateStatus === 'HỢP_LỆ') && (
                      <button
                        type="button"
                        onClick={() => handleOpenReopenModal('EXAM_UPLOAD', selectedUnitDetail.uploadId!, selectedUnitDetail.unitName)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold shadow-xs transition-colors"
                      >
                        Mở lại bài nộp
                      </button>
                    )}
                  </div>
                </div>

                {/* Nghiệp vụ 2: Khảo sát Đào tạo */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-teal-700" />
                    <span>Nhu cầu Đào tạo (Khung CT):</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {selectedUnitDetail.trainingProgramsCount > 0 ? (
                      `Đã chọn ${selectedUnitDetail.trainingProgramsCount} Khung chương trình`
                    ) : (
                      'Chưa lựa chọn chương trình nào'
                    )}
                  </div>
                  <div className="text-xs text-slate-600 flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <span>Số người: <strong className="text-teal-800">{selectedUnitDetail.trainingParticipantsCount}</strong></span>
                      <span>Trạng thái: <strong>{selectedUnitDetail.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC' ? 'Đã nộp chính thức' : selectedUnitDetail.trainingStatus === 'MỞ_LẠI' ? 'Đang mở lại' : selectedUnitDetail.trainingStatus === 'ĐANG_SOẠN' ? 'Đang soạn' : 'Chưa kê khai'}</strong></span>
                    </div>
                    {currentUser?.role === 'SUPER_ADMIN' && selectedUnitDetail.trainingSubmissionId && selectedUnitDetail.trainingStatus === 'ĐÃ_GỬI_CHÍNH_THỨC' && (
                      <button
                        type="button"
                        onClick={() => handleOpenReopenModal('TRAINING_DEMAND', selectedUnitDetail.trainingSubmissionId!, selectedUnitDetail.unitName)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-[11px] font-bold shadow-xs transition-colors"
                      >
                        Mở lại khảo sát
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chi tiết lỗi đối chiếu danh sách cán bộ */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Chi tiết kết quả đối chiếu Cán bộ ({unitErrors.length} lỗi phát hiện)
                  </h4>
                  {selectedUnitDetail.errorRows > 0 && selectedUnitDetail.uploadId && (
                    <a
                      href={`/api/export?type=errors&uploadId=${selectedUnitDetail.uploadId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#A81D22] hover:bg-[#8e191d] text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Tải file danh sách lỗi (Excel)</span>
                    </a>
                  )}
                </div>

                {loadingUnitDetail ? (
                  <div className="p-8 text-center text-xs text-slate-500">Đang tải chi tiết lỗi...</div>
                ) : unitErrors.length === 0 ? (
                  <div className="p-6 text-center bg-emerald-50 rounded-xl border border-emerald-200">
                    <CheckCircle className="w-8 h-8 text-[#005F3E] mx-auto mb-1.5" />
                    <div className="font-bold text-[#005F3E] text-sm">Dữ liệu cán bộ của đơn vị hợp lệ!</div>
                    <div className="text-xs text-emerald-700 mt-0.5">Không phát hiện sai lệch nào với Master Database.</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-64">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#F8F9FA] font-bold border-b border-slate-200 text-slate-700 uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-14 text-center">Dòng</th>
                          <th className="px-3 py-2 w-28 font-mono">Mã cán bộ</th>
                          <th className="px-3 py-2 w-32 font-mono">eLearning</th>
                          <th className="px-3 py-2 w-48">Loại lỗi</th>
                          <th className="px-3 py-2">Nội dung chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {unitErrors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-rose-50/50">
                            <td className="px-3 py-2 text-center font-bold text-slate-900">{err.row_index}</td>
                            <td className="px-3 py-2 font-mono font-semibold">{err.employee_code || '-'}</td>
                            <td className="px-3 py-2 font-mono">{err.elearning_account || '-'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-[#A81D22] border border-rose-300">
                                {getErrorLabel(err.error_type)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#A81D22] font-medium">{err.error_message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {selectedUnitDetail.uploadId ? (
                <a
                  href={`/api/export?type=unit&uploadId=${selectedUnitDetail.uploadId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất file Excel của đơn vị</span>
                </a>
              ) : <div />}

              <button
                onClick={() => setShowUnitDetailModal(false)}
                className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1.4 MODAL MỞ LẠI BÀI NỘP CHO ĐƠN VỊ */}
      {showReopenModal && reopenTarget && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-amber-500 text-slate-950 font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                <span className="text-sm">Xác nhận Mở lại bài nộp</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                className="text-slate-900 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteReopen} className="p-5 space-y-4 text-xs">
              <div>
                <p className="text-slate-600 mb-1">
                  Đơn vị: <strong className="text-slate-900">{reopenTarget.unitName}</strong>
                </p>
                <p className="text-slate-600 mb-2">
                  Loại bài nộp: <strong className="text-slate-900">{reopenTarget.type === 'EXAM_UPLOAD' ? 'Danh sách Cán bộ thi' : 'Khảo sát Nhu cầu Đào tạo'}</strong>
                </p>
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 mb-3 text-[11px]">
                  <strong>Lưu ý:</strong> Khi mở lại, trạng thái bài nộp sẽ chuyển thành <em>Mở lại (REOPENED)</em>. Đơn vị sẽ được cấp lại quyền chỉnh sửa/tải lên file mới để nộp lại.
                </div>
              </div>

              {reopenError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 font-semibold">
                  {reopenError}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Lý do mở lại (Bắt buộc - tối thiểu 10 ký tự):
                </label>
                <textarea
                  rows={3}
                  required
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ví dụ: Thiếu thông tin chuyên đề Phòng Kế toán; phát hiện sai sót dữ liệu cần rà soát lại..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={reopening}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  {reopening ? 'Đang mở lại...' : 'Xác nhận mở lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardOverview() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-[#005F3E] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500 text-xs">Đang tải Bảng điều khiển Tổng quan...</p>
          </div>
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}
