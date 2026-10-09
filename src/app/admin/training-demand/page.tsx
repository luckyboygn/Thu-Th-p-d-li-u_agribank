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
  RefreshCw,
  AlertTriangle,
  Check,
  XCircle,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  HelpCircle,
  ListFilter
} from 'lucide-react';

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
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [unitSearch, setUnitSearch] = useState('');
  const [unitReportData, setUnitReportData] = useState<any>(null);
  const [unitReportLoading, setUnitReportLoading] = useState(false);
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenSuccess, setReopenSuccess] = useState('');

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
      const sumRes = await fetch('/api/training-reports?type=SUMMARY');
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
        if (uJson.units && uJson.units.length > 0) {
          setSelectedUnitId(uJson.units[0].id);
        }
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
        const res = await fetch(`/api/training-reports?type=BY_UNIT&unitId=${selectedUnitId}`);
        if (res.ok) {
          const data = await res.json();
          setUnitReportData(data);
        }
      } catch (err) {
        console.error('Lỗi tải báo cáo đơn vị:', err);
      } finally {
        setUnitReportLoading(false);
      }
    };
    fetchUnitReport();
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
    if (!selectedUnitId) return;
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
          <h1 className="text-2xl font-bold text-slate-800">Khảo sát Nhu cầu Đào tạo ({summary?.totalUnits || units.length || 155} Đơn vị)</h1>
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
            <div className="text-xs text-slate-500 font-medium">Tiến độ nộp ({summary?.totalUnits || units.length || 155} Đơn vị)</div>
            <div className="text-xl font-bold text-slate-800">
              {summary?.submittedUnits ?? 0} <span className="text-sm font-normal text-slate-500">/ {summary?.totalUnits ?? units.length ?? 155}</span>
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
              {summary?.pendingUnits ?? (summary?.totalUnits || units.length || 155)} <span className="text-sm font-normal text-slate-500">đơn vị</span>
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
                <label className="block text-xs font-semibold text-slate-500 mb-1">Chọn Đơn vị ({units.length || 155} đơn vị)</label>
                <select
                  value={selectedUnitId || ''}
                  onChange={(e) => setSelectedUnitId(parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {filteredUnitsForSelect.map(u => (
                    <option key={u.id} value={u.id}>
                      [{u.unit_code}] {u.unit_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 md:pt-0">
              {selectedUnitId && (
                <a
                  href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${selectedUnitId}`}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Xuất Excel Đơn vị</span>
                </a>
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
              <span>Đang tải báo cáo của đơn vị...</span>
            </div>
          ) : unitReportData ? (
            <div className="space-y-4">
              {/* Unit Info Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-slate-800">
                      [{unitReportData.unit?.unit_code}] {unitReportData.unit?.unit_name}
                    </span>
                    {unitReportData.submission?.status === 'SUBMITTED' ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã gửi chính thức
                      </span>
                    ) : unitReportData.submission?.status === 'DRAFT' ? (
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        Bản nháp
                      </span>
                    ) : unitReportData.submission?.status === 'REOPENED' ? (
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold">
                        Đang mở lại cho sửa
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs">
                        Chưa gửi hồ sơ
                      </span>
                    )}
                  </div>
                  {unitReportData.submission && (
                    <div className="text-xs text-slate-500 mt-1 flex gap-4">
                      <span>Cập nhật lần cuối: {new Date(unitReportData.submission.updated_at).toLocaleString('vi-VN')}</span>
                      {unitReportData.submission.submitted_by_name && (
                        <span>Người gửi: <strong>{unitReportData.submission.submitted_by_name}</strong></span>
                      )}
                    </div>
                  )}
                </div>

                {unitReportData.submission?.status === 'SUBMITTED' && (
                  <div>
                    <button
                      onClick={handleReopen}
                      disabled={reopenLoading}
                      className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{reopenLoading ? 'Đang mở lại...' : 'Mở lại cho đơn vị sửa (Reopen)'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Records Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <h4 className="font-bold text-slate-700 text-sm">
                    Chi tiết các Vị trí và Chuyên đề đã đăng ký ({unitReportData.records?.length || 0} bản ghi)
                  </h4>
                </div>

                {unitReportData.records && unitReportData.records.length > 0 ? (
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
                        {unitReportData.records.map((r: any, idx: number) => (
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
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    Đơn vị này chưa đăng ký chuyên đề nào.
                  </div>
                )}
              </div>
            </div>
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
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="p-3 bg-purple-100 text-purple-800 rounded-lg w-fit mb-4">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base mb-1">
                4. Theo Đơn vị
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Xuất toàn bộ nhu cầu đào tạo của một đơn vị cụ thể theo từng vị trí và chuyên đề.
              </p>
            </div>
            {selectedUnitId ? (
              <a
                href={`/api/training-reports?type=EXPORT_EXCEL&exportFormat=BY_UNIT&unitId=${selectedUnitId}`}
                className="inline-flex items-center justify-center gap-2 bg-purple-700 hover:bg-purple-800 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Tải Excel Đơn vị</span>
              </a>
            ) : (
              <button disabled className="bg-slate-200 text-slate-400 py-2.5 px-4 rounded-lg text-sm font-semibold cursor-not-allowed">
                Chọn đơn vị tại Tab 3
              </button>
            )}
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
    </div>
  );
}
