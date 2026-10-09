'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Send,
  Save,
  Trash2,
  Calendar,
  Building2,
  BookOpen,
  Users,
  ChevronRight,
  ChevronDown,
  Info,
  Clock,
  Sparkles,
  ArrowLeft,
  X,
  Layers,
  Check,
  AlertCircle,
  Lock,
  Edit3,
  RefreshCw,
  FileText
} from 'lucide-react';
import DeadlineBanner from '@/components/DeadlineBanner';

interface ProgramTopic {
  id: number;
  program_id: number;
  topic_name: string;
  target_audience?: string;
  delivery_method: string;
  duration: string;
  display_order: number;
  participant_count: number;
}

interface DeclaredProgram {
  demand_program_id: number;
  program_id: number;
  program_code: string;
  program_name: string;
  group_name: string;
  category_type?: 'TRONG_KHUNG' | 'NGOAI_KHUNG';
  total_available_topics: number;
  registered_topic_count: number;
  sum_participants: number;
  notes?: string | null;
  topics: Array<{
    demand_topic_id: number;
    program_topic_id: number;
    participant_count: number;
    topic_name: string;
    target_audience?: string;
    delivery_method: string;
    duration: string;
    display_order: number;
  }>;
}

interface TrainingProposal {
  id?: number;
  submission_id?: number;
  proposal_name: string;
  target_audience?: string;
  participant_count: number;
  expected_duration?: string;
  notes?: string;
}

interface CatalogProgram {
  id: number;
  code: string;
  name: string;
  group_name: string;
  category_type?: 'TRONG_KHUNG' | 'NGOAI_KHUNG';
  topic_count: number;
}

interface ProgramGroup {
  group_name: string;
  category_type?: 'TRONG_KHUNG' | 'NGOAI_KHUNG';
  program_count: number;
}

