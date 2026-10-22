'use client';

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Users,
  Building2,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  Clock,
  RotateCcw,
  BookOpen,
  Filter,
  BarChart3,
  Layers,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Check,
  XCircle,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  HelpCircle,
  ListFilter,
  ChevronDown,
  ChevronRight,
  FileText,
  Sparkles,
  ExternalLink,
  UploadCloud,
  FileUp,
  Mail,
  FileCheck
} from 'lucide-react';
import BatchProxyUploadModal from '@/components/BatchProxyUploadModal';

interface SummaryData {
  collectionId: number;
  totalUnits: number;
  submittedUnits: number;
  pendingUnits: number;
  draftUnits: number;
  totalParticipants: number;
  totalPositionsDeclared: number;
  topTopics: {
    id: number;
    topic_name: string;
    delivery_method: string;
    duration: string;
    total_demand: number;
    unit_count: number;
  }[];
}

interface PositionItem {
  id: number;
  code: string;
  name: string;
  group_name: string;
  status: string;
  topic_count: number;
}

interface TopicItem {
  id: number;
  code?: string;
  name: string;
  delivery_method?: string;
  duration?: string;
  competency?: string;
  status: string;
  position_count?: number;
}

interface UnitItem {
  id: number;
  unit_code: string;
  unit_name: string;
}