export default function UnitTrainingDemandPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Accordion state: Theo dõi đóng/mở từng chương trình
  const [expandedPrograms, setExpandedPrograms] = useState<Record<number, boolean>>({});

  // Modal / Selection state
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [catalogGroups, setCatalogGroups] = useState<ProgramGroup[]>([]);
  const [catalogPrograms, setCatalogPrograms] = useState<CatalogProgram[]>([]);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'ALL' | 'TRONG_KHUNG' | 'NGOAI_KHUNG'>('ALL');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('');
  const [programSearchQuery, setProgramSearchQuery] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<CatalogProgram | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Topics of the active program in Modal
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topics, setTopics] = useState<ProgramTopic[]>([]);
  const [topicErrors, setTopicErrors] = useState<Record<number, string>>({});
  const [applyAllValue, setApplyAllValue] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [programNotes, setProgramNotes] = useState<string>('');

  // Đề xuất ngoài khung (Mục 2.8)
  const [proposals, setProposals] = useState<TrainingProposal[]>([]);
  const [savingProposals, setSavingProposals] = useState(false);
  const [proposalsDirty, setProposalsDirty] = useState(false);

  // Modal xác nhận gửi chính thức
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Notifications
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Cảnh báo rời trang khi còn thay đổi chưa lưu
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Tự động lưu nháp định kỳ (15s khi modal mở và có thay đổi hợp lệ)
  useEffect(() => {
    if (!showProgramModal || !selectedProgram || !isDirty || Object.keys(topicErrors).length > 0 || saving || isAutoSaving) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
        const res = await fetch('/api/training-demand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collectionId: data?.collection?.id || 1,
            action: 'DRAFT',
            programData: {
              programId: selectedProgram.id,
              topicCounts: topics.map(t => ({ topicId: t.id, count: t.participant_count }))
            }
          })
        });
        if (res.ok) {
          const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setAutoSaveStatus(`Đã tự động lưu nháp lúc ${timeStr}`);
          setIsDirty(false);
        }
      } catch (err) {
        console.error('Auto-save error:', err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 15000);

    return () => clearTimeout(timer);
  }, [showProgramModal, selectedProgram, isDirty, topicErrors, saving, isAutoSaving, topics, data?.collection?.id]);

  // 1. Tải hồ sơ khảo sát của đơn vị
  const loadDemandData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/training-demand');
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi tải dữ liệu');
      setData(resData);
      if (resData.proposals && Array.isArray(resData.proposals)) {
        setProposals(resData.proposals);
      } else {
        setProposals([]);
      }
      setProposalsDirty(false);

      // Mặc định mở rộng chương trình đầu tiên
      if (resData.declaredPrograms && resData.declaredPrograms.length > 0) {
        const initExpanded: Record<number, boolean> = {};
        resData.declaredPrograms.forEach((p: DeclaredProgram, idx: number) => {
          initExpanded[p.program_id] = idx === 0;
        });
        setExpandedPrograms(prev => Object.keys(prev).length === 0 ? initExpanded : prev);
      }
    } catch (e: any) {
      console.error(e);
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // 2. Tải danh mục Khung chương trình chuẩn
  const loadCatalogPrograms = async () => {
    try {
      const res = await fetch('/api/training-programs');
      const resData = await res.json();
      setCatalogPrograms(resData.programs || []);
      setCatalogGroups(resData.groups || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    async function initUser() {
      try {
        const uRes = await fetch('/api/auth/me');
        if (uRes.ok) {
          const uData = await uRes.json();
          setCurrentUser(uData.user);
        }
      } catch (err) {}
    }
    initUser();
    loadDemandData();
    loadCatalogPrograms();
  }, []);

  // 3. Khi chọn một Khung chương trình trong modal
  const handleSelectProgram = async (prog: CatalogProgram, existingCounts?: Map<number, number>) => {
    setSelectedProgram(prog);
    setApplyAllValue('');
    setTopicErrors({});
    setIsDirty(false);
    setTopicsLoading(true);

    try {
      const res = await fetch(`/api/training-programs?programId=${prog.id}`);
      const resData = await res.json();
      const list = resData.topics || [];

      const mappedTopics: ProgramTopic[] = list.map((t: any) => ({
        ...t,
        participant_count: existingCounts?.has(t.id) ? existingCounts.get(t.id)! : 0
      }));

      setTopics(mappedTopics);
    } catch (e) {
      console.error(e);
      setActionMessage({ type: 'error', text: 'Không thể tải danh sách chuyên đề của chương trình.' });
    } finally {
      setTopicsLoading(false);
    }
  };

  // 4. Mở modal thêm Khung chương trình mới
  const handleOpenAddModal = () => {
    setSelectedProgram(null);
    setTopics([]);
    setTopicErrors({});
    setIsDirty(false);
    setProgramNotes('');
    setProgramSearchQuery('');
    setSelectedGroupFilter('');
    setShowProgramModal(true);
  };

  // 5. Mở chỉnh sửa Khung chương trình đã kê khai
  const handleOpenEditProgram = (prog: DeclaredProgram) => {
    const catalogItem = catalogPrograms.find(cp => cp.id === prog.program_id) || {
      id: prog.program_id,
      code: prog.program_code,
      name: prog.program_name,
      group_name: prog.group_name,
      topic_count: prog.total_available_topics
    };

    const countMap = new Map<number, number>();
    prog.topics.forEach(t => countMap.set(t.program_topic_id, t.participant_count));

    setProgramNotes(prog.notes || '');
    handleSelectProgram(catalogItem, countMap);
    setShowProgramModal(true);
  };

  // 6. Áp dụng cho tất cả chuyên đề trong chương trình
  const handleApplyToAll = () => {
    const rawVal = applyAllValue.trim();
    if (rawVal === '') {
      setTopics(prev => prev.map(t => ({ ...t, participant_count: 0 })));
      setTopicErrors({});
      setIsDirty(true);
      return;
    }

    const valNum = Number(rawVal);
    if (isNaN(valNum) || !Number.isInteger(valNum) || valNum < 0) {
      setActionMessage({ type: 'warning', text: 'Số lượng đăng ký áp dụng phải là số nguyên không âm (>= 0).' });
      return;
    }

    setTopics(prev => prev.map(t => ({ ...t, participant_count: valNum })));
    setTopicErrors({});
    setIsDirty(true);
    setActionMessage({ type: 'success', text: `Đã áp dụng số lượng ${valNum} cho tất cả ${topics.length} chuyên đề!` });
  };

  // 7. Thay đổi số lượng của riêng một chuyên đề với Client-side Validation tức thì
  const handleTopicCountChange = (topicId: number, valStr: string) => {
    setIsDirty(true);
    const trimmed = valStr.trim();

    if (trimmed === '') {
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, participant_count: 0 } : t));
      setTopicErrors(prev => {
        const next = { ...prev };
        delete next[topicId];
        return next;
      });
      return;
    }

    const num = Number(trimmed);
    if (isNaN(num) || !Number.isInteger(num) || num < 0) {
      setTopicErrors(prev => ({
        ...prev,
        [topicId]: 'Chỉ cho phép số nguyên không âm (>= 0)'
      }));
    } else {
      setTopicErrors(prev => {
        const next = { ...prev };
        delete next[topicId];
        return next;
      });
    }

    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, participant_count: isNaN(num) ? 0 : Math.max(0, num) } : t));
  };

  // 8. Lưu chương trình và danh sách chuyên đề
  const handleSaveProgram = async () => {
    if (!selectedProgram) {
      setActionMessage({ type: 'error', text: 'Vui lòng chọn một khung chương trình đào tạo.' });
      return;
    }

    // Kiểm tra lỗi còn tồn tại tại các ô
    if (Object.keys(topicErrors).length > 0) {
      setActionMessage({ type: 'error', text: 'Vui lòng sửa các ô có số lượng không hợp lệ trước khi lưu.' });
      return;
    }

    for (const t of topics) {
      if (isNaN(t.participant_count) || !Number.isInteger(t.participant_count) || t.participant_count < 0) {
        setActionMessage({ type: 'error', text: `Chuyên đề "${t.topic_name}" có số lượng đăng ký không hợp lệ.` });
        return;
      }
    }

    try {
      setSaving(true);
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: data?.collection?.id || 1,
          action: 'SAVE_PROGRAM',
          programData: {
            programId: selectedProgram.id,
            notes: programNotes,
            topicCounts: topics.map(t => ({ topicId: t.id, count: t.participant_count }))
          }
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi lưu chương trình');

      setActionMessage({ type: 'success', text: 'Đã lưu nhu cầu đào tạo cho chương trình thành công!' });
      setIsDirty(false);
      setShowProgramModal(false);
      loadDemandData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  // 8b. Lưu nháp thủ công bằng action DRAFT
  const handleSaveDraft = async () => {
    if (!selectedProgram) return;
    if (Object.keys(topicErrors).length > 0) {
      setActionMessage({ type: 'error', text: 'Vui lòng sửa các ô có số lượng không hợp lệ trước khi lưu nháp.' });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: data?.collection?.id || 1,
          action: 'DRAFT',
          programData: {
            programId: selectedProgram.id,
            notes: programNotes,
            topicCounts: topics.map(t => ({ topicId: t.id, count: t.participant_count }))
          }
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi lưu nháp chương trình');

      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAutoSaveStatus(`Đã lưu nháp lúc ${timeStr}`);
      setIsDirty(false);
      setActionMessage({ type: 'success', text: `Đã lưu bản nháp chương trình thành công lúc ${timeStr}!` });
      loadDemandData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  // 9. Xóa chương trình khỏi khảo sát
  const handleDeleteProgram = async (programId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa khung chương trình này khỏi danh sách khảo sát của đơn vị?')) return;

    try {
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: data?.collection?.id || 1,
          action: 'DELETE_PROGRAM',
          programId
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi xóa chương trình');

      setActionMessage({ type: 'success', text: 'Đã xóa khung chương trình thành công.' });
      loadDemandData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  // 9b. Quản lý Đề xuất ngoài khung (Mục 2.8)
  const handleAddProposalRow = () => {
    setProposals(prev => [
      ...prev,
      {
        proposal_name: '',
        target_audience: '',
        participant_count: 1,
        expected_duration: '',
        notes: ''
      }
    ]);
    setProposalsDirty(true);
  };

  const handleProposalChange = (index: number, field: keyof TrainingProposal, value: any) => {
    setProposals(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setProposalsDirty(true);
  };

  const handleDeleteProposalRow = (index: number) => {
    setProposals(prev => prev.filter((_, idx) => idx !== index));
    setProposalsDirty(true);
  };

  const handleSaveProposals = async () => {
    for (let i = 0; i < proposals.length; i++) {
      if (!proposals[i].proposal_name || !proposals[i].proposal_name.trim()) {
        setActionMessage({ type: 'error', text: `Dòng đề xuất #${i + 1} chưa có Tên đề xuất chuyên đề.` });
        return;
      }
    }

    try {
      setSavingProposals(true);
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: data?.collection?.id || 1,
          action: 'SAVE_PROPOSALS',
          proposals
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi lưu đề xuất ngoài khung');

      setActionMessage({ type: 'success', text: 'Đã lưu danh sách đề xuất ngoài khung thành công!' });
      setProposalsDirty(false);
      loadDemandData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSavingProposals(false);
    }
  };

  // 10. Gửi chính thức nhu cầu khảo sát
  const handleConfirmSubmitOfficial = async () => {
    const declared: DeclaredProgram[] = data?.declaredPrograms || [];
    if (declared.length === 0) {
      setActionMessage({ type: 'warning', text: 'Đơn vị chưa đăng ký bất kỳ khung chương trình nào. Vui lòng thêm ít nhất một chương trình trước khi gửi chính thức.' });
      setShowSubmitModal(false);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/training-demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: data?.collection?.id || 1,
          action: 'SUBMIT_OFFICIAL'
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi gửi chính thức');

      setActionMessage({ type: 'success', text: 'ĐÃ GỬI CHÍNH THỨC THÀNH CÔNG! Dữ liệu khảo sát đã được chốt và gửi đến Ban Tổ chức Đào tạo.' });
      setShowSubmitModal(false);
      loadDemandData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const isCollectionClosed = data?.collection?.status === 'CLOSED';
  const isSubmissionReopened = data?.submission?.status === 'REOPENED';
  const isSubmitted = data?.submission?.status === 'SUBMITTED' && !isSubmissionReopened;
  const isReadOnly = isSubmitted || isCollectionClosed;

  const declaredPrograms: DeclaredProgram[] = data?.declaredPrograms || [];
  const totalRegisteredParticipants = declaredPrograms.reduce((sum, p) => sum + p.sum_participants, 0);

  // Gom nhóm danh sách chương trình đã kê khai theo Khung / Nhóm lớn (group_name)
  const groupedDeclaredPrograms = useMemo(() => {
    const map = new Map<string, DeclaredProgram[]>();
    declaredPrograms.forEach(p => {
      const gName = p.group_name || 'Khác';
      if (!map.has(gName)) map.set(gName, []);
      map.get(gName)!.push(p);
    });
    return Array.from(map.entries()).map(([group_name, programs]) => ({
      group_name,
      programs,
      totalParticipants: programs.reduce((sum, p) => sum + p.sum_participants, 0),
      totalTopics: programs.reduce((sum, p) => sum + p.registered_topic_count, 0)
    }));
  }, [declaredPrograms]);

  // Lọc danh mục chương trình trong Modal
  const filteredCatalogPrograms = catalogPrograms.filter(cp => {
    const matchesCategory =
      activeCategoryTab === 'ALL' ||
      (activeCategoryTab === 'TRONG_KHUNG' && (cp.category_type === 'TRONG_KHUNG' || !cp.category_type)) ||
      (activeCategoryTab === 'NGOAI_KHUNG' && cp.category_type === 'NGOAI_KHUNG');

    const matchesGroup = !selectedGroupFilter || cp.group_name === selectedGroupFilter;
    const matchesQuery = !programSearchQuery || 
      cp.name.toLowerCase().includes(programSearchQuery.toLowerCase()) ||
      cp.code.toLowerCase().includes(programSearchQuery.toLowerCase());

    return matchesCategory && matchesGroup && matchesQuery;
  });

  const groupedCatalogPrograms = useMemo(() => {
    const map = new Map<string, CatalogProgram[]>();
    filteredCatalogPrograms.forEach(p => {
      const gName = p.group_name || 'Khác';
      if (!map.has(gName)) map.set(gName, []);
      map.get(gName)!.push(p);
    });
    return Array.from(map.entries()).map(([group_name, programs]) => ({
      group_name,
      programs
    }));
  }, [filteredCatalogPrograms]);

  const toggleAccordion = (progId: number) => {
    setExpandedPrograms(prev => ({
      ...prev,
      [progId]: !prev[progId]
    }));
  };

  const toggleGroupCollapse = (gName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [gName]: !prev[gName]
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/unit?tab=TASKS"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Quay lại Trang chính đơn vị"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  Khảo sát Nhu cầu Đào tạo
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Chuẩn Khung Chương trình
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Lựa chọn chương trình đào tạo & kê khai số lượng học viên theo từng chuyên đề
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-slate-500 flex items-center justify-end space-x-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>{data?.unit?.unit_code} - {data?.unit?.unit_name}</span>
              </div>
              <div className="text-xs font-medium text-slate-700">
                {data?.collection?.title || 'Đợt Khảo sát Nhu cầu Đào tạo'}
              </div>
            </div>

            {/* Trạng thái hồ sơ badge */}
            <div className="pl-3 border-l border-slate-200 flex items-center space-x-2">
              {isCollectionClosed ? (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700 border border-slate-300">
                  <Lock className="w-3.5 h-3.5 mr-1 text-slate-600" />
                  ĐÃ ĐÓNG ĐỢT
                </span>
              ) : isSubmitted ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                    ĐÃ GỬI CHÍNH THỨC
                  </span>
                  <Link
                    href={data?.submission?.receipt_code ? `/unit/receipt?code=${data.submission.receipt_code}` : `/unit/receipt?type=TRAINING_DEMAND&id=${data?.submission?.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-[#005F3E] text-white hover:bg-[#004d32] shadow-xs transition-colors"
                    title="Mở hoặc in Tờ biên nhận khảo sát đào tạo điện tử"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Xem biên nhận</span>
                  </Link>
                </div>
              ) : isSubmissionReopened ? (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  <Sparkles className="w-4 h-4 mr-1 text-blue-600" />
                  ĐƯỢC MỞ LẠI SỬA
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <Clock className="w-4 h-4 mr-1 text-amber-600" />
                  ĐANG SOẠN THẢO (DRAFT)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4">
        {/* Deadline Countdown Banner */}
        {data?.collection ? (
          <DeadlineBanner
            title={`Đợt khảo sát "${data.collection.title}"`}
            startAt={data.collection.start_at}
            endAt={data.deadlineExtension?.new_end_at || data.collection.end_at}
            status={data.collection.status}
            isExtended={!!data.deadlineExtension}
            extensionReason={data.deadlineExtension?.reason}
          />
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900 shadow-xs flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <strong className="font-bold">Thông báo:</strong> Hiện tại chưa có đợt khảo sát nhu cầu đào tạo nào đang mở. Quý đơn vị vui lòng quay lại sau khi Ban Tổ chức công bố đợt mới.
            </div>
          </div>
        )}

        {/* 1.4 Banner thông báo khảo sát đào tạo đã được Quản trị viên mở lại */}
        {isSubmissionReopened && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                  HỒ SƠ KHẢO SÁT ĐÃ ĐƯỢC MỞ LẠI
                </span>
                <span className="text-xs text-amber-700 font-medium">
                  Quản trị viên đã mở lại quyền chỉnh sửa nhu cầu đào tạo
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-950 mt-1.5 bg-white/80 p-2.5 rounded-lg border border-amber-200/60">
                <span className="font-bold text-amber-900">Lý do mở lại: </span>
                {data?.reopenInfo?.reason || 'Vui lòng kiểm tra và hoàn thiện số lượng học viên theo yêu cầu của Quản trị viên.'}
              </p>
              <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                <span>Đơn vị có thể chỉnh sửa số lượng học viên các chuyên đề và bấm Gửi chính thức lại.</span>
              </p>
            </div>
          </div>
        )}
        {/* Banner nếu đợt khảo sát đã kết thúc */}
        {isCollectionClosed && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-100 border border-slate-300 text-slate-800 flex items-center gap-3">
            <Lock className="w-6 h-6 text-slate-600 shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Đợt khảo sát nhu cầu đào tạo đã kết thúc tiếp nhận dữ liệu</h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Hệ thống đã khóa tính năng kê khai và chỉnh sửa. Dữ liệu đang được hiển thị ở chế độ Chỉ xem (Read-only).
              </p>
            </div>
          </div>
        )}

        {/* Banner thông báo hành động */}
        {actionMessage && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-start justify-between text-xs sm:text-sm shadow-xs transition-all ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : actionMessage.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {actionMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {actionMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
              {actionMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* DANH SÁCH CÁC CHƯƠNG TRÌNH ĐÃ KHAI BÁO (THEO CÁC KHUNG ĐÀO TẠO) */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-slate-900">
                Danh sách Chương trình Đào tạo Đã Khai Báo
              </h3>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                {declaredPrograms.length} chương trình
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Thêm Chương trình Đào tạo</span>
                </button>
              )}

              {!isReadOnly && declaredPrograms.length > 0 && (
                currentUser?.role === 'UNIT_PREPARER' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold" title="Tài khoản Người lập (Maker) kê khai nhu cầu và trình Lãnh đạo duyệt">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Đã lập dự thảo (Chờ Người duyệt gửi chính thức)</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                    <span>Gửi chính thức</span>
                  </button>
                )
              )}

              {isSubmitted && (
                <Link
                  href={data?.submission?.receipt_code ? `/unit/receipt?code=${data.submission.receipt_code}` : `/unit/receipt?type=TRAINING_DEMAND&id=${data?.submission?.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  <span>Xem biên nhận nộp</span>
                </Link>
              )}

              {declaredPrograms.length > 0 && (
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      const allOpen: Record<number, boolean> = {};
                      declaredPrograms.forEach(p => { allOpen[p.program_id] = true; });
                      setExpandedPrograms(allOpen);
                    }}
                    className="text-xs text-slate-600 hover:text-[#005F3E] font-semibold underline"
                  >
                    Mở tất cả
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setExpandedPrograms({})}
                    className="text-xs text-slate-600 hover:text-[#005F3E] font-semibold underline"
                  >
                    Thu gọn
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#005F3E] border-r-transparent mb-3" />
              <p className="text-sm text-slate-500 font-medium">Đang tải dữ liệu hồ sơ khảo sát...</p>
            </div>
          ) : declaredPrograms.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <div className="p-4 bg-emerald-50 text-emerald-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                Chưa có chương trình đào tạo nào được chọn
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Đơn vị vui lòng nhấn nút <strong>"Thêm Chương trình Đào tạo"</strong> để bắt đầu đăng ký số lượng học viên theo từng chuyên đề.
              </p>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="px-5 py-2.5 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Chọn Chương trình Ngay</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {groupedDeclaredPrograms.map(grp => (
                <div key={grp.group_name} className="space-y-3">
                  {/* Tiêu đề Phân nhóm lớn */}
                  <div className="flex items-center justify-between pb-2 border-b-2 border-emerald-800/80 bg-slate-100/70 p-3 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-6 bg-emerald-800 rounded-full" />
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                        {grp.group_name}
                      </h4>
                    </div>
                    <div className="flex items-center space-x-3 text-xs">
                      <span className="font-semibold text-slate-600">
                        {grp.programs.length} chương trình
                      </span>
                      <span className="font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg">
                        Tổng {grp.totalParticipants.toLocaleString()} người
                      </span>
                    </div>
                  </div>

                  {/* Danh sách các chương trình trong nhóm dạng Accordion */}
                  <div className="space-y-3">
                    {grp.programs.map(prog => {
                      const isExpanded = !!expandedPrograms[prog.program_id];
                      const hasRegistered = prog.sum_participants > 0;

                      return (
                        <div
                          key={prog.demand_program_id}
                          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                        >
                          {/* Accordion Header */}
                          <div
                            onClick={() => toggleAccordion(prog.program_id)}
                            className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-emerald-50/20 hover:bg-slate-50/80 cursor-pointer flex flex-wrap items-center justify-between gap-4 select-none"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
                              <button
                                type="button"
                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                              >
                                {isExpanded ? <ChevronDown className="w-5 h-5 text-emerald-700" /> : <ChevronRight className="w-5 h-5" />}
                              </button>
                              <div>
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white font-mono">
                                    {prog.program_code}
                                  </span>
                                  {hasRegistered ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      Đã nhập {prog.sum_participants} người
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                      Chưa nhập số lượng
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                                  {prog.program_name}
                                </h4>
                                {prog.notes && (
                                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded px-2 py-0.5 mt-1 inline-block">
                                    <span className="font-bold">Ghi chú:</span> {prog.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-4">
                              <div className="text-right">
                                <div className="text-sm font-extrabold text-emerald-800">
                                  {prog.sum_participants.toLocaleString()} người
                                </div>
                                <div className="text-xs text-slate-500">
                                  {prog.registered_topic_count} / {prog.total_available_topics} chuyên đề
                                </div>
                              </div>

                              {!isReadOnly && (
                                <div
                                  className="flex items-center space-x-1 pl-3 border-l border-slate-200"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => handleOpenEditProgram(prog)}
                                    className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Chỉnh sửa</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProgram(prog.program_id)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Xóa chương trình"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Accordion Body: Bảng chi tiết các chuyên đề */}
                          {isExpanded && (
                            <div className="border-t border-slate-200 p-0 overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-[#F8F9FA] text-slate-600 font-bold uppercase text-[11px] border-b border-slate-200">
                                  <tr>
                                    <th className="px-4 py-3 w-12 text-center">STT</th>
                                    <th className="px-4 py-3 w-72">Tên chuyên đề</th>
                                    <th className="px-4 py-3 min-w-[260px]">Đối tượng tham gia</th>
                                    <th className="px-4 py-3 w-28 text-center">Thời lượng</th>
                                    <th className="px-4 py-3 w-36 text-center">Hình thức</th>
                                    <th className="px-5 py-3 w-40 text-right">Số lượng đăng ký</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {prog.topics.map((t, idx) => (
                                    <tr
                                      key={t.demand_topic_id}
                                      className={`hover:bg-slate-50 transition-colors ${
                                        t.participant_count > 0 ? 'bg-emerald-50/20' : ''
                                      }`}
                                    >
                                      <td className="px-4 py-3 text-center text-slate-400 font-medium">
                                        {idx + 1}
                                      </td>
                                      <td className="px-4 py-3 font-semibold text-slate-900">
                                        {t.topic_name}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 whitespace-pre-line leading-relaxed">
                                        {t.target_audience || '—'}
                                      </td>
                                      <td className="px-4 py-3 text-slate-700 font-medium text-center">
                                        {t.duration || '—'}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 text-center">
                                        {t.delivery_method || '—'}
                                      </td>
                                      <td className="px-5 py-3 text-right">
                                        <span
                                          className={`inline-block font-extrabold px-3 py-1 rounded-lg text-xs ${
                                            t.participant_count > 0
                                              ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-200'
                                              : 'text-slate-400 bg-slate-100'
                                          }`}
                                        >
                                          {t.participant_count} người
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
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
          )}

          {/* ========================================================================= */}
          {/* ĐỀ XUẤT NHU CẦU NGOÀI KHUNG CHƯƠNG TRÌNH (MỤC 2.8) */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>Đề xuất nhu cầu ngoài khung chương trình đào tạo</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                    Mục 2.8
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Đơn vị chủ động đề xuất các chuyên đề/nghiệp vụ đào tạo đặc thù chưa có trong danh mục 26 Khung chuẩn của Agribank.
                </p>
              </div>

              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddProposalRow}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4 text-emerald-700" />
                    <span>Thêm đề xuất</span>
                  </button>
                  {proposals.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveProposals}
                      disabled={savingProposals}
                      className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingProposals ? 'Đang lưu...' : 'Lưu danh sách đề xuất'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {proposals.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-xs text-slate-500">
                  Chưa có đề xuất đào tạo ngoài khung nào. {!isReadOnly && 'Nhấn nút "Thêm đề xuất" nếu đơn vị có nhu cầu đào tạo đặc thù.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-[#F8F9FA] text-slate-700 font-bold uppercase text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">STT</th>
                      <th className="px-4 py-3 min-w-[220px]">Tên đề xuất chuyên đề / khóa học (*)</th>
                      <th className="px-4 py-3 min-w-[180px]">Đối tượng tham gia</th>
                      <th className="px-3 py-3 w-28 text-right">Số người dự kiến</th>
                      <th className="px-3 py-3 w-28 text-center">Thời lượng</th>
                      <th className="px-4 py-3 min-w-[200px]">Ghi chú / Đề xuất chi tiết</th>
                      {!isReadOnly && <th className="px-3 py-3 w-14 text-center">Xóa</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proposals.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          {isReadOnly ? (
                            <span className="font-bold text-slate-900">{p.proposal_name}</span>
                          ) : (
                            <input
                              type="text"
                              value={p.proposal_name}
                              onChange={(e) => handleProposalChange(idx, 'proposal_name', e.target.value)}
                              placeholder="Ví dụ: Phân tích báo cáo tài chính IFRS..."
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isReadOnly ? (
                            <span className="text-slate-700">{p.target_audience || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={p.target_audience || ''}
                              onChange={(e) => handleProposalChange(idx, 'target_audience', e.target.value)}
                              placeholder="Ví dụ: Cán bộ QHKH Doanh nghiệp"
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isReadOnly ? (
                            <span className="font-bold text-emerald-800">{p.participant_count} người</span>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              value={p.participant_count}
                              onChange={(e) => handleProposalChange(idx, 'participant_count', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-right font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {isReadOnly ? (
                            <span className="text-slate-700">{p.expected_duration || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={p.expected_duration || ''}
                              onChange={(e) => handleProposalChange(idx, 'expected_duration', e.target.value)}
                              placeholder="Ví dụ: 2 ngày"
                              className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-xs text-center text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isReadOnly ? (
                            <span className="text-slate-600">{p.notes || '—'}</span>
                          ) : (
                            <input
                              type="text"
                              value={p.notes || ''}
                              onChange={(e) => handleProposalChange(idx, 'notes', e.target.value)}
                              placeholder="Lý do, mục tiêu kỳ vọng..."
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          )}
                        </td>
                        {!isReadOnly && (
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteProposalRow(idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Xóa đề xuất này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* THANH TỔNG HỢP CỐ ĐỊNH Ở DƯỚI MÀN HÌNH (STICKY SUMMARY BAR - A3) */}
      {/* ========================================================================= */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-xl py-3 px-4 sm:px-8 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-6 text-xs sm:text-sm">
            <div>
              <span className="text-slate-500 font-medium">Chương trình đã chọn:</span>{' '}
              <strong className="text-slate-900 text-base">{declaredPrograms.length}</strong>
            </div>

            <div className="border-l border-slate-200 pl-4">
              <span className="text-slate-500 font-medium">Tổng số người đăng ký:</span>{' '}
              <strong className="text-emerald-800 text-base font-extrabold">
                {totalRegisteredParticipants.toLocaleString()}
              </strong>{' '}
              <span className="text-xs text-slate-500">người</span>
            </div>

            <div className="border-l border-slate-200 pl-4 hidden md:block">
              <span className="text-slate-500 font-medium">Trạng thái hồ sơ:</span>{' '}
              {isCollectionClosed ? (
                <span className="font-bold text-slate-700">Đã đóng đợt</span>
              ) : isSubmitted ? (
                <span className="font-bold text-emerald-700">Đã gửi chính thức</span>
              ) : (
                <span className="font-bold text-amber-700">Đang soạn thảo (Nháp)</span>
              )}
              {autoSaveStatus && !isSubmitted && (
                <span className="ml-2 text-xs text-slate-400 font-normal">({autoSaveStatus})</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors inline-flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4 text-emerald-700" />
                <span>Thêm chương trình</span>
              </button>
            )}

            {!isReadOnly && declaredPrograms.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-1.5 active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>Gửi chính thức</span>
              </button>
            )}

            {isSubmitted && (
              <Link
                href={data?.submission?.receipt_code ? `/unit/receipt?code=${data.submission.receipt_code}` : `/unit/receipt?type=TRAINING_DEMAND&id=${data?.submission?.id}`}
                target="_blank"
                className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-1.5"
                title="Mở hoặc in Tờ biên nhận khảo sát đào tạo điện tử"
              >
                <FileText className="w-4 h-4" />
                <span>Xem biên nhận điện tử</span>
              </Link>
            )}

            {isReadOnly && !isSubmitted && (
              <div className="text-xs text-slate-500 italic">
                Chế độ chỉ xem
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN GỬI CHÍNH THỨC (CONFIRMATION DIALOG - A3) */}
      {/* ========================================================================= */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-900 rounded-xl">
                  <Send className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">Xác nhận gửi chính thức khảo sát</h3>
                  <p className="text-[11px] text-slate-500">Chuyển dữ liệu lên Ban Tổ chức Đào tạo</p>
                </div>
              </div>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Đợt khảo sát:</span>
                  <span className="font-bold text-slate-900 text-right">{data?.collection?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số chương trình đào tạo:</span>
                  <span className="font-bold text-slate-900">{declaredPrograms.length} chương trình</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng số lượt người đăng ký:</span>
                  <span className="font-bold text-emerald-800 text-sm">
                    {totalRegisteredParticipants.toLocaleString()} lượt người
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Lưu ý quan trọng:</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Sau khi gửi chính thức, hồ sơ sẽ chuyển sang trạng thái <strong>Đã nộp (Chỉ xem)</strong> để Ban Tổ chức tổng hợp nhu cầu toàn hệ thống. Đơn vị sẽ không thể thay đổi trừ khi được cấp quyền Mở lại (Reopen).
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitOfficial}
                disabled={submitting}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
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

      {/* ========================================================================= */}
      {/* MODAL THÊM / CHỈNH SỬA KHUNG CHƯƠNG TRÌNH & NHẬP SỐ LƯỢNG NGƯỜI ĐĂNG KÝ */}
      {/* ========================================================================= */}
      {showProgramModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-600 rounded-xl">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedProgram ? 'Kê khai Nhu cầu theo Chương trình Đào tạo' : 'Lựa chọn Chương trình Đào tạo'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Bao gồm Nhóm Trong khung đào tạo (PL I - IV) và Nhóm Ngoài khung đào tạo
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (isDirty && !confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng không?')) return;
                  setShowProgramModal(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* BƯỚC 1: LỰA CHỌN KHUNG CHƯƠNG TRÌNH */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Bước 1: Chọn Khung Chương trình đào tạo
                  </label>

                  {/* Tabs phân loại Nhóm Trong khung / Ngoài khung */}
                  <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategoryTab('ALL');
                        setSelectedGroupFilter('');
                      }}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        activeCategoryTab === 'ALL'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tất cả ({catalogPrograms.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategoryTab('TRONG_KHUNG');
                        setSelectedGroupFilter('');
                      }}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        activeCategoryTab === 'TRONG_KHUNG'
                          ? 'bg-[#005F3E] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Trong khung đào tạo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategoryTab('NGOAI_KHUNG');
                        setSelectedGroupFilter('');
                      }}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        activeCategoryTab === 'NGOAI_KHUNG'
                          ? 'bg-teal-800 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Ngoài khung đào tạo
                    </button>
                  </div>
                </div>

                {/* Bộ lọc nhóm và Tìm kiếm */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Lọc theo nhóm lớn:</label>
                    <select
                      value={selectedGroupFilter}
                      onChange={e => setSelectedGroupFilter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#005F3E] outline-none"
                    >
                      <option value="">
                        {activeCategoryTab === 'NGOAI_KHUNG' ? '-- Tất cả 6 Chương trình Ngoài khung --' : activeCategoryTab === 'TRONG_KHUNG' ? '-- Tất cả 4 nhóm Trong khung (PL I - IV) --' : '-- Tất cả các nhóm --'}
                      </option>
                      {catalogGroups
                        .filter(g => {
                          if (activeCategoryTab === 'TRONG_KHUNG') return g.category_type === 'TRONG_KHUNG' || !g.category_type;
                          if (activeCategoryTab === 'NGOAI_KHUNG') return g.category_type === 'NGOAI_KHUNG';
                          return true;
                        })
                        .map(g => (
                          <option key={g.group_name} value={g.group_name}>
                            {g.group_name} ({g.program_count} chương trình)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tìm kiếm theo tên / mã:</label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="VD: Thử việc, Chi nhánh, Tín dụng..."
                        value={programSearchQuery}
                        onChange={e => setProgramSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#005F3E] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Danh sách chương trình */}
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-200">
                  {groupedCatalogPrograms.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Không tìm thấy khung chương trình phù hợp với bộ lọc.
                    </div>
                  ) : (
                    groupedCatalogPrograms.map(grp => {
                      const isCollapsed = !!collapsedGroups[grp.group_name];
                      return (
                        <div key={grp.group_name} className="bg-slate-50/50">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(grp.group_name)}
                            className="w-full px-3.5 py-2.5 bg-slate-100/90 hover:bg-slate-200/80 transition-colors flex items-center justify-between text-left border-y border-slate-200 sticky top-0 z-5"
                          >
                            <div className="flex items-center space-x-2 flex-1 pr-2">
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-emerald-700 shrink-0" />
                              )}
                              <span className="text-xs font-bold text-slate-900 leading-snug">
                                {grp.group_name}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shrink-0">
                              {grp.programs.length} chương trình
                            </span>
                          </button>

                          {!isCollapsed && (
                            <div className="divide-y divide-slate-100 bg-white">
                              {grp.programs.map(prog => (
                                <div
                                  key={prog.id}
                                  onClick={() => handleSelectProgram(prog)}
                                  className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors pl-7 ${
                                    selectedProgram?.id === prog.id
                                      ? 'bg-emerald-50 border-l-4 border-emerald-600 font-semibold'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex-1 pr-3">
                                    <div className="flex items-center space-x-2 mb-0.5">
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 font-mono">
                                        {prog.code}
                                      </span>
                                    </div>
                                    <div className="text-slate-900 font-medium leading-relaxed">
                                      {prog.name}
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2 shrink-0">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                      {prog.topic_count} chuyên đề
                                    </span>
                                    {selectedProgram?.id === prog.id && (
                                      <Check className="w-4 h-4 text-emerald-600" />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* BƯỚC 2: NHẬP SỐ LƯỢNG NGƯỜI ĐĂNG KÝ VỚI CLIENT-SIDE VALIDATION TỨC THÌ */}
              {selectedProgram && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="bg-[#005F3E] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-emerald-200 uppercase font-semibold">
                        Khung chương trình đang kê khai:
                      </div>
                      <div className="text-sm font-bold text-white">
                        {selectedProgram.name}
                      </div>
                    </div>

                    {/* Nút Áp dụng cho tất cả chuyên đề */}
                    <div className="flex items-center space-x-2 bg-emerald-800/80 p-1.5 rounded-xl border border-emerald-700/60">
                      <span className="text-xs text-emerald-100 pl-2">Áp dụng cho tất cả:</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Số người"
                        value={applyAllValue}
                        onChange={e => setApplyAllValue(e.target.value)}
                        className="w-20 px-2 py-1 text-xs bg-white text-slate-900 font-bold rounded-lg outline-none text-center"
                      />
                      <button
                        type="button"
                        onClick={handleApplyToAll}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs rounded-lg shadow-xs transition-colors"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>

                  {topicsLoading ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-r-transparent mb-2" />
                      <p>Đang tải danh sách chuyên đề...</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 z-10">
                          <tr>
                            <th className="px-3 py-3 w-10 text-center">STT</th>
                            <th className="px-4 py-3 w-64">Tên chuyên đề</th>
                            <th className="px-4 py-3 min-w-[240px]">Đối tượng tham gia</th>
                            <th className="px-3 py-3 w-24 text-center">Thời lượng</th>
                            <th className="px-3 py-3 w-32 text-center">Hình thức</th>
                            <th className="px-4 py-3 w-40 text-right">Số lượng đăng ký</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {topics.map((t, idx) => {
                            const hasErr = !!topicErrors[t.id];
                            return (
                              <tr
                                key={t.id}
                                className={`hover:bg-slate-50 transition-colors ${
                                  hasErr ? 'bg-rose-50/50' : t.participant_count > 0 ? 'bg-emerald-50/20' : ''
                                }`}
                              >
                                <td className="px-3 py-2.5 text-center text-slate-400 font-medium">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-slate-900">
                                  {t.topic_name}
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 whitespace-pre-line leading-relaxed">
                                  {t.target_audience || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700 font-medium text-center">
                                  {t.duration || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-slate-600 text-center">
                                  {t.delivery_method || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex flex-col items-end">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={t.participant_count === 0 ? '' : t.participant_count}
                                      placeholder="0"
                                      onChange={e => handleTopicCountChange(t.id, e.target.value)}
                                      className={`w-24 px-2.5 py-1.5 text-xs text-right font-bold rounded-lg border outline-none transition-all ${
                                        hasErr
                                          ? 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-200'
                                          : t.participant_count > 0
                                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 focus:ring-2 focus:ring-emerald-500'
                                          : 'border-slate-300 text-slate-800 focus:border-emerald-500'
                                      }`}
                                    />
                                    {hasErr && (
                                      <span className="text-[10px] text-rose-600 font-bold mt-1">
                                        {topicErrors[t.id]}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Tổng số: <strong>{topics.length}</strong> chuyên đề
                    </span>
                    <span className="text-emerald-900 font-bold">
                      Tổng số người đăng ký trong chương trình này: {topics.reduce((s, t) => s + (t.participant_count || 0), 0)} người
                    </span>
                  </div>

                  {/* GHI CHÚ BỔ SUNG CHO CHƯƠNG TRÌNH ĐÀO TẠO (Mục 2.8) */}
                  <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Ghi chú bổ sung cho chương trình đào tạo (nếu có):</span>
                    </label>
                    <textarea
                      rows={2}
                      value={programNotes}
                      onChange={(e) => {
                        setProgramNotes(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="Nhập ý kiến đóng góp, đề xuất đặc thù hoặc lưu ý riêng của đơn vị đối với chương trình đào tạo này..."
                      className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isAutoSaving && (
                  <span className="text-xs text-blue-700 font-medium flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Đang tự động lưu nháp...</span>
                  </span>
                )}
                {!isAutoSaving && autoSaveStatus && (
                  <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{autoSaveStatus}</span>
                  </span>
                )}
                {isDirty && !isAutoSaving && (
                  <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Có thay đổi chưa lưu</span>
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isDirty && !confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy bỏ?')) return;
                    setShowProgramModal(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Đóng / Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!selectedProgram || saving || isAutoSaving || Object.keys(topicErrors).length > 0}
                  className="px-4 py-2 text-xs font-semibold text-[#005F3E] bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Lưu nháp thông tin đang nhập"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Lưu nháp</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveProgram}
                  disabled={!selectedProgram || saving || Object.keys(topicErrors).length > 0}
                  className={`inline-flex items-center px-5 py-2 text-xs font-semibold rounded-xl text-white shadow-xs transition-all ${
                    !selectedProgram || saving || Object.keys(topicErrors).length > 0
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-[#005F3E] hover:bg-[#004d32] active:scale-95'
                  }`}
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {saving ? 'Đang lưu...' : 'Lưu Hồ sơ Khung Chương trình'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