export default function AdminTrainingDemandPage() {
  const [activeTab, setActiveTab] = useState<'program' | 'matrix' | 'topic' | 'unit' | 'catalog' | 'export' | 'compare' | 'proposal'>('program');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  // Tab 7: Đề xuất ngoài khung (Mục 2.8)
  const [proposalsList, setProposalsList] = useState<any[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalSearch, setProposalSearch] = useState('');

  // Tab 6: So sánh giữa các đợt (Comparison - Mục 2.7)
  const [collections, setCollections] = useState<any[]>([]);
  const [baseCollId, setBaseCollId] = useState<number>(0);
  const [targetCollId, setTargetCollId] = useState<number>(0);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonSubTab, setComparisonSubTab] = useState<'topics' | 'units'>('topics');

  // Official Programs state (Phụ lục I - IV)
  const [programs, setPrograms] = useState<any[]>([]);
  const [programGroups, setProgramGroups] = useState<any[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [progFilterGroup, setProgFilterGroup] = useState('');
  const [progSearch, setProgSearch] = useState('');
  const [programMatrixData, setProgramMatrixData] = useState<any>(null);
  const [programMatrixLoading, setProgramMatrixLoading] = useState(false);

  // Positions & Units lists
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [allTopics, setAllTopics] = useState<TopicItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [positionGroups, setPositionGroups] = useState<{ group_name: string; count: number }[]>([]);

  // Tab 1: Matrix state
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
  const [posFilterGroup, setPosFilterGroup] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [matrixData, setMatrixData] = useState<any>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

  // Tab 2 (NEW): Topic report state (Stage 4)
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [topicSearch, setTopicSearch] = useState('');
  const [topicReportData, setTopicReportData] = useState<any>(null);
  const [topicReportLoading, setTopicReportLoading] = useState(false);

  // Tab 3: Unit drill-down state
  const [selectedUnitId, setSelectedUnitId] = useState<number | 'ALL'>('ALL');
  const [unitSearch, setUnitSearch] = useState('');
  const [unitReportData, setUnitReportData] = useState<any>(null);
  const [unitReportLoading, setUnitReportLoading] = useState(false);
  const [unitExpandedPrograms, setUnitExpandedPrograms] = useState<Record<number, boolean>>({});
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenSuccess, setReopenSuccess] = useState('');
  const [allUnitsStatusFilter, setAllUnitsStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'DRAFT' | 'NOT_SUBMITTED'>('ALL');

  // Tab 3: Nộp hộ file Excel cho đơn vị (Nhận qua Email)
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyUnitId, setProxyUnitId] = useState<number | ''>('');
  const [proxyFile, setProxyFile] = useState<File | null>(null);
  const [proxyStatus, setProxyStatus] = useState<'SUBMITTED' | 'DRAFT'>('SUBMITTED');
  const [proxyNote, setProxyNote] = useState('Nhận file Excel qua email chi nhánh');
  const [proxyUploading, setProxyUploading] = useState(false);
  const [proxyPreviewLoading, setProxyPreviewLoading] = useState(false);
  const [proxyPreviewData, setProxyPreviewData] = useState<any | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [proxySuccessMsg, setProxySuccessMsg] = useState<string | null>(null);

  const openProxyModal = (unitId?: number) => {
    const defaultUnitId = unitId || (typeof selectedUnitId === 'number' ? selectedUnitId : (units[0]?.id || ''));
    setProxyUnitId(defaultUnitId);
    setProxyFile(null);
    setProxyPreviewData(null);
    setProxyError(null);
    setProxySuccessMsg(null);
    setProxyStatus('SUBMITTED');
    setProxyNote('Nhận file Excel qua email chi nhánh');
    setShowProxyModal(true);
  };

  const runProxyPreview = async (file: File, uId: number) => {
    try {
      setProxyPreviewLoading(true);
      setProxyError(null);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('unitId', String(uId));
      if (summary?.collectionId) fd.append('collectionId', String(summary.collectionId));
      fd.append('mode', 'preview');

      const res = await fetch('/api/training-demand/import-excel', {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi bóc tách file Excel.');
      setProxyPreviewData(data);
    } catch (err: any) {
      setProxyError(err.message);
    } finally {
      setProxyPreviewLoading(false);
    }
  };

  const handleProxyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProxyFile(file);
    setProxyError(null);
    setProxyPreviewData(null);

    if (proxyUnitId) {
      await runProxyPreview(file, Number(proxyUnitId));
    }
  };

  const handleExecuteProxyUpload = async () => {
    if (!proxyFile || !proxyUnitId) {
      setProxyError('Vui lòng chọn đơn vị và file Excel.');
      return;
    }
    try {
      setProxyUploading(true);
      setProxyError(null);
      const fd = new FormData();
      fd.append('file', proxyFile);
      fd.append('unitId', String(proxyUnitId));
      if (summary?.collectionId) fd.append('collectionId', String(summary.collectionId));
      fd.append('status', proxyStatus);
      fd.append('sourceNote', proxyNote);
      fd.append('mode', 'execute');

      const res = await fetch('/api/training-demand/import-excel', {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi lưu dữ liệu khảo sát.');

      setProxySuccessMsg(data.message || 'Đã nộp hộ file Excel thành công!');
      loadSummaryAndBaseData();
      if (selectedUnitId === proxyUnitId || selectedUnitId === 'ALL') {
        const fetchRes = await fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}`);
        if (fetchRes.ok) {
          const uData = await fetchRes.json();
          setUnitReportData(uData);
        }
      }
      setTimeout(() => {
        setShowProxyModal(false);
      }, 2500);
    } catch (err: any) {
      setProxyError(err.message);
    } finally {
      setProxyUploading(false);
    }
  };

  // Tab 4: Master Catalog Audit & Management state (Stage 2)
  const [catalogSubTab, setCatalogSubTab] = useState<'browse' | 'audit'>('browse');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogGroup, setCatalogGroup] = useState('');
  const [catalogPositions, setCatalogPositions] = useState<PositionItem[]>([]);
  const [expandedPosition, setExpandedPosition] = useState<number | null>(null);
  const [positionTopics, setPositionTopics] = useState<any[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [auditStats, setAuditStats] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Initial load
  useEffect(() => {
    loadSummaryAndBaseData();
  }, []);

  const loadSummaryAndBaseData = async () => {
    try {
      setLoading(true);
      // 1. Summary metrics
      const sumRes = await fetch(`/api/training-reports?type=SUMMARY&_t=${Date.now()}`, { cache: 'no-store' });
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        setSummary(sumJson);
        if (sumJson.collections && sumJson.collections.length > 0) {
          setCollections(sumJson.collections);
          if (sumJson.collections.length >= 2) {
            setBaseCollId(sumJson.collections[1].id);
            setTargetCollId(sumJson.collections[0].id);
          } else {
            setBaseCollId(sumJson.collections[0].id);
            setTargetCollId(sumJson.collections[0].id);
          }
        }
      }

      // 1.5. Programs (Phụ lục I - IV)
      const progRes = await fetch('/api/training-programs');
      if (progRes.ok) {
        const progJson = await progRes.json();
        setPrograms(progJson.programs || []);
        setProgramGroups(progJson.groups || []);
        if (progJson.programs && progJson.programs.length > 0) {
          setSelectedProgramId(progJson.programs[0].id);
        }
      }

      // 2. Positions
      const posRes = await fetch('/api/training-catalog?includeInactive=true');
      if (posRes.ok) {
        const posJson = await posRes.json();
        setPositions(posJson.positions || []);
        setPositionGroups(posJson.groups || []);
        setCatalogPositions(posJson.positions || []);
        if (posJson.positions && posJson.positions.length > 0) {
          setSelectedPositionId(posJson.positions[0].id);
        }
      }

      // 3. All Topics for Topic Report
      const topRes = await fetch('/api/training-catalog?type=ALL_TOPICS&includeInactive=true');
      if (topRes.ok) {
        const topJson = await topRes.json();
        setAllTopics(topJson.topics || []);
        if (topJson.topics && topJson.topics.length > 0) {
          setSelectedTopicId(topJson.topics[0].id);
        }
      }

      // 4. Units
      const uRes = await fetch('/api/units');
      if (uRes.ok) {
        const uJson = await uRes.json();
        setUnits(uJson.units || []);
        // Mặc định giữ 'ALL' để xem toàn bộ 155 đơn vị và xuất tất cả
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu tổng hợp:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tab Program: Load program matrix when selectedProgramId changes
  useEffect(() => {
    if (!selectedProgramId) return;
    const fetchProgramMatrix = async () => {
      try {
        setProgramMatrixLoading(true);
        const res = await fetch(`/api/training-reports?type=BY_PROGRAM&programId=${selectedProgramId}`);
        if (res.ok) {
          const data = await res.json();
          setProgramMatrixData(data);
        }
      } catch (err) {
        console.error('Lỗi tải ma trận khung chương trình:', err);
      } finally {
        setProgramMatrixLoading(false);
      }
    };
    fetchProgramMatrix();
  }, [selectedProgramId]);

  // Tab 1: Load matrix when selectedPositionId changes
  useEffect(() => {
    if (!selectedPositionId) return;
    const fetchMatrix = async () => {
      try {
        setMatrixLoading(true);
        const res = await fetch(`/api/training-reports?type=BY_POSITION&positionId=${selectedPositionId}`);
        if (res.ok) {
          const data = await res.json();
          setMatrixData(data);
        }
      } catch (err) {
        console.error('Lỗi tải ma trận:', err);
      } finally {
        setMatrixLoading(false);
      }
    };
    fetchMatrix();
  }, [selectedPositionId]);

  // Tab 2: Load topic report when selectedTopicId changes
  useEffect(() => {
    if (!selectedTopicId) return;
    const fetchTopicReport = async () => {
      try {
        setTopicReportLoading(true);
        const res = await fetch(`/api/training-reports?type=BY_TOPIC&topicId=${selectedTopicId}`);
        if (res.ok) {
          const data = await res.json();
          setTopicReportData(data);
        }
      } catch (err) {
        console.error('Lỗi tải báo cáo chuyên đề:', err);
      } finally {
        setTopicReportLoading(false);
      }
    };
    fetchTopicReport();
  }, [selectedTopicId]);

  // Tab 3: Load unit report when selectedUnitId changes
  useEffect(() => {
    if (!selectedUnitId) return;
    const fetchUnitReport = async () => {
      try {
        setUnitReportLoading(true);
        setReopenSuccess('');
        const res = await fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}&_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setUnitReportData(data);
          if (data.declaredPrograms && data.declaredPrograms.length > 0) {
            const exp: Record<number, boolean> = {};
            data.declaredPrograms.forEach((p: any) => { exp[p.program_id] = true; });
            setUnitExpandedPrograms(exp);
          }
        }
      } catch (err) {
        console.error('Lỗi tải báo cáo đơn vị:', err);
      } finally {
        setUnitReportLoading(false);
      }
    };
    fetchUnitReport();
  }, [selectedUnitId]);

  // Tự động đồng bộ số liệu tức thì khi quay lại tab và định kỳ nền mỗi 25 giây
  useEffect(() => {
    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        loadSummaryAndBaseData();
        if (selectedUnitId) {
          fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}&_t=${Date.now()}`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setUnitReportData(data); })
            .catch(() => {});
        }
      }
    };

    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    const intervalId = setInterval(handleSync, 25000);

    return () => {
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
      clearInterval(intervalId);
    };
  }, [selectedUnitId]);

  // Load audit statistics for Stage 2
  const loadAuditStats = async () => {
    try {
      setAuditLoading(true);
      const res = await fetch('/api/training-catalog?type=AUDIT_STATS');
      if (res.ok) {
        const data = await res.json();
        setAuditStats(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'catalog' && catalogSubTab === 'audit' && !auditStats) {
      loadAuditStats();
    }
  }, [activeTab, catalogSubTab]);

  // Tab 4: Toggle Status of Position or Topic
  const handleToggleStatus = async (entity: 'POSITION' | 'TOPIC', id: number) => {
    try {
      setTogglingId(id);
      const res = await fetch('/api/training-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TOGGLE_STATUS', entity, id })
      });
      const data = await res.json();
      if (res.ok) {
        if (entity === 'POSITION') {
          setPositions(prev => prev.map(p => p.id === id ? { ...p, status: data.newStatus } : p));
        } else {
          setAllTopics(prev => prev.map(t => t.id === id ? { ...t, status: data.newStatus } : t));
          setPositionTopics(prev => prev.map(t => t.id === id ? { ...t, status: data.newStatus } : t));
        }
        if (catalogSubTab === 'audit') loadAuditStats();
      } else {
        alert(data.error || 'Lỗi khi cập nhật trạng thái');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  // Tab 4: Load topics when expandedPosition changes
  const toggleExpandPosition = async (posId: number) => {
    if (expandedPosition === posId) {
      setExpandedPosition(null);
      return;
    }
    setExpandedPosition(posId);
    try {
      setTopicsLoading(true);
      const res = await fetch(`/api/training-catalog?positionId=${posId}&includeInactive=true`);
      if (res.ok) {
        const data = await res.json();
        setPositionTopics(data.topics || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTopicsLoading(false);
    }
  };

  // Handle Admin Reopen Submission
  const handleReopen = async () => {
    if (!selectedUnitId || selectedUnitId === 'ALL') return;
    if (!confirm('Bạn có chắc chắn muốn mở lại hồ sơ cho đơn vị này chỉnh sửa bổ sung?')) return;
    try {
      setReopenLoading(true);
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REOPEN',
          collectionId: summary?.collectionId || 1,
          unitId: selectedUnitId
        })
      });
      const data = await res.json();
      if (res.ok) {
        setReopenSuccess('Đã mở lại hồ sơ thành công! Đơn vị có thể chỉnh sửa lại.');
        const rRes = await fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}`);
        if (rRes.ok) setUnitReportData(await rRes.json());
        loadSummaryAndBaseData();
      } else {
        alert(data.error || 'Có lỗi xảy ra.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReopenLoading(false);
    }
  };

  // Tab 6: Chạy so sánh giữa 2 đợt (Mục 2.7)
  const handleRunComparison = async (bId = baseCollId, tId = targetCollId) => {
    if (!bId || !tId) return;
    try {
      setComparisonLoading(true);
      const res = await fetch(`/api/training-reports?type=COMPARE_ROUNDS&baseCollectionId=${bId}&targetCollectionId=${tId}`);
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu so sánh:', err);
    } finally {
      setComparisonLoading(false);
    }
  };

  // Tab 7: Tải danh sách Đề xuất ngoài khung (Mục 2.8)
  const loadProposalsData = async () => {
    try {
      setProposalsLoading(true);
      const res = await fetch('/api/training-reports?type=PROPOSALS');
      if (res.ok) {
        const data = await res.json();
        setProposalsList(data.proposals || []);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách đề xuất ngoài khung:', err);
    } finally {
      setProposalsLoading(false);
    }
  };

  const filteredProgramsForSelect = programs.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(progSearch.toLowerCase()) ||
                        p.code.toLowerCase().includes(progSearch.toLowerCase());
    const matchGroup = !progFilterGroup || p.group_name === progFilterGroup;
    return matchSearch && matchGroup;
  });

  const filteredPositionsForSelect = positions.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(posSearch.toLowerCase()) ||
                        p.code.toLowerCase().includes(posSearch.toLowerCase());
    const matchGroup = !posFilterGroup || p.group_name === posFilterGroup;
    return matchSearch && matchGroup;
  });

  const filteredTopicsForSelect = allTopics.filter(t =>
    t.name.toLowerCase().includes(topicSearch.toLowerCase()) ||
    (t.code && t.code.toLowerCase().includes(topicSearch.toLowerCase()))
  );

  const filteredUnitsForSelect = units.filter(u =>
    u.unit_name.toLowerCase().includes(unitSearch.toLowerCase()) ||
    u.unit_code.toLowerCase().includes(unitSearch.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm text-emerald-800 font-semibold mb-1">
            <GraduationCap className="w-5 h-5" />
            <span>QUẢN LÝ THU THẬP & KHẢO SÁT ĐÀO TẠO</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Khảo sát Nhu cầu Đào tạo ({summary?.totalUnits || units.length || 203} Đơn vị)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản trị Master Catalog, tổng hợp nhu cầu tự động theo Vị trí & Chuyên đề. Không cần nhận và ghép thủ công các file Excel từ từng đơn vị.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=ALL_SYSTEM"
            className="inline-flex items-center gap-2 bg-[#005F3E] hover:bg-[#004d32] text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất toàn bộ hệ thống (Excel)</span>
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Tiến độ nộp ({summary?.totalUnits || units.length || 203} Đơn vị)</div>
            <div className="text-xl font-bold text-slate-800">
              {summary?.submittedUnits ?? 0} <span className="text-sm font-normal text-slate-500">/ {summary?.totalUnits ?? units.length ?? 203}</span>
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-0.5">
              {summary?.totalUnits ? Math.round((summary.submittedUnits / summary.totalUnits) * 100) : 0}% hoàn thành
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Tổng nhu cầu đăng ký</div>
            <div className="text-xl font-bold text-blue-700">
              {(summary?.totalParticipants ?? 0).toLocaleString('vi-VN')}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Lượt nhân sự có nhu cầu</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-lg">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Vị trí đã phát sinh nhu cầu</div>
            <div className="text-xl font-bold text-purple-700">
              {summary?.totalPositionsDeclared ?? 0} <span className="text-sm font-normal text-slate-500">/ 284 vị trí</span>
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Danh mục Master</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Chưa gửi chính thức</div>
            <div className="text-xl font-bold text-amber-600">
              {summary?.pendingUnits ?? (summary?.totalUnits || units.length || 203)} <span className="text-sm font-normal text-slate-500">đơn vị</span>
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              {summary?.draftUnits ?? 0} đơn vị đang soạn thảo
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('program')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'program'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. Theo Khung Chương trình (Phụ lục I-IV)</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'matrix'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>2. Theo Vị trí (Ma trận cũ)</span>
          </button>

          <button
            onClick={() => setActiveTab('topic')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'topic'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>2. Theo Chuyên đề</span>
          </button>

          <button
            onClick={() => setActiveTab('unit')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'unit'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>3. Theo Đơn vị & Mở lại (Reopen)</span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'catalog'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>4. Quản trị Master Catalog & Kiểm tra</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'export'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>5. Xuất Excel Báo cáo</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('compare');
              if (!comparisonData && baseCollId && targetCollId) handleRunComparison();
            }}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'compare'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>6. So sánh giữa các đợt (Mục 2.7)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('proposal');
              if (proposalsList.length === 0) loadProposalsData();
            }}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'proposal'
                ? 'border-[#005F3E] text-[#005F3E]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>7. Đề xuất ngoài khung (Mục 2.8)</span>
          </button>
        </nav>
      </div>

      {/* TAB KHUNG CHƯƠNG TRÌNH (CHUẨN THEO PHỤ LỤC I - IV & MINH HỌA) */}
      {activeTab === 'program' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="w-full md:w-72">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nhóm Phụ lục (I, II, III, IV)</label>
                <select
                  value={progFilterGroup}
                  onChange={(e) => setProgFilterGroup(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Tất cả các nhóm Phụ lục --</option>
                  {programGroups.map((g, idx) => (
                    <option key={idx} value={g.group_name}>{g.group_name} ({g.program_count})</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn Khung Chương trình đào tạo</label>
                <select
                  value={selectedProgramId || ''}
                  onChange={(e) => setSelectedProgramId(parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {filteredProgramsForSelect.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} ({p.topic_count} chuyên đề)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 md:pt-0">
              {selectedProgramId && (
                <a
                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_PROGRAM&programId=${selectedProgramId}`}
                  className="inline-flex items-center gap-2 bg-[#005F3E] hover:bg-[#004d32] text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất Excel Chương trình này</span>
                </a>
              )}
            </div>
          </div>

          {programMatrixLoading ? (
            <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Đang tải ma trận nhu cầu theo khung chương trình...</span>
            </div>
          ) : programMatrixData ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 bg-gradient-to-r from-slate-50 to-emerald-50/40 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-800 text-white">
                      {programMatrixData.program?.code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {programMatrixData.program?.group_name}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {programMatrixData.program?.name}
                  </h3>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-xs text-slate-500">Tổng đăng ký</div>
                    <div className="text-xl font-black text-emerald-800">
                      {programMatrixData.totalParticipantsInProgram?.toLocaleString()} người
                    </div>
                  </div>
                  <div className="border-l pl-4">
                    <div className="text-xs text-slate-500">Đơn vị tham gia</div>
                    <div className="text-xl font-black text-blue-700">
                      {programMatrixData.units?.length || 0} đơn vị
                    </div>
                  </div>
                </div>
              </div>

              {/* BẢNG CHUYÊN ĐỀ ĐÚNG THEO FILE MINH HỌA */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700 text-xs font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">STT</th>
                      <th className="py-3 px-4 min-w-[300px]">Tên chuyên đề</th>
                      <th className="py-3 px-3 w-40">Hình thức đào tạo</th>
                      <th className="py-3 px-3 w-32">Thời lượng đào tạo</th>
                      <th className="py-3 px-4 w-36 text-right font-black text-emerald-900 bg-emerald-100/60 border-l border-r border-emerald-200">
                        Tổng số người
                      </th>
                      <th className="py-3 px-4 min-w-[340px]">Chi tiết các Đơn vị đã đăng ký</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {programMatrixData.topics?.map((topic: any, idx: number) => {
                      const totalDemand = programMatrixData.topicTotals?.[topic.id] || 0;
                      // Lấy danh sách các đơn vị có đăng ký > 0 chuyên đề này
                      const unitsWithDemand = (programMatrixData.units || []).filter(
                        (u: any) => (u.topicsMap?.[topic.id] || 0) > 0
                      );

                      return (
                        <tr key={topic.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-center font-medium text-slate-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {topic.topic_name}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                              {topic.delivery_method || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600 font-medium">
                            {topic.duration || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-base text-emerald-800 bg-emerald-50/60 border-l border-r border-emerald-100">
                            {totalDemand > 0 ? (
                              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg font-bold border border-emerald-300">
                                {totalDemand}
                              </span>
                            ) : (
                              <span className="text-slate-300">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {unitsWithDemand.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {unitsWithDemand.map((u: any) => (
                                  <span
                                    key={u.unit_id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs border border-slate-200"
                                    title={u.unit_name}
                                  >
                                    <span className="font-semibold text-slate-700">{u.unit_code}:</span>
                                    <span className="font-bold text-emerald-700">{u.topicsMap[topic.id]}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Chưa có đơn vị đăng ký</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 2: MA TRẬN THEO VỊ TRÍ (CŨ) */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="w-full md:w-64">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nhóm vị trí</label>
                <select
                  value={posFilterGroup}
                  onChange={(e) => setPosFilterGroup(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Tất cả các nhóm --</option>
                  {positionGroups.map((g, idx) => (
                    <option key={idx} value={g.group_name}>{g.group_name} ({g.count})</option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn Vị trí / Chức danh</label>
                <select
                  value={selectedPositionId || ''}
                  onChange={(e) => setSelectedPositionId(parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {filteredPositionsForSelect.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} ({p.topic_count} chuyên đề)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 md:pt-0">
              {selectedPositionId && (
                <a
                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_POSITION&positionId=${selectedPositionId}`}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất Excel Vị trí này</span>
                </a>
              )}
            </div>
          </div>

          {matrixLoading ? (
            <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Đang tải ma trận nhu cầu các đơn vị...</span>
            </div>
          ) : matrixData ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    {matrixData.position?.name} ({matrixData.position?.code})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nhóm: <span className="font-medium text-slate-700">{matrixData.position?.group_name}</span> | 
                    Tổng số chuyên đề: <span className="font-semibold text-emerald-700">{matrixData.totalTopics}</span>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600 text-xs font-bold uppercase border-b">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">STT</th>
                      <th className="py-3 px-4 min-w-[280px]">Tên Chuyên đề đào tạo</th>
                      <th className="py-3 px-3 w-32">Hình thức</th>
                      <th className="py-3 px-3 w-28 text-center">Thời lượng</th>
                      <th className="py-3 px-4 w-36 text-right font-black text-emerald-800 bg-emerald-50">
                        Tổng số người
                      </th>
                      <th className="py-3 px-4 min-w-[300px]">Chi tiết các Đơn vị đã đăng ký</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {matrixData.topicsMatrix?.map((row: any, idx: number) => {
                      const unitsWithDemand = Object.entries(row.unitDemands || {});
                      return (
                        <tr key={row.topicId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-center font-medium text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{row.topicName}</div>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                              {row.deliveryMethod || 'Trực tiếp'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-slate-600">{row.duration || '02 ngày'}</td>
                          <td className="py-3 px-4 text-right font-bold text-base text-emerald-700 bg-emerald-50/40">
                            {row.totalDemand > 0 ? (
                              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md font-bold">
                                {row.totalDemand}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {unitsWithDemand.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">Chưa có đơn vị nào đăng ký</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {unitsWithDemand.map(([uCode, count]: [string, any]) => (
                                  <span
                                    key={uCode}
                                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded"
                                  >
                                    <span className="font-semibold">{uCode}:</span>
                                    <span>{count}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 2: BÁO CÁO THEO CHUYÊN ĐỀ (STAGE 4 REQUIREMENT) */}
      {activeTab === 'topic' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="w-full md:w-80">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tìm kiếm chuyên đề</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Mã hoặc tên chuyên đề..."
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn Chuyên đề ({allTopics.length} chuyên đề)</label>
                <select
                  value={selectedTopicId || ''}
                  onChange={(e) => setSelectedTopicId(parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {filteredTopicsForSelect.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.delivery_method || 'Trực tiếp'} - {t.duration || '02 ngày'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 md:pt-0">
              {selectedTopicId && (
                <a
                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_TOPIC&topicId=${selectedTopicId}`}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất Excel Chuyên đề này</span>
                </a>
              )}
            </div>
          </div>

          {topicReportLoading ? (
            <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Đang tải báo cáo chuyên đề...</span>
            </div>
          ) : topicReportData ? (
            <div className="space-y-4">
              {/* Topic Header Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{topicReportData.topic?.name}</h3>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-4">
                    <span>Hình thức: <strong className="text-slate-700">{topicReportData.topic?.delivery_method || 'Trực tiếp'}</strong></span>
                    <span>Thời lượng: <strong className="text-slate-700">{topicReportData.topic?.duration || '02 ngày'}</strong></span>
                    <span>Áp dụng cho: <strong className="text-emerald-700">{topicReportData.positionsCount} vị trí</strong></span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Tổng nhu cầu đăng ký</div>
                    <div className="text-2xl font-black text-emerald-700">
                      {topicReportData.totalDemand} <span className="text-xs font-normal text-slate-500">lượt người</span>
                    </div>
                  </div>
                  <div className="text-right border-l pl-4">
                    <div className="text-xs text-slate-500">Số đơn vị có nhu cầu</div>
                    <div className="text-2xl font-black text-blue-700">
                      {topicReportData.unitCount} <span className="text-xs font-normal text-slate-500">đơn vị</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions Using This Topic */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-bold text-slate-600 mb-2 uppercase">
                  Các Vị trí / Chức danh được đào tạo chuyên đề này ({topicReportData.positionsUsingTopic?.length || 0}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {topicReportData.positionsUsingTopic?.map((pos: any) => (
                    <span
                      key={pos.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium border border-slate-200"
                    >
                      <span className="font-mono font-bold text-slate-500">[{pos.code}]</span>
                      <span>{pos.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Unit Demands Breakdown Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <h4 className="font-bold text-slate-700 text-sm">
                    Chi tiết đơn vị đăng ký nhu cầu ({topicReportData.unitDemands?.length || 0} lượt đăng ký)
                  </h4>
                </div>

                {topicReportData.unitDemands && topicReportData.unitDemands.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-600 text-xs font-bold uppercase border-b">
                        <tr>
                          <th className="py-3 px-4 w-12 text-center">STT</th>
                          <th className="py-3 px-4 w-40">Mã đơn vị</th>
                          <th className="py-3 px-4">Tên đơn vị</th>
                          <th className="py-3 px-4">Đăng ký cho Vị trí</th>
                          <th className="py-3 px-4 w-36 text-right font-bold text-emerald-800 bg-emerald-50">
                            Số người có nhu cầu
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {topicReportData.unitDemands.map((r: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-3 px-4 text-center font-medium text-slate-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{r.unit_code}</td>
                            <td className="py-3 px-4 font-semibold text-slate-800">{r.unit_name}</td>
                            <td className="py-3 px-4 text-slate-700">[{r.position_code}] {r.position_name}</td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700 bg-emerald-50/40">
                              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                                {r.participant_count}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    Chưa có đơn vị nào đăng ký chuyên đề này.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 3: BÁO CÁO THEO TỪNG ĐƠN VỊ & REOPEN */}
      {activeTab === 'unit' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="w-full md:w-80">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tìm kiếm đơn vị</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Mã hoặc tên đơn vị..."
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn Đơn vị ({units.length || 203} đơn vị)</label>
                <select
                  value={selectedUnitId || 'ALL'}
                  onChange={(e) => setSelectedUnitId(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="ALL" className="font-bold text-emerald-700 bg-emerald-50">
                    ★ TẤT CẢ ĐƠN VỊ (Toàn mạng lưới {units.length || 203} Đơn vị) ★
                  </option>
                  {filteredUnitsForSelect.map(u => (
                    <option key={u.id} value={u.id}>
                      [{u.unit_code}] {u.unit_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 md:pt-0">
              {selectedUnitId === 'ALL' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowBatchModal(true)}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-900 hover:to-teal-900 text-white px-3.5 py-2 rounded-lg text-sm font-extrabold shadow-sm transition-all active:scale-95 cursor-pointer border border-emerald-600/40"
                    title="Tải lên và tự động nhận diện nộp hộ cùng lúc nhiều file Excel Mẫu số 04"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                    <span>Nộp Hộ Hàng Loạt (Nhiều File)</span>
                  </button>
                  <button
                    onClick={() => openProxyModal()}
                    className="inline-flex items-center gap-2 bg-[#005F3E] hover:bg-[#004d32] text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Nộp hộ file Excel nhận qua Email cho bất kỳ đơn vị nào"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Nộp Hộ 1 Đơn Vị</span>
                  </button>
                  <a
                    href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=ALL"
                    className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors"
                    title="Xuất file Excel gồm 2 Sheet: Sheet 1 Tổng hợp, Sheet 2 Chi tiết chuyên đề toàn bộ đơn vị"
                  >
                    <Download className="w-4 h-4" />
                    <span>Xuất Excel Toàn Bộ {units.length || 203} Đơn Vị</span>
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openProxyModal(selectedUnitId)}
                    className="inline-flex items-center gap-1.5 bg-[#005F3E] hover:bg-[#004d32] text-white px-3 py-2 rounded-lg text-sm font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Nộp hộ file Excel nhận qua Email cho đơn vị này"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload hộ Excel</span>
                  </button>
                  <a
                    href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${selectedUnitId}`}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Xuất Excel Đơn vị</span>
                  </a>
                  <a
                    href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=ALL"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    title="Xuất dữ liệu toàn bộ đơn vị"
                  >
                    <Download className="w-4 h-4" />
                    <span>Xuất Tất cả ({units.length || 203} ĐV)</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {reopenSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{reopenSuccess}</span>
            </div>
          )}

          {unitReportLoading ? (
            <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Đang tải dữ liệu {selectedUnitId === 'ALL' ? 'toàn bộ đơn vị...' : 'báo cáo của đơn vị...'}</span>
            </div>
          ) : unitReportData?.isAllUnits ? (
            /* CHẾ ĐỘ XEM TẤT CẢ ĐƠN VỊ */
            <div className="space-y-4">
              {/* Thẻ KPI tổng hợp tiến độ toàn mạng lưới */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-500 font-semibold mb-1">Tổng đơn vị</p>
                  <p className="text-2xl font-black text-slate-800">{unitReportData.stats?.totalUnits || units.length || 203}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Toàn bộ chi nhánh & phòng ban</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm">
                  <p className="text-xs text-emerald-700 font-semibold mb-1">Đã nộp chính thức</p>
                  <p className="text-2xl font-black text-emerald-700">{unitReportData.stats?.submittedCount || 0}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">
                    {Math.round(((unitReportData.stats?.submittedCount || 0) / (unitReportData.stats?.totalUnits || units.length || 203)) * 100)}% hoàn thành
                  </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/30 shadow-sm">
                  <p className="text-xs text-blue-700 font-semibold mb-1">Đang soạn (Bản nháp)</p>
                  <p className="text-2xl font-black text-blue-700">{unitReportData.stats?.draftCount || 0}</p>
                  <p className="text-[11px] text-blue-600 mt-1">Đang nhập liệu</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm">
                  <p className="text-xs text-amber-700 font-semibold mb-1">Đang mở lại cho sửa</p>
                  <p className="text-2xl font-black text-amber-700">{unitReportData.stats?.reopenedCount || 0}</p>
                  <p className="text-[11px] text-amber-600 mt-1">Chờ nộp lại</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm col-span-2 md:col-span-1">
                  <p className="text-xs text-rose-700 font-semibold mb-1">Chưa gửi hồ sơ</p>
                  <p className="text-2xl font-black text-rose-700">{unitReportData.stats?.notSubmittedCount || 0}</p>
                  <p className="text-[11px] text-rose-600 mt-1">Cần đôn đốc</p>
                </div>
              </div>

              {/* Bảng tổng hợp toàn bộ đơn vị */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                      <span>Danh Sách & Tiến Độ Kê Khai Toàn Mạng Lưới ({unitReportData.stats?.totalUnits || units.length || 203} Đơn Vị)</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tổng số lượt người đăng ký đào tạo: <strong className="text-emerald-700 font-bold">{unitReportData.stats?.totalRegistrations?.toLocaleString('vi-VN') || 0} lượt</strong>
                    </p>
                  </div>

                  {/* Nút lọc nhanh trạng thái */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setAllUnitsStatusFilter('ALL')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${allUnitsStatusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                    >
                      Tất cả ({unitReportData.unitsReport?.length || 0})
                    </button>
                    <button
                      onClick={() => setAllUnitsStatusFilter('SUBMITTED')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${allUnitsStatusFilter === 'SUBMITTED' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                    >
                      Đã nộp ({unitReportData.stats?.submittedCount || 0})
                    </button>
                    <button
                      onClick={() => setAllUnitsStatusFilter('DRAFT')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${allUnitsStatusFilter === 'DRAFT' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}`}
                    >
                      Bản nháp ({unitReportData.stats?.draftCount || 0})
                    </button>
                    <button
                      onClick={() => setAllUnitsStatusFilter('NOT_SUBMITTED')}
                      className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors ${allUnitsStatusFilter === 'NOT_SUBMITTED' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'}`}
                    >
                      Chưa nộp ({unitReportData.stats?.notSubmittedCount || 0})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700 text-xs font-bold uppercase sticky top-0 z-10 border-b">
                      <tr>
                        <th className="py-3 px-3 w-12 text-center">STT</th>
                        <th className="py-3 px-3 w-24">Mã ĐV</th>
                        <th className="py-3 px-4">Tên Đơn vị</th>
                        <th className="py-3 px-3 w-28 text-center">Khu vực</th>
                        <th className="py-3 px-3 w-36 text-center">Trạng thái hồ sơ</th>
                        <th className="py-3 px-3 w-28 text-center">Số vị trí</th>
                        <th className="py-3 px-3 w-28 text-center">Số CĐ</th>
                        <th className="py-3 px-3 w-32 text-right font-bold text-emerald-800 bg-emerald-50/60">Lượt người ĐK</th>
                        <th className="py-3 px-3 w-36 text-center">Thời gian nộp</th>
                        <th className="py-3 px-3 w-28 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {unitReportData.unitsReport
                        ?.filter((u: any) => {
                          if (allUnitsStatusFilter === 'ALL') return true;
                          if (allUnitsStatusFilter === 'SUBMITTED') return u.status === 'SUBMITTED';
                          if (allUnitsStatusFilter === 'DRAFT') return u.status === 'DRAFT' || u.status === 'REOPENED';
                          if (allUnitsStatusFilter === 'NOT_SUBMITTED') return u.status === 'NOT_SUBMITTED';
                          return true;
                        })
                        .filter((u: any) => {
                          if (!unitSearch) return true;
                          const s = unitSearch.toLowerCase();
                          return u.unit_name.toLowerCase().includes(s) || u.unit_code.toLowerCase().includes(s);
                        })
                        .map((u: any, idx: number) => (
                          <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono text-xs font-bold text-slate-700">{u.unit_code}</td>
                            <td className="py-2.5 px-4 font-semibold text-slate-800 text-xs md:text-sm">
                              {u.unit_name}
                            </td>
                            <td className="py-2.5 px-3 text-center text-xs text-slate-500">{u.region || '-'}</td>
                            <td className="py-2.5 px-3 text-center">
                              {u.status === 'SUBMITTED' ? (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Đã gửi
                                </span>
                              ) : u.status === 'DRAFT' ? (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[11px] font-semibold">
                                  Bản nháp
                                </span>
                              ) : u.status === 'REOPENED' ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px] font-semibold">
                                  Đang sửa
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[11px]">
                                  Chưa nộp
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center text-xs text-slate-600 font-medium">
                              {u.position_count > 0 ? `${u.position_count} vị trí` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center text-xs text-slate-600 font-medium">
                              {u.topic_count > 0 ? `${u.topic_count} CĐ` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 bg-emerald-50/30 text-xs md:text-sm">
                              {u.total_registered > 0 ? u.total_registered.toLocaleString('vi-VN') : '0'}
                            </td>
                            <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                              {u.submitted_at ? new Date(u.submitted_at).toLocaleDateString('vi-VN') : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setSelectedUnitId(u.id)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 rounded text-xs font-semibold transition-colors"
                                  title="Xem chi tiết các chuyên đề đơn vị này đăng ký"
                                >
                                  Xem
                                </button>
                                <button
                                  onClick={() => openProxyModal(u.id)}
                                  className="p-1 text-slate-500 hover:text-[#005F3E] hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                  title={`Nộp hộ file Excel nhận qua Email cho [${u.unit_code}] ${u.unit_name}`}
                                >
                                  <UploadCloud className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${u.id}`}
                                  className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                  title="Xuất file Excel của đơn vị này"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : unitReportLoading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#005F3E] border-r-transparent mb-3" />
              <p className="text-sm text-slate-500 font-medium">Đang tải chi tiết hồ sơ khảo sát của đơn vị...</p>
            </div>
          ) : unitReportData ? (
            /* CHẾ ĐỘ XEM CHI TIẾT 1 ĐƠN VỊ CỤ THỂ (THEO KHUNG CHƯƠNG TRÌNH & ĐỀ XUẤT NGOÀI KHUNG) */
            (() => {
              const unitDeclaredPrograms = unitReportData.declaredPrograms || [];
              const unitProposals = unitReportData.proposals || [];
              const unitPositionRecords = unitReportData.positionRecords || [];

              const totalRegisteredParticipants = unitDeclaredPrograms.length > 0
                ? unitDeclaredPrograms.reduce((sum: number, p: any) => sum + (p.sum_participants || 0), 0)
                : unitPositionRecords.reduce((sum: number, r: any) => sum + (r.participant_count || 0), 0);

              const totalCompletedParticipants = unitDeclaredPrograms.reduce((sum: number, p: any) => sum + (p.sum_completed || 0), 0);

              const totalRegisteredTopics = unitDeclaredPrograms.length > 0
                ? unitDeclaredPrograms.reduce((sum: number, p: any) => sum + (p.registered_topic_count || 0), 0)
                : new Set(unitPositionRecords.map((r: any) => r.topic_id)).size;

              // Gom nhóm danh sách chương trình đã kê khai theo Khung / Nhóm lớn (group_name)
              const groupedUnitPrograms = (() => {
                const map = new Map<string, any[]>();
                unitDeclaredPrograms.forEach((p: any) => {
                  const gName = p.group_name || 'Khác';
                  if (!map.has(gName)) map.set(gName, []);
                  map.get(gName)!.push(p);
                });
                return Array.from(map.entries()).map(([group_name, programs]) => ({
                  group_name,
                  programs,
                  totalParticipants: programs.reduce((sum: number, p: any) => sum + (p.sum_participants || 0), 0),
                  totalCompleted: programs.reduce((sum: number, p: any) => sum + (p.sum_completed || 0), 0),
                  totalTopics: programs.reduce((sum: number, p: any) => sum + (p.registered_topic_count || 0), 0)
                }));
              })();

              const toggleUnitAccordion = (programId: number) => {
                setUnitExpandedPrograms(prev => ({
                  ...prev,
                  [programId]: !prev[programId]
                }));
              };

              const expandAllUnitPrograms = () => {
                const allOpen: Record<number, boolean> = {};
                unitDeclaredPrograms.forEach((p: any) => { allOpen[p.program_id] = true; });
                setUnitExpandedPrograms(allOpen);
              };

              const collapseAllUnitPrograms = () => {
                setUnitExpandedPrograms({});
              };

              const hasAnyData = unitDeclaredPrograms.length > 0 || unitProposals.length > 0 || unitPositionRecords.length > 0;

              return (
                <div className="space-y-5">
                  {/* Thanh điều hướng quay lại & xuất báo cáo */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      onClick={() => setSelectedUnitId('ALL')}
                      className="inline-flex items-center gap-2 text-xs md:text-sm font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl border border-emerald-200 transition-colors shadow-xs"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Quay lại xem Toàn bộ {units.length || 203} Đơn vị</span>
                    </button>
                    <a
                      href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=ALL"
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-bold flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Download className="w-4 h-4 text-blue-600" />
                      <span>Xuất Excel Toàn Mạng Lưới ({units.length || 203} ĐV)</span>
                    </a>
                  </div>

                  {/* Thông báo kết quả thao tác (Reopen) nếu có */}
                  {reopenSuccess && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span>{reopenSuccess}</span>
                      </div>
                      <button
                        onClick={() => setReopenSuccess('')}
                        className="text-emerald-700 hover:text-emerald-900 font-bold px-2 py-0.5 rounded cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Thẻ Thông tin Đơn vị & Hồ sơ khảo sát */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold font-mono tracking-wide">
                          {unitReportData.unit?.unit_code}
                        </span>
                        <h3 className="font-extrabold text-lg text-slate-900">
                          {unitReportData.unit?.unit_name}
                        </h3>
                        {unitReportData.submission?.status === 'SUBMITTED' ? (
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-full text-xs font-bold inline-flex items-center gap-1.5 border border-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            Đã gửi chính thức
                          </span>
                        ) : unitReportData.submission?.status === 'DRAFT' ? (
                          <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full text-xs font-bold inline-flex items-center gap-1.5 border border-blue-300">
                            <Clock className="w-3.5 h-3.5 text-blue-700" />
                            Bản nháp
                          </span>
                        ) : unitReportData.submission?.status === 'REOPENED' ? (
                          <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold inline-flex items-center gap-1.5 border border-amber-300">
                            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                            Đang mở lại cho sửa
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium border border-slate-200">
                            Chưa gửi hồ sơ
                          </span>
                        )}
                      </div>

                      {unitReportData.submission ? (
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-5 gap-y-1">
                          {unitReportData.submission.receipt_code && (
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <FileText className="w-3.5 h-3.5" />
                              Mã biên nhận: {unitReportData.submission.receipt_code}
                            </span>
                          )}
                          <span>
                            Cập nhật: <strong>{new Date(unitReportData.submission.updated_at || unitReportData.submission.submitted_at).toLocaleString('vi-VN')}</strong>
                          </span>
                          {unitReportData.submission.submitted_by_name && (
                            <span>
                              Người gửi: <strong>{unitReportData.submission.submitted_by_name}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">
                          Đơn vị chưa tạo dự thảo hoặc chưa nộp dữ liệu trong đợt khảo sát này.
                        </div>
                      )}
                    </div>

                    {/* Nút hành động nhanh của Admin */}
                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                      <button
                        onClick={() => openProxyModal(typeof selectedUnitId === 'number' ? selectedUnitId : undefined)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Tải lên file Excel nhận qua Email để nộp hộ cho đơn vị này"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Upload hộ Excel (Nhận qua Email)</span>
                      </button>

                      {unitReportData.submission?.status === 'SUBMITTED' && (
                        <button
                          onClick={handleReopen}
                          disabled={reopenLoading}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                          title="Cho phép đơn vị mở khóa để điều chỉnh, bổ sung số lượng học viên"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>{reopenLoading ? 'Đang mở lại...' : 'Mở lại cho đơn vị sửa (Reopen)'}</span>
                        </button>
                      )}

                      {unitReportData.submission && (
                        <a
                          href={unitReportData.submission.receipt_code ? `/unit/receipt?code=${unitReportData.submission.receipt_code}` : `/unit/receipt?type=TRAINING_DEMAND&id=${unitReportData.submission.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Xem biên nhận nộp chính thức có mã vạch và dấu xác nhận điện tử"
                        >
                          <FileText className="w-4 h-4" />
                          <span>Xem biên nhận nộp</span>
                          <ExternalLink className="w-3 h-3 opacity-80" />
                        </a>
                      )}

                      <a
                        href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${selectedUnitId}`}
                        download
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Tải toàn bộ số liệu khảo sát của chi nhánh dưới định dạng Microsoft Excel"
                      >
                        <Download className="w-4 h-4 text-[#005F3E]" />
                        <span>Tải file Excel đơn vị</span>
                      </a>
                    </div>
                  </div>

                  {/* THẺ KPI THỐNG KÊ TỔNG HỢP CỦA ĐƠN VỊ */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Khung Chương Trình</div>
                        <div className="text-xl font-extrabold text-blue-700 mt-0.5">
                          {unitDeclaredPrograms.length} <span className="text-xs font-semibold text-slate-500">khung</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                        <BookOpen className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chuyên Đề Đăng Ký</div>
                        <div className="text-xl font-extrabold text-indigo-700 mt-0.5">
                          {totalRegisteredTopics} <span className="text-xs font-semibold text-slate-500">chuyên đề</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Layers className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-emerald-300 shadow-xs bg-gradient-to-br from-white to-emerald-50/50 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">Đăng Ký Học Năm 2027</div>
                        <div className="text-2xl font-black text-[#005F3E] mt-0.5">
                          {totalRegisteredParticipants.toLocaleString('vi-VN')} <span className="text-xs font-bold text-emerald-800">lượt</span>
                        </div>
                        {totalCompletedParticipants > 0 && (
                          <div className="text-[11px] font-bold text-blue-700 mt-0.5">
                            Đã học: {totalCompletedParticipants.toLocaleString('vi-VN')} lượt
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đề Xuất Ngoài Khung</div>
                        <div className="text-xl font-extrabold text-amber-700 mt-0.5">
                          {unitProposals.length} <span className="text-xs font-semibold text-slate-500">đề xuất</span>
                        </div>
                      </div>
                      <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                        <Sparkles className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* KHU VỰC KHUNG CHƯƠNG TRÌNH ĐÀO TẠO (GIỐNG GIAO DIỆN ĐƠN VỊ NỘP) */}
                  {unitDeclaredPrograms.length > 0 ? (
                    <div className="space-y-5">
                      {/* Tiêu đề & Công cụ mở rộng */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-sm md:text-base font-bold text-slate-900">
                            Khung Chương trình Đào tạo Đơn vị Đã Đăng ký
                          </h4>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {unitDeclaredPrograms.length} chương trình
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={expandAllUnitPrograms}
                            className="text-xs text-slate-600 hover:text-[#005F3E] font-semibold underline cursor-pointer"
                          >
                            Mở tất cả
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={collapseAllUnitPrograms}
                            className="text-xs text-slate-600 hover:text-[#005F3E] font-semibold underline cursor-pointer"
                          >
                            Thu gọn
                          </button>
                        </div>
                      </div>

                      {/* Phân nhóm theo Phụ lục */}
                      {groupedUnitPrograms.map(grp => (
                        <div key={grp.group_name} className="space-y-3">
                          {/* Tiêu đề Phân nhóm Phụ lục */}
                          <div className="flex items-center justify-between pb-2 border-b-2 border-emerald-800/80 bg-slate-100/80 p-3 rounded-xl">
                            <div className="flex items-center space-x-2">
                              <span className="w-2.5 h-6 bg-emerald-800 rounded-full" />
                              <h5 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                                {grp.group_name}
                              </h5>
                            </div>
                            <div className="flex items-center space-x-3 text-xs">
                              <span className="font-semibold text-slate-600">
                                {grp.programs.length} chương trình
                              </span>
                              {grp.totalCompleted > 0 && (
                                <span className="font-bold text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                                  Đã học {grp.totalCompleted.toLocaleString('vi-VN')}
                                </span>
                              )}
                              <span className="font-bold text-emerald-900 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                                ĐK 2027: {grp.totalParticipants.toLocaleString('vi-VN')} người
                              </span>
                            </div>
                          </div>

                          {/* Accordion từng Chương trình */}
                          <div className="space-y-3">
                            {grp.programs.map((prog: any) => {
                              const isExpanded = !!unitExpandedPrograms[prog.program_id];
                              const hasRegistered = prog.sum_participants > 0;

                              return (
                                <div
                                  key={prog.demand_program_id || prog.program_id}
                                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                                >
                                  {/* Accordion Header */}
                                  <div
                                    onClick={() => toggleUnitAccordion(prog.program_id)}
                                    className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-emerald-50/20 hover:bg-slate-50/80 cursor-pointer flex flex-wrap items-center justify-between gap-4 select-none"
                                  >
                                    <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
                                      <button
                                        type="button"
                                        className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-5 h-5 text-emerald-700" />
                                        ) : (
                                          <ChevronRight className="w-5 h-5 text-slate-500" />
                                        )}
                                      </button>
                                      <div>
                                        <div className="flex items-center space-x-2 mb-1">
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white font-mono">
                                            {prog.program_code}
                                          </span>
                                          {hasRegistered ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                              ĐK {prog.sum_participants.toLocaleString('vi-VN')} người
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                              Chưa nhập số lượng
                                            </span>
                                          )}
                                          {(prog.sum_completed || 0) > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                              Đã học {(prog.sum_completed || 0).toLocaleString('vi-VN')}
                                            </span>
                                          )}
                                        </div>
                                        <h5 className="text-sm font-bold text-slate-900 leading-snug">
                                          {prog.program_name}
                                        </h5>
                                        {prog.notes && (
                                          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded px-2 py-0.5 mt-1 inline-block">
                                            <span className="font-bold">Ghi chú của đơn vị:</span> {prog.notes}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center space-x-4">
                                      <div className="text-right">
                                        <div className="text-sm font-extrabold text-emerald-800">
                                          {prog.sum_participants.toLocaleString('vi-VN')} người
                                        </div>
                                        <div className="text-xs text-slate-500">
                                          {prog.registered_topic_count} / {prog.total_available_topics} chuyên đề
                                        </div>
                                        {(prog.sum_completed || 0) > 0 && (
                                          <div className="text-[11px] font-semibold text-blue-700">
                                            Đã học: {(prog.sum_completed || 0).toLocaleString('vi-VN')}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Accordion Body: Bảng chi tiết các chuyên đề với đầy đủ 13 cột chuẩn */}
                                  {isExpanded && (
                                    <div className="border-t border-slate-200 p-0 overflow-x-auto">
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-[#F8F9FA] text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200 tracking-wider">
                                          <tr>
                                            <th className="px-2 py-2.5 w-10 text-center whitespace-normal leading-tight">
                                              STT
                                            </th>
                                            <th className="px-1.5 py-2.5 w-16 max-w-[68px] text-center whitespace-normal leading-tight">
                                              Vị trí<br />chức danh
                                            </th>
                                            <th className="px-3 py-2.5 min-w-[200px] whitespace-normal leading-tight">
                                              Tên chuyên đề
                                            </th>
                                            <th className="px-1.5 py-2.5 w-20 max-w-[80px] text-center whitespace-normal leading-tight">
                                              Hình thức<br />đào tạo
                                            </th>
                                            <th className="px-1.5 py-2.5 w-16 max-w-[68px] text-center whitespace-normal leading-tight">
                                              Thời<br />lượng
                                            </th>
                                            <th className="px-1.5 py-2.5 w-20 max-w-[80px] text-center whitespace-normal leading-tight">
                                              Lộ trình<br />đào tạo
                                            </th>
                                            <th className="px-1 py-2.5 w-14 max-w-[60px] text-center whitespace-normal leading-tight">
                                              Năng<br />lực
                                            </th>
                                            <th className="px-2.5 py-2.5 min-w-[160px] whitespace-normal leading-tight">
                                              Chứng chỉ /<br />Chuẩn đào tạo
                                            </th>
                                            <th className="px-1.5 py-2.5 w-16 max-w-[68px] text-center whitespace-normal leading-tight text-[9px]">
                                              Quy hoạch<br />VT cao hơn
                                            </th>
                                            <th className="px-1.5 py-2.5 w-16 max-w-[68px] text-center whitespace-normal leading-tight text-[9px]">
                                              Bổ nhiệm<br />VT cao hơn
                                            </th>
                                            <th className="px-1.5 py-2.5 w-14 max-w-[58px] text-center whitespace-normal leading-tight text-[9px]">
                                              Bổ nhiệm<br />lại
                                            </th>
                                            <th className="px-3 py-2.5 w-24 text-right bg-blue-50/70 text-blue-900 font-extrabold border-l border-blue-100 whitespace-normal leading-tight">
                                              Đã học
                                            </th>
                                            <th className="px-3 py-2.5 w-28 text-right bg-emerald-50/70 text-emerald-900 font-extrabold border-l border-emerald-100 whitespace-normal leading-tight">
                                              Đăng ký học<br />năm 2027
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {prog.topics && prog.topics.length > 0 ? (
                                            prog.topics.map((t: any, idx: number) => {
                                              const hasRegistered = (t.participant_count || 0) > 0;
                                              const hasCompleted = (t.completed_count || 0) > 0;
                                              return (
                                                <tr
                                                  key={t.demand_topic_id || idx}
                                                  className={`hover:bg-slate-50 transition-colors ${
                                                    hasRegistered ? 'bg-emerald-50/20' : ''
                                                  }`}
                                                >
                                                  <td className="px-2 py-2 text-center text-slate-400 font-medium">
                                                    {idx + 1}
                                                  </td>
                                                  <td className="px-2 py-2 text-center font-mono font-bold text-slate-700 bg-slate-50/50">
                                                    {t.position_code || '—'}
                                                  </td>
                                                  <td className="px-3 py-2 font-semibold text-slate-900 whitespace-normal leading-snug">
                                                    {t.topic_name}
                                                  </td>
                                                  <td className="px-2 py-2 text-slate-600 text-center text-xs">
                                                    {t.delivery_method || '—'}
                                                  </td>
                                                  <td className="px-2 py-2 text-slate-700 font-medium text-center text-xs">
                                                    {t.duration || '—'}
                                                  </td>
                                                  <td className="px-2 py-2 text-slate-600 text-center whitespace-normal leading-tight text-xs">
                                                    {t.learning_path || '—'}
                                                  </td>
                                                  <td className="px-2 py-2 text-center font-medium text-slate-600 text-xs">
                                                    {t.competency || '—'}
                                                  </td>
                                                  <td className="px-2.5 py-2 text-slate-600 whitespace-normal leading-snug text-[11px]">
                                                    {t.certificate_requirement || t.target_audience || '—'}
                                                  </td>
                                                  <td className="px-1.5 py-2 text-center font-bold text-slate-700 text-xs">
                                                    {t.cert_planning_higher || '—'}
                                                  </td>
                                                  <td className="px-1.5 py-2 text-center font-bold text-slate-700 text-xs">
                                                    {t.cert_appoint_higher || '—'}
                                                  </td>
                                                  <td className="px-1.5 py-2 text-center font-bold text-slate-700 text-xs">
                                                    {t.cert_reappoint || '—'}
                                                  </td>
                                                  <td className="px-2.5 py-2 text-right bg-blue-50/30 border-l border-blue-100">
                                                    <span
                                                      className={`inline-block font-bold px-2.5 py-1 rounded-lg text-xs ${
                                                        hasCompleted
                                                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                                          : 'text-slate-400 bg-slate-100'
                                                      }`}
                                                    >
                                                      {(t.completed_count || 0).toLocaleString('vi-VN')} người
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-right bg-emerald-50/30 border-l border-emerald-100">
                                                    <span
                                                      className={`inline-block font-extrabold px-2.5 py-1 rounded-lg text-xs ${
                                                        hasRegistered
                                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                          : 'text-slate-400 bg-slate-100'
                                                      }`}
                                                    >
                                                      {(t.participant_count || 0).toLocaleString('vi-VN')} người
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })
                                          ) : (
                                            <tr>
                                              <td colSpan={13} className="p-4 text-center text-slate-400">
                                                Không có chuyên đề nào trong chương trình này.
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : unitPositionRecords.length > 0 ? (
                    /* Dữ liệu vị trí cũ (backward compatibility) */
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h4 className="font-bold text-slate-700 text-sm">
                          Chi tiết các Vị trí và Chuyên đề đã đăng ký ({unitPositionRecords.length} bản ghi)
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-100 text-slate-600 text-xs font-bold uppercase border-b">
                            <tr>
                              <th className="py-3 px-4 w-12 text-center">STT</th>
                              <th className="py-3 px-4 w-64">Vị trí / Chức danh</th>
                              <th className="py-3 px-3 text-center w-36">Tổng nhân sự vị trí</th>
                              <th className="py-3 px-4">Tên Chuyên đề đào tạo</th>
                              <th className="py-3 px-3 w-32">Hình thức</th>
                              <th className="py-3 px-3 w-28 text-center">Thời lượng</th>
                              <th className="py-3 px-4 w-32 text-right font-bold text-emerald-800 bg-emerald-50">
                                Số người đăng ký
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {unitPositionRecords.map((r: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-3 px-4 text-center font-medium text-slate-400">{idx + 1}</td>
                                <td className="py-3 px-4">
                                  <span className="font-semibold text-slate-800">[{r.position_code}] {r.position_name}</span>
                                </td>
                                <td className="py-3 px-3 text-center text-slate-600 font-medium">
                                  {r.target_headcount || 0} người
                                </td>
                                <td className="py-3 px-4 text-slate-800 font-medium">{r.topic_name}</td>
                                <td className="py-3 px-3 text-xs text-slate-600">{r.delivery_method || 'Trực tiếp'}</td>
                                <td className="py-3 px-3 text-xs text-center text-slate-600">{r.duration || '02 ngày'}</td>
                                <td className="py-3 px-4 text-right font-bold text-emerald-700 bg-emerald-50/40">
                                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                                    {r.participant_count}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {/* ĐỀ XUẤT NGOÀI KHUNG (MỤC 2.8) */}
                  {unitProposals.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500" />
                          <h4 className="text-base font-bold text-slate-900">
                            Đề xuất nhu cầu ngoài khung chương trình đào tạo
                          </h4>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                            Mục 2.8
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                          {unitProposals.length} đề xuất
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                          <thead className="bg-[#F8F9FA] text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                            <tr>
                              <th className="px-3 py-3 w-10 text-center">STT</th>
                              <th className="px-4 py-3 min-w-[220px]">Tên đề xuất chuyên đề / khóa học</th>
                              <th className="px-4 py-3 min-w-[180px]">Đối tượng tham gia</th>
                              <th className="px-3 py-3 w-28 text-right font-bold text-emerald-800 bg-emerald-50">Số người dự kiến</th>
                              <th className="px-3 py-3 w-28 text-center">Thời lượng</th>
                              <th className="px-4 py-3 min-w-[200px]">Ghi chú / Đề xuất chi tiết</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {unitProposals.map((p: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                                <td className="px-4 py-2.5 font-bold text-slate-900">{p.proposal_name}</td>
                                <td className="px-4 py-2.5 text-slate-700">{p.target_audience || '—'}</td>
                                <td className="px-3 py-2.5 text-right font-extrabold text-emerald-800 bg-emerald-50/50">
                                  {p.participant_count} người
                                </td>
                                <td className="px-3 py-2.5 text-center text-slate-700 font-medium">{p.expected_duration || '—'}</td>
                                <td className="px-4 py-2.5 text-slate-600">{p.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* THÔNG BÁO NẾU ĐƠN VỊ HOÀN TOÀN CHƯA KÊ KHAI GÌ */}
                  {!hasAnyData && (
                    <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
                      <div className="p-4 bg-slate-100 text-slate-500 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-3">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <h4 className="text-base font-bold text-slate-800 mb-1">
                        Đơn vị này chưa đăng ký chuyên đề nào
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Chi nhánh chưa thực hiện khảo sát hoặc chưa đăng ký chuyên đề nào trong đợt thu thập dữ liệu này.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()
          ) : null}
        </div>
      )}

      {/* TAB 4: QUẢN TRỊ MASTER CATALOG & AUDIT (STAGE 2 REQUIREMENT) */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Sub Navigation */}
          <div className="flex gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setCatalogSubTab('browse')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                catalogSubTab === 'browse'
                  ? 'bg-[#005F3E] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tra cứu & Quản lý Danh mục (284 Vị trí)
            </button>
            <button
              onClick={() => setCatalogSubTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                catalogSubTab === 'audit'
                  ? 'bg-[#005F3E] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Kiểm tra dữ liệu (Duplicates, Vị trí trống, N-N)</span>
            </button>
          </div>

          {/* Sub-tab 1: Tra cứu & Quản lý Active/Inactive */}
          {catalogSubTab === 'browse' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-64">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nhóm vị trí</label>
                  <select
                    value={catalogGroup}
                    onChange={(e) => setCatalogGroup(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Tất cả các nhóm --</option>
                    {positionGroups.map((g, idx) => (
                      <option key={idx} value={g.group_name}>{g.group_name} ({g.count})</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tìm kiếm Vị trí</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Mã vị trí hoặc tên vị trí..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <div className="text-sm font-bold text-slate-700">
                    Danh mục Vị trí / Chức danh chuẩn (284 vị trí)
                  </div>
                  <div className="text-xs text-slate-500">
                    Bấm vào dòng để xem danh sách chuyên đề tương ứng & bật/tắt kích hoạt
                  </div>
                </div>

                <div className="divide-y divide-slate-200">
                  {positions
                    .filter(p => {
                      const matchSearch = p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                                          p.code.toLowerCase().includes(catalogSearch.toLowerCase());
                      const matchGroup = !catalogGroup || p.group_name === catalogGroup;
                      return matchSearch && matchGroup;
                    })
                    .map((pos) => {
                      const isExpanded = expandedPosition === pos.id;
                      return (
                        <div key={pos.id} className="transition-colors">
                          <div
                            className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 ${
                              isExpanded ? 'bg-emerald-50/50 border-l-4 border-[#005F3E]' : ''
                            }`}
                          >
                            <div
                              onClick={() => toggleExpandPosition(pos.id)}
                              className="flex items-center gap-3 flex-1"
                            >
                              <span className="font-mono text-xs font-bold bg-slate-200 px-2 py-1 rounded text-slate-700">
                                {pos.code}
                              </span>
                              <div>
                                <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                  <span>{pos.name}</span>
                                  {pos.status === 'INACTIVE' && (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded">
                                      Vô hiệu hóa (INACTIVE)
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">Nhóm: {pos.group_name}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleStatus('POSITION', pos.id);
                                }}
                                disabled={togglingId === pos.id}
                                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                                  pos.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {pos.status === 'ACTIVE' ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Đang áp dụng</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Đã tắt</span>
                                  </>
                                )}
                              </button>

                              <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                                {pos.topic_count} chuyên đề
                              </span>
                              <button
                                onClick={() => toggleExpandPosition(pos.id)}
                                className="text-xs text-slate-400 font-medium"
                              >
                                {isExpanded ? '▲ Thu gọn' : '▼ Xem chuyên đề'}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Topics Table */}
                          {isExpanded && (
                            <div className="p-4 bg-slate-50/70 border-t border-slate-200">
                              {topicsLoading ? (
                                <div className="py-4 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                                  <span>Đang tải chuyên đề...</span>
                                </div>
                              ) : positionTopics.length > 0 ? (
                                <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100 font-bold text-slate-600 border-b">
                                      <tr>
                                        <th className="p-2.5 w-10 text-center">STT</th>
                                        <th className="p-2.5">Tên Chuyên đề</th>
                                        <th className="p-2.5 w-28">Hình thức</th>
                                        <th className="p-2.5 w-24 text-center">Thời lượng</th>
                                        <th className="p-2.5 w-32">Năng lực</th>
                                        <th className="p-2.5 w-28 text-center">Trạng thái</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {positionTopics.map((top, idx) => (
                                        <tr key={top.id} className="hover:bg-slate-50">
                                          <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                                          <td className="p-2.5 font-semibold text-slate-800">{top.name}</td>
                                          <td className="p-2.5 text-slate-600">{top.delivery_method || 'Trực tiếp'}</td>
                                          <td className="p-2.5 text-center text-slate-600">{top.duration || '02 ngày'}</td>
                                          <td className="p-2.5 text-slate-500">{top.competency || '—'}</td>
                                          <td className="p-2.5 text-center">
                                            <button
                                              onClick={() => handleToggleStatus('TOPIC', top.id)}
                                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                                top.status === 'ACTIVE'
                                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                                              }`}
                                            >
                                              {top.status === 'ACTIVE' ? 'Kích hoạt' : 'Đã tắt'}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500 italic">Vị trí này chưa có chuyên đề tương ứng.</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Sub-tab 2: Audit dữ liệu Master Catalog */}
          {catalogSubTab === 'audit' && (
            <div className="space-y-4">
              {auditLoading ? (
                <div className="bg-white p-12 text-center text-slate-500 rounded-xl border border-slate-200">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                  <span>Đang rà soát và kiểm tra tính toàn vẹn dữ liệu Master Catalog...</span>
                </div>
              ) : auditStats ? (
                <div className="space-y-4">
                  {/* Audit KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-500 font-medium">Tổng số Vị trí chức danh</div>
                      <div className="text-2xl font-black text-slate-800 mt-1">
                        {auditStats.summary?.totalPositions}
                      </div>
                      <div className="text-xs text-emerald-600 font-medium mt-1">
                        {auditStats.summary?.activePositions} đang kích hoạt | {auditStats.summary?.inactivePositions} đã tắt
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-500 font-medium">Tổng số Chuyên đề đào tạo</div>
                      <div className="text-2xl font-black text-blue-700 mt-1">
                        {auditStats.summary?.totalTopics}
                      </div>
                      <div className="text-xs text-blue-600 font-medium mt-1">
                        {auditStats.summary?.activeTopics} đang kích hoạt | {auditStats.summary?.inactiveTopics} đã tắt
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-500 font-medium">Chuyên đề đa vị trí (N-N)</div>
                      <div className="text-2xl font-black text-purple-700 mt-1">
                        {auditStats.summary?.multiPositionTopicsCount}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1">
                        Xuất hiện ở $\ge 2$ vị trí (Quản lý độc lập)
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-500 font-medium">Kiểm tra trùng lặp (Duplicate)</div>
                      <div className="text-2xl font-black text-emerald-700 mt-1">
                        {auditStats.summary?.duplicateTopicNamesCount + auditStats.summary?.duplicatePositionCodesCount === 0 ? '0' : 'Cảnh báo'}
                      </div>
                      <div className="text-xs text-emerald-600 font-medium mt-1">
                        100% mã vị trí và tên chuyên đề chuẩn hóa
                      </div>
                    </div>
                  </div>

                  {/* Multi-position topics section */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-sm">
                        Danh sách chuyên đề xuất hiện ở nhiều vị trí ({auditStats.multiPositionTopics?.length || 0} chuyên đề)
                      </h4>
                      <span className="text-xs text-slate-500">Bảo đảm quản lý số lượng độc lập theo từng vị trí</span>
                    </div>

                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 font-bold text-slate-600 sticky top-0 border-b">
                          <tr>
                            <th className="p-2.5 w-12 text-center">STT</th>
                            <th className="p-2.5">Tên Chuyên đề</th>
                            <th className="p-2.5 w-32">Hình thức</th>
                            <th className="p-2.5 w-24 text-center">Thời lượng</th>
                            <th className="p-2.5 w-36 text-right font-bold text-purple-800 bg-purple-50">
                              Số vị trí áp dụng
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditStats.multiPositionTopics?.map((t: any, idx: number) => (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                              <td className="p-2.5 font-semibold text-slate-800">{t.name}</td>
                              <td className="p-2.5 text-slate-600">{t.delivery_method || 'Trực tiếp'}</td>
                              <td className="p-2.5 text-center text-slate-600">{t.duration || '02 ngày'}</td>
                              <td className="p-2.5 text-right font-bold text-purple-700 bg-purple-50/40">
                                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">
                                  {t.position_count} vị trí
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Positions without topics if any */}
                  {auditStats.positionsWithoutTopics && auditStats.positionsWithoutTopics.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                      <div className="p-4 bg-amber-50 border-b border-amber-200">
                        <h4 className="font-bold text-amber-900 text-sm">
                          Vị trí chức danh chưa được gán chuyên đề ({auditStats.positionsWithoutTopics.length} vị trí)
                        </h4>
                      </div>
                      <div className="p-4 flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                        {auditStats.positionsWithoutTopics.map((p: any) => (
                          <span key={p.id} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                            [{p.code}] {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: XUẤT EXCEL TỔNG HỢP (STAGE 4: EXPORT EXCEL) */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 0: Báo cáo theo Khung Chương trình (Phụ lục) */}
          <div className="bg-white p-5 rounded-xl border border-emerald-300 shadow-sm flex flex-col justify-between bg-emerald-50/20">
            <div>
              <div className="p-3 bg-emerald-600 text-white rounded-lg w-fit mb-3">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">
                Theo Khung CT (Phụ lục)
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Xuất ma trận số lượng người đăng ký của các đơn vị toàn hệ thống theo từng chuyên đề của Khung chương trình đang chọn.
              </p>
            </div>
            {selectedProgramId ? (
              <a
                href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_PROGRAM&programId=${selectedProgramId}`}
                className="inline-flex items-center justify-center gap-1.5 bg-[#005F3E] hover:bg-[#004d32] text-white py-2 px-3 rounded-lg text-xs font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Excel Khung CT</span>
              </a>
            ) : (
              <button disabled className="bg-slate-200 text-slate-400 py-2 px-3 rounded-lg text-xs font-semibold cursor-not-allowed">
                Chọn CT tại Tab 1
              </button>
            )}
          </div>

          {/* Card 1: Tổng hợp toàn hệ thống */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-lg w-fit mb-3">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">
                Toàn hệ thống (Tổng hợp)
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Xuất tất cả Chương trình & Chuyên đề kèm tổng số người đăng ký từ các đơn vị toàn hệ thống.
              </p>
            </div>
            <a
              href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=ALL_SYSTEM"
              className="inline-flex items-center justify-center gap-1.5 bg-[#005F3E] hover:bg-[#004d32] text-white py-2 px-3 rounded-lg text-xs font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file Tổng hợp</span>
            </a>
          </div>

          {/* Card 2: Báo cáo Ma trận theo Vị trí */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-3 bg-blue-100 text-blue-800 rounded-lg w-fit mb-4">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base mb-1">
                2. Theo Vị trí (Ma trận Toàn Mạng Lưới)
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Xuất ma trận số lượng đăng ký của từng đơn vị đối với từng chuyên đề thuộc vị trí được chọn.
              </p>
            </div>
            {selectedPositionId ? (
              <a
                href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_POSITION&positionId=${selectedPositionId}`}
                className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Tải Excel Vị trí</span>
              </a>
            ) : (
              <button disabled className="bg-slate-200 text-slate-400 py-2.5 px-4 rounded-lg text-sm font-semibold cursor-not-allowed">
                Chọn vị trí tại Tab 1
              </button>
            )}
          </div>

          {/* Card 3: Báo cáo theo Chuyên đề (STAGE 4 REQUIREMENT) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-3 bg-teal-100 text-teal-800 rounded-lg w-fit mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base mb-1">
                3. Theo Chuyên đề
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Xuất danh sách các đơn vị và các vị trí đăng ký chuyên đề được chọn kèm theo số người có nhu cầu.
              </p>
            </div>
            {selectedTopicId ? (
              <a
                href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_TOPIC&topicId=${selectedTopicId}`}
                className="inline-flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Tải Excel Chuyên đề</span>
              </a>
            ) : (
              <button disabled className="bg-slate-200 text-slate-400 py-2.5 px-4 rounded-lg text-sm font-semibold cursor-not-allowed">
                Chọn chuyên đề tại Tab 2
              </button>
            )}
          </div>

          {/* Card 4: Báo cáo theo Đơn vị */}
          <div className="bg-white p-5 rounded-xl border border-purple-200 shadow-sm flex flex-col justify-between bg-purple-50/20">
            <div>
              <div className="p-3 bg-purple-600 text-white rounded-lg w-fit mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm mb-1">
                Theo Đơn vị (Toàn bộ / Đơn lẻ)
              </h3>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Xuất toàn bộ nhu cầu đào tạo của toàn mạng lưới ({units.length || 203} đơn vị gồm 2 Sheet: Tổng hợp & Chi tiết) hoặc một đơn vị cụ thể.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href="/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=ALL"
                className="inline-flex items-center justify-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white py-2 px-3 rounded-lg text-xs font-bold transition-colors shadow-sm"
                title="Tải toàn bộ dữ liệu gồm Sheet 1 Tổng hợp và Sheet 2 Chi tiết"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Toàn Bộ {units.length || 203} Đơn Vị</span>
              </a>
              {selectedUnitId && selectedUnitId !== 'ALL' && (
                <a
                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${selectedUnitId}`}
                  className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải riêng ĐV đang chọn</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SO SÁNH BIẾN ĐỘNG GIỮA HAI ĐỢT KHẢO SÁT (MỤC 2.7) */}
      {activeTab === 'compare' && (
        <div className="space-y-5">
          {/* Thanh công cụ chọn 2 đợt */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 flex-1">
              {/* Chọn Đợt Cơ Sở (Đợt 1) */}
              <div className="w-full sm:w-64">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đợt 1 (Đợt cơ sở / Đợt cũ):
                </label>
                <select
                  value={baseCollId}
                  onChange={(e) => setBaseCollId(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#005F3E] focus:outline-none bg-slate-50"
                >
                  {collections.map(c => (
                    <option key={`base-${c.id}`} value={c.id}>
                      {c.code} - {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mũi tên so sánh */}
              <div className="hidden sm:flex items-center pt-5 text-slate-400">
                <ArrowRight className="w-5 h-5" />
              </div>

              {/* Chọn Đợt So Sánh (Đợt 2) */}
              <div className="w-full sm:w-64">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đợt 2 (Đợt so sánh / Đợt mới):
                </label>
                <select
                  value={targetCollId}
                  onChange={(e) => setTargetCollId(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#005F3E] focus:outline-none bg-slate-50"
                >
                  {collections.map(c => (
                    <option key={`target-${c.id}`} value={c.id}>
                      {c.code} - {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nút bấm so sánh */}
              <div className="pt-0 sm:pt-5">
                <button
                  type="button"
                  onClick={() => handleRunComparison()}
                  disabled={comparisonLoading || !baseCollId || !targetCollId}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {comparisonLoading ? 'Đang phân tích...' : 'So Sánh Biến Động'}
                </button>
              </div>
            </div>

            {/* Nút Xuất Excel */}
            {comparisonData && (
              <div className="pt-0 sm:pt-5">
                <a
                  href={`/api/training-reports?type=EXPORT_COMPARISON&baseCollectionId=${baseCollId}&targetCollectionId=${targetCollId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#F2A900] hover:bg-[#d99700] text-slate-900 rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Xuất Excel So Sánh
                </a>
              </div>
            )}
          </div>

          {/* Dữ liệu so sánh */}
          {comparisonLoading ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              Đang phân tích dữ liệu chênh lệch giữa hai đợt khảo sát...
            </div>
          ) : !comparisonData ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
              Chọn hai đợt khảo sát và bấm &quot;So Sánh Biến Động&quot; để xem báo cáo.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Thẻ KPI Tổng Hợp Biến Động */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    {comparisonData.baseColl?.title} (Đợt 1)
                  </div>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1.5">
                    {comparisonData.summary?.baseTotal.toLocaleString('vi-VN')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {comparisonData.summary?.baseUnitsCount} đơn vị tham gia
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    {comparisonData.targetColl?.title} (Đợt 2)
                  </div>
                  <div className="text-2xl font-extrabold text-[#005F3E] mt-1.5">
                    {comparisonData.summary?.targetTotal.toLocaleString('vi-VN')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {comparisonData.summary?.targetUnitsCount} đơn vị tham gia
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Chênh Lệch Nhu Cầu (+/-)
                  </div>
                  <div className={`text-2xl font-extrabold mt-1.5 ${
                    comparisonData.summary?.totalDiff > 0
                      ? 'text-emerald-600'
                      : comparisonData.summary?.totalDiff < 0
                      ? 'text-rose-600'
                      : 'text-slate-600'
                  }`}>
                    {comparisonData.summary?.totalDiff > 0 ? '+' : ''}
                    {comparisonData.summary?.totalDiff.toLocaleString('vi-VN')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Tổng số lượt người học</div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Tỷ Lệ Tăng / Giảm
                  </div>
                  <div className="text-2xl font-extrabold text-blue-600 mt-1.5">
                    {comparisonData.summary?.baseTotal > 0
                      ? `${(((comparisonData.summary?.totalDiff) / comparisonData.summary?.baseTotal) * 100).toFixed(1)}%`
                      : 'N/A'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">So với đợt cơ sở</div>
                </div>
              </div>

              {/* Sub-tabs: Theo Chuyên đề vs Theo Đơn vị */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComparisonSubTab('topics')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        comparisonSubTab === 'topics'
                          ? 'bg-[#005F3E] text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Biến Động Theo Chuyên Đề ({comparisonData.topicComparison?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparisonSubTab('units')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        comparisonSubTab === 'units'
                          ? 'bg-[#005F3E] text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Biến Động Theo Đơn Vị ({comparisonData.unitComparison?.length || 0})
                    </button>
                  </div>
                </div>

                {/* BẢNG 1: BIẾN ĐỘNG THEO CHUYÊN ĐỀ */}
                {comparisonSubTab === 'topics' && (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#F4F6F8] font-bold text-slate-700 uppercase text-[11px] sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="px-4 py-3 w-14 text-center">STT</th>
                          <th className="px-4 py-3 w-64">Khung Chương trình</th>
                          <th className="px-4 py-3">Tên chuyên đề</th>
                          <th className="px-4 py-3 w-28 text-right font-mono">Đợt 1</th>
                          <th className="px-4 py-3 w-28 text-right font-mono text-[#005F3E]">Đợt 2</th>
                          <th className="px-4 py-3 w-32 text-right font-mono">Chênh lệch</th>
                          <th className="px-4 py-3 w-24 text-right font-mono">% Biến động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonData.topicComparison?.map((t: any, idx: number) => {
                          const isUp = t.diff > 0;
                          const isDown = t.diff < 0;
                          return (
                            <tr key={`topic-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-600">{t.programName}</td>
                              <td className="px-4 py-2.5 font-bold text-slate-900">{t.topicName}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-slate-600">{t.baseCount.toLocaleString('vi-VN')}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-[#005F3E]">{t.targetCount.toLocaleString('vi-VN')}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                                isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-400'
                              }`}>
                                {isUp ? `+${t.diff.toLocaleString('vi-VN')}` : t.diff.toLocaleString('vi-VN')}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono text-[11px] font-semibold ${
                                isUp ? 'text-emerald-700' : isDown ? 'text-rose-700' : 'text-slate-400'
                              }`}>
                                {t.percentChange}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* BẢNG 2: BIẾN ĐỘNG THEO ĐƠN VỊ */}
                {comparisonSubTab === 'units' && (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-[#F4F6F8] font-bold text-slate-700 uppercase text-[11px] sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="px-4 py-3 w-14 text-center">STT</th>
                          <th className="px-4 py-3 w-36 font-mono text-[#005F3E]">Mã đơn vị</th>
                          <th className="px-4 py-3">Tên đơn vị</th>
                          <th className="px-4 py-3 w-32 text-right font-mono">Đợt 1</th>
                          <th className="px-4 py-3 w-32 text-right font-mono text-[#005F3E]">Đợt 2</th>
                          <th className="px-4 py-3 w-36 text-right font-mono">Chênh lệch</th>
                          <th className="px-4 py-3 w-28 text-right font-mono">% Biến động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonData.unitComparison?.map((u: any, idx: number) => {
                          const isUp = u.diff > 0;
                          const isDown = u.diff < 0;
                          return (
                            <tr key={`unit-${idx}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{u.unitCode}</td>
                              <td className="px-4 py-2.5 font-semibold text-slate-800">{u.unitName}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-slate-600">{u.baseCount.toLocaleString('vi-VN')}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-[#005F3E]">{u.targetCount.toLocaleString('vi-VN')}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                                isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-400'
                              }`}>
                                {isUp ? `+${u.diff.toLocaleString('vi-VN')}` : u.diff.toLocaleString('vi-VN')}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono text-[11px] font-semibold ${
                                isUp ? 'text-emerald-700' : isDown ? 'text-rose-700' : 'text-slate-400'
                              }`}>
                                {u.percentChange}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: ĐỀ XUẤT NGOÀI KHUNG (MỤC 2.8) */}
      {activeTab === 'proposal' && (
        <div className="space-y-4">
          {/* Thanh công cụ tìm kiếm và nút xuất Excel */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Tìm theo tên chuyên đề, tên đơn vị hoặc mã đơn vị..."
                  value={proposalSearch}
                  onChange={(e) => setProposalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={loadProposalsData}
                disabled={proposalsLoading}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${proposalsLoading ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/api/training-reports?type=EXPORT_PROPOSALS"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                title="Tải toàn bộ đề xuất ngoài khung của các đơn vị thành file Excel"
              >
                <Download className="w-4 h-4" />
                <span>Xuất Excel Đề Xuất Ngoài Khung</span>
              </a>
            </div>
          </div>

          {/* Dữ liệu và KPI */}
          {proposalsLoading ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
              Đang tải danh sách đề xuất ngoài khung từ các đơn vị...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Thẻ KPI */}
              {(() => {
                const filtered = proposalsList.filter(p => {
                  if (!proposalSearch.trim()) return true;
                  const q = proposalSearch.toLowerCase();
                  return (
                    (p.proposal_name && p.proposal_name.toLowerCase().includes(q)) ||
                    (p.unit_name && p.unit_name.toLowerCase().includes(q)) ||
                    (p.unit_code && p.unit_code.toLowerCase().includes(q)) ||
                    (p.target_audience && p.target_audience.toLowerCase().includes(q))
                  );
                });

                const totalParticipants = filtered.reduce((s, p) => s + (p.participant_count || 0), 0);
                const uniqueUnitsCount = new Set(filtered.map(p => p.unit_code)).size;

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Tổng số chuyên đề đề xuất
                        </div>
                        <div className="text-2xl font-extrabold text-slate-800 mt-1">
                          {filtered.length.toLocaleString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Từ các đơn vị toàn hệ thống
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Tổng lượt người học dự kiến
                        </div>
                        <div className="text-2xl font-extrabold text-[#005F3E] mt-1">
                          {totalParticipants.toLocaleString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Lượt cán bộ nhân viên
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Số đơn vị gửi đề xuất
                        </div>
                        <div className="text-2xl font-extrabold text-amber-600 mt-1">
                          {uniqueUnitsCount.toLocaleString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Đơn vị có phát sinh nhu cầu ngoài khung
                        </div>
                      </div>
                    </div>

                    {/* Bảng chi tiết */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wide">
                          Danh sách chi tiết nhu cầu đào tạo ngoài 26 khung chuẩn ({filtered.length} bản ghi)
                        </h4>
                      </div>

                      {filtered.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          Chưa có bản ghi đề xuất nào phù hợp.
                        </div>
                      ) : (
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-[#F4F6F8] font-bold text-slate-700 uppercase text-[11px] sticky top-0 border-b border-slate-200 z-10">
                              <tr>
                                <th className="px-3 py-3 w-12 text-center">STT</th>
                                <th className="px-3 py-3 w-28 font-mono text-[#005F3E]">Mã ĐV</th>
                                <th className="px-4 py-3 min-w-[160px]">Tên đơn vị</th>
                                <th className="px-4 py-3 min-w-[220px]">Tên đề xuất chuyên đề / khóa học</th>
                                <th className="px-4 py-3 min-w-[180px]">Đối tượng tham gia</th>
                                <th className="px-3 py-3 w-28 text-right font-mono">Số người</th>
                                <th className="px-3 py-3 w-28 text-center">Thời lượng</th>
                                <th className="px-4 py-3 min-w-[200px]">Ghi chú / Chi tiết</th>
                                <th className="px-3 py-3 w-36 text-center text-slate-500 font-mono">Ngày đề xuất</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filtered.map((item, idx) => (
                                <tr key={`prop-${item.id || idx}`} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                  <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{item.unit_code}</td>
                                  <td className="px-4 py-2.5 font-semibold text-slate-800">{item.unit_name}</td>
                                  <td className="px-4 py-2.5 font-bold text-[#005F3E]">{item.proposal_name}</td>
                                  <td className="px-4 py-2.5 text-slate-600">{item.target_audience || '—'}</td>
                                  <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                    {Number(item.participant_count || 0).toLocaleString('vi-VN')}
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-slate-600">{item.expected_duration || '—'}</td>
                                  <td className="px-4 py-2.5 text-slate-600">{item.notes || '—'}</td>
                                  <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                                    {item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADMIN NỘP HỘ HÀNG LOẠT NHIỀU FILE EXCEL (BATCH PROXY UPLOAD) */}
      {/* ========================================================================= */}
      <BatchProxyUploadModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        defaultCollectionId={summary?.collectionId}
        onSuccess={() => {
          loadSummaryAndBaseData();
          if (selectedUnitId) {
            fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}`)
              .then(r => r.ok ? r.json() : null)
              .then(uData => { if (uData) setUnitReportData(uData); })
              .catch(() => {});
          }
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL: ADMIN NỘP HỘ FILE EXCEL KHẢO SÁT ĐÀO TẠO CHO ĐƠN VỊ (NHẬN QUA EMAIL) */}
      {/* ========================================================================= */}
      {showProxyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3.5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-[#005F3E] rounded-xl border border-emerald-200">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>Nộp Hộ File Excel Khảo Sát Đào Tạo</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-[#005F3E] text-[10px] font-bold rounded-full uppercase">
                      Admin Proxy
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hỗ trợ đơn vị chưa biết thao tác tự kê khai trên web, nhận file Excel qua Email.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Thông báo lỗi / thành công */}
            {proxyError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{proxyError}</span>
              </div>
            )}
            {proxySuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{proxySuccessMsg}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              {/* Chọn Đơn Vị */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Đơn vị tiếp nhận hồ sơ <span className="text-[#A81D22]">*</span>
                </label>
                <select
                  value={proxyUnitId}
                  onChange={(e) => {
                    const uId = e.target.value === '' ? '' : parseInt(e.target.value);
                    setProxyUnitId(uId);
                    if (proxyFile && uId) {
                      runProxyPreview(proxyFile, Number(uId));
                    }
                  }}
                  className="w-full bg-[#F4F6F8] border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                >
                  <option value="">-- Chọn chi nhánh / đơn vị --</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      [{u.unit_code}] {u.unit_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Khu vực chọn file Excel */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    File Excel khảo sát của đơn vị (.xlsx, .xls) <span className="text-[#A81D22]">*</span>
                  </label>
                  <a
                    href="/api/training-demand/import-excel?action=TEMPLATE"
                    download
                    className="text-[11px] text-[#005F3E] hover:underline font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải file mẫu Excel chuẩn</span>
                  </a>
                </div>

                <div className="border-2 border-dashed border-slate-300 hover:border-[#005F3E] rounded-xl p-5 text-center bg-slate-50/60 hover:bg-emerald-50/30 transition-all cursor-pointer relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleProxyFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                    <FileUp className="w-8 h-8 text-[#005F3E]" />
                    <p className="font-bold text-slate-700 text-xs">
                      {proxyFile ? proxyFile.name : 'Bấm vào đây để chọn file Excel hoặc kéo thả file'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {proxyFile ? `${(proxyFile.size / 1024).toFixed(1)} KB` : 'Hỗ trợ định dạng .xlsx, .xls (Theo mẫu khảo sát hoặc file xuất từ hệ thống)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tùy chọn trạng thái & Ghi chú */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Trạng thái sau khi nạp file <span className="text-[#A81D22]">*</span>
                  </label>
                  <select
                    value={proxyStatus}
                    onChange={(e: any) => setProxyStatus(e.target.value)}
                    className="w-full bg-[#F4F6F8] border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                  >
                    <option value="SUBMITTED">★ Gửi chính thức & cấp Biên nhận ngay</option>
                    <option value="DRAFT">Lưu bản nháp (Để xem lại)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {proxyStatus === 'SUBMITTED'
                      ? 'Hệ thống sẽ lập tức tạo Biên nhận nộp có mã vạch và dấu xác nhận điện tử thay đơn vị.'
                      : 'Hồ sơ lưu dưới dạng Bản nháp, cho phép đơn vị hoặc Admin kiểm tra và chỉnh sửa tiếp.'}
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Ghi chú nguồn nhận <span className="text-slate-400 font-normal">(Lưu vào Audit Log)</span>
                  </label>
                  <input
                    type="text"
                    value={proxyNote}
                    onChange={(e) => setProxyNote(e.target.value)}
                    placeholder="VD: Nhận qua email từ cán bộ A ngày 16/10/2026"
                    className="w-full bg-[#F4F6F8] border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Ghi nhận nhật ký để phục vụ kiểm toán và đối chiếu sau này.
                  </p>
                </div>
              </div>

              {/* Bảng Preview kết quả bóc tách dữ liệu */}
              {proxyPreviewLoading ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#005F3E]" />
                  <span>Đang phân tích và bóc tách dữ liệu từ file Excel...</span>
                </div>
              ) : proxyPreviewData ? (
                <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-[#005F3E]" />
                      <span>Kết quả bóc tách dữ liệu từ file:</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-600">
                      {proxyPreviewData.totalRowsProcessed} dòng xử lý
                    </span>
                  </div>

                  {/* Thẻ KPI tóm tắt */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-emerald-200 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">Khung CT</div>
                      <div className="text-base font-extrabold text-[#005F3E]">{proxyPreviewData.programsCount}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-200 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">Khớp chuẩn</div>
                      <div className="text-base font-extrabold text-blue-700">{proxyPreviewData.topicsCount} CĐ</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                      <div className="text-[10px] text-amber-700 font-semibold uppercase">Không khớp</div>
                      <div className={`text-base font-extrabold ${proxyPreviewData.unmatchedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {proxyPreviewData.unmatchedCount || 0} dòng
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-red-200 shadow-2xs">
                      <div className="text-[10px] text-red-600 font-semibold uppercase">Lỗi ô số</div>
                      <div className={`text-base font-extrabold ${proxyPreviewData.errorsCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {proxyPreviewData.errorsCount || 0} ô
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-300 shadow-2xs bg-emerald-50">
                      <div className="text-[10px] text-emerald-800 font-bold uppercase">Tổng Người Học</div>
                      <div className="text-lg font-black text-[#A81D22]">
                        {Number(proxyPreviewData.grandTotalParticipants || 0).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  {/* Đối chiếu dòng Tổng cộng trong file nếu có */}
                  {proxyPreviewData.comparisonWithFileTotal && (
                    <div className={`p-2 rounded-lg text-[11px] font-medium border flex items-center justify-between ${
                      proxyPreviewData.comparisonWithFileTotal.match
                        ? 'bg-emerald-100/60 border-emerald-300 text-emerald-900'
                        : 'bg-amber-100/70 border-amber-300 text-amber-900 font-bold'
                    }`}>
                      <span>
                        {proxyPreviewData.comparisonWithFileTotal.match
                          ? '✓ Tổng số người khớp chính xác với dòng "Tổng cộng" trong file Excel'
                          : `⚠ Lệch tổng cộng: Tính từ các dòng = ${proxyPreviewData.comparisonWithFileTotal.calculatedSum} người vs Dòng "Tổng cộng" trong file = ${proxyPreviewData.comparisonWithFileTotal.reportedInFile} người`}
                      </span>
                    </div>
                  )}

                  {/* Danh sách lỗi dữ liệu (nếu có) */}
                  {proxyPreviewData.errors && proxyPreviewData.errors.length > 0 && (
                    <div className="text-[11px] text-red-800 bg-red-50 p-2.5 rounded-lg border border-red-300 space-y-1 max-h-28 overflow-y-auto">
                      <div className="font-bold flex items-center gap-1 text-red-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Phát hiện {proxyPreviewData.errors.length} lỗi định dạng số liệu (Cần sửa file trước khi nộp):</span>
                      </div>
                      {proxyPreviewData.errors.map((errStr: string, i: number) => (
                        <div key={i} className="pl-4 text-[10.5px]">• {errStr}</div>
                      ))}
                    </div>
                  )}

                  {/* Danh sách dòng không khớp chuẩn (nếu có) */}
                  {proxyPreviewData.unmatchedRows && proxyPreviewData.unmatchedRows.length > 0 && (
                    <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-300 space-y-1 max-h-28 overflow-y-auto">
                      <div className="font-bold flex items-center gap-1 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Có {proxyPreviewData.unmatchedRows.length} dòng không nhận diện được chuyên đề (sẽ không nạp):</span>
                      </div>
                      {proxyPreviewData.unmatchedRows.map((u: any, i: number) => (
                        <div key={i} className="pl-4 text-[10.5px]">
                          • Dòng {u.rowNumber} ({u.sheetName}): "{u.rawTopicName}" {u.rawTopicCode ? `[Mã: ${u.rawTopicCode}]` : ''} - SL: {u.rawCount || 0}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Danh sách chương trình bóc tách được */}
                  {proxyPreviewData.programs && proxyPreviewData.programs.length > 0 && (
                    <div className="max-h-36 overflow-y-auto divide-y divide-emerald-100 bg-white rounded-lg border border-emerald-200 p-2 text-[11px]">
                      {proxyPreviewData.programs.map((p: any, idx: number) => (
                        <div key={idx} className="py-1 flex items-center justify-between">
                          <span className="font-semibold text-slate-800 truncate max-w-[340px]" title={p.programName}>
                            {p.programCode ? `[${p.programCode}] ` : ''}{p.programName}
                          </span>
                          <span className="font-mono font-bold text-[#005F3E] shrink-0 ml-2">
                            {p.topicCount} CĐ • {p.totalParticipants} lượt
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cảnh báo khác nếu có */}
                  {proxyPreviewData.warnings && proxyPreviewData.warnings.length > 0 && (
                    <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 space-y-0.5 max-h-20 overflow-y-auto">
                      {proxyPreviewData.warnings.slice(0, 5).map((w: string, i: number) => (
                        <div key={i} className="flex items-center gap-1">
                          <span>⚠️</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                disabled={proxyUploading}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleExecuteProxyUpload}
                disabled={proxyUploading || !proxyFile || !proxyUnitId || Boolean(proxyPreviewData?.errorsCount && proxyPreviewData.errorsCount > 0)}
                className="px-5 py-2.5 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {proxyUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang nộp hồ sơ...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>
                      {proxyStatus === 'SUBMITTED' ? 'Xác Nhận Nộp Hộ & Cấp Biên Nhận' : 'Lưu Bản Nháp Cho Đơn Vị'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
