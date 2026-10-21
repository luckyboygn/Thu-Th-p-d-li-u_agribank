'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  X,
  FileCheck,
  Building2,
  ChevronRight,
  Filter,
  Check,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';

interface MatchedUnit {
  id: number;
  code: string;
  name: string;
  shortName: string;
}

interface AnalyzedItem {
  id: string; // unique key (filename)
  file: File;
  fileName: string;
  fileSize: number;
  matchStatus: 'MATCHED' | 'EXACT_CODE' | 'EXACT_NAME' | 'STRONG_MATCH' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID_EXCEL' | 'AMBIGUOUS';
  confidence: 'HIGH' | 'MEDIUM' | 'NONE';
  reasons: string[];
  unit: MatchedUnit | null;
  assignedUnitId: number | null; // Cho phép Admin gán thủ công nếu muốn
  selected: boolean; // Có được chọn nộp hay không
  parsedSummary?: {
    programsCount: number;
    participantsCount: number;
    positionsCount?: number;
    notesCount?: number;
  };
  parseError?: string;
  executionResult?: {
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    message?: string;
    receiptCode?: string;
    totalParticipants?: number;
  };
}

interface BatchProxyUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultCollectionId?: number | null;
}

export default function BatchProxyUploadModal({
  isOpen,
  onClose,
  onSuccess,
  defaultCollectionId
}: BatchProxyUploadModalProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | ''>('');
  
  const [files, setFiles] = useState<File[]>([]);
  const [analyzedItems, setAnalyzedItems] = useState<AnalyzedItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [filterView, setFilterView] = useState<'ALL' | 'READY' | 'WARNING'>('ALL');
  const [executionResult, setExecutionResult] = useState<{
    successCount: number;
    failedCount: number;
    results: any[];
  } | null>(null);

  // Trạng thái tiến trình tải lên và phân tích thời gian thực
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    stage: 'idle' | 'analyzing' | 'executing' | 'completed';
    message: string;
  }>({
    current: 0,
    total: 0,
    percent: 0,
    stage: 'idle',
    message: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load danh sách collections và units khi modal mở
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/training-demand/import-batch')
      .then(res => res.json())
      .then(data => {
        if (data.collections) {
          setCollections(data.collections);
          if (defaultCollectionId) {
            setSelectedCollectionId(defaultCollectionId);
          } else if (data.activeCollectionId) {
            setSelectedCollectionId(data.activeCollectionId);
          } else if (data.collections[0]) {
            setSelectedCollectionId(data.collections[0].id);
          }
        }
        if (data.units) {
          setUnits(data.units);
        }
      })
      .catch(err => {
        console.error('Lỗi tải danh mục đơn vị/đợt khảo sát:', err);
      });
  }, [isOpen, defaultCollectionId]);

  if (!isOpen) return null;

  // Xử lý khi Admin chọn nhiều file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length === 0) return;

    setFiles(selectedFiles);
    setExecutionResult(null);
    await analyzeFiles(selectedFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const excelFiles = droppedFiles.filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (excelFiles.length === 0) return;

    setFiles(excelFiles);
    setExecutionResult(null);
    await analyzeFiles(excelFiles);
  };

  // Kích thước nhóm gửi lên máy chủ mỗi lần (3 file/lượt) để tránh tràn bộ nhớ RAM (512MB) và nghẽn CPU Node.js
  const CHUNK_SIZE = 3;

  // Gửi file lên API theo từng nhóm nhỏ (Chunking) để phân tích đối chiếu tên file và parse nội dung mượt mà
  const analyzeFiles = async (fileList: File[]) => {
    setIsAnalyzing(true);
    const total = fileList.length;

    setProgress({
      current: 0,
      total,
      percent: 0,
      stage: 'analyzing',
      message: `Đang chuẩn bị phân tích ${total} tệp Excel...`
    });

    // Tạo danh sách ban đầu hiển thị ngay lập tức lên bảng giúp người dùng không cảm thấy ứng dụng bị đơ
    const initialItems: AnalyzedItem[] = fileList.map((file, idx) => ({
      id: `${file.name}_${idx}`,
      file,
      fileName: file.name,
      fileSize: file.size,
      matchStatus: 'NOT_FOUND',
      confidence: 'NONE',
      reasons: ['Đang chờ phân tích...'],
      unit: null,
      assignedUnitId: null,
      selected: false
    }));
    setAnalyzedItems(initialItems);

    // Phân chia nhóm an toàn: file lớn (> 1.5MB) gửi riêng 1 file để bảo vệ RAM máy chủ
    const chunks: File[][] = [];
    let currentChunk: File[] = [];
    let currentChunkSize = 0;

    for (const file of fileList) {
      if (file.size > 1.5 * 1024 * 1024) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkSize = 0;
        }
        chunks.push([file]);
      } else {
        currentChunk.push(file);
        currentChunkSize += file.size;
        if (currentChunk.length >= 3 || currentChunkSize > 2 * 1024 * 1024) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkSize = 0;
        }
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    try {
      let processedCount = 0;
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        processedCount += chunk.length;
        const percent = Math.round((processedCount / total) * 100);

        setProgress({
          current: processedCount,
          total,
          percent,
          stage: 'analyzing',
          message: `Đang phân tích nhóm ${cIdx + 1}/${chunks.length} (${processedCount}/${total} file: ${chunk.map(f => f.name).join(', ')})...`
        });

        const fd = new FormData();
        chunk.forEach(file => {
          fd.append('files', file);
        });
        fd.append('mode', 'analyze');

        try {
          const res = await fetch('/api/training-demand/import-batch', {
            method: 'POST',
            body: fd
          });

          if (!res.ok) {
            let errorMsg = `Lỗi máy chủ (${res.status} ${res.statusText})`;
            try {
              const errData = await res.json();
              if (errData?.error) errorMsg = errData.error;
            } catch {
              const text = await res.text().catch(() => '');
              if (text && text.length < 200) errorMsg = text;
            }
            throw new Error(errorMsg);
          }

          let data: any;
          try {
            data = await res.json();
          } catch {
            throw new Error('Máy chủ phản hồi không đúng định dạng JSON hoặc kết nối bị gián đoạn');
          }

          const analyzedList = data.results || data.analyzed || [];
          const analyzedMap = new Map<string, any>();
          analyzedList.forEach((item: any) => {
            analyzedMap.set(item.fileName, item);
          });

          // Cập nhật từng item vừa phân tích xong vào bảng ngay lập tức
          setAnalyzedItems(prev => prev.map(existingItem => {
            if (!analyzedMap.has(existingItem.fileName)) return existingItem;
            const info = analyzedMap.get(existingItem.fileName);
            const matchedUnit = info.matchedUnit || info.unit || null;
            const rawStatus = info.matchStatus || 'NOT_FOUND';
            const err = info.readError || info.parseError;
            const isSafe = (rawStatus === 'MATCHED' || ['EXACT_CODE', 'EXACT_NAME', 'STRONG_MATCH'].includes(rawStatus)) && !err;

            const unitObj: MatchedUnit | null = matchedUnit ? {
              id: matchedUnit.id,
              code: matchedUnit.unitCode || matchedUnit.code,
              name: matchedUnit.unitName || matchedUnit.name,
              shortName: matchedUnit.unitName || matchedUnit.name
            } : null;

            const summary = info.summary || info.parsedSummary;
            const parsedSummaryObj = summary ? {
              programsCount: summary.programCount ?? summary.programsCount ?? 0,
              participantsCount: summary.totalParticipants ?? summary.participantsCount ?? 0,
              positionsCount: summary.topicCount ?? summary.positionsCount ?? 0,
              notesCount: summary.proposalCount ?? summary.notesCount ?? 0
            } : undefined;

            const reasons = info.reasons && info.reasons.length > 0
              ? info.reasons
              : (info.warning ? [info.warning] : []);

            return {
              ...existingItem,
              matchStatus: rawStatus,
              confidence: info.confidence || (isSafe ? 'HIGH' : 'NONE'),
              reasons,
              unit: unitObj,
              assignedUnitId: unitObj?.id || null,
              selected: isSafe && !err,
              parsedSummary: parsedSummaryObj,
              parseError: err
            };
          }));
        } catch (chunkErr: any) {
          console.error('Lỗi khi phân tích nhóm file:', chunkErr);
          const rawMsg = chunkErr.message || '';
          const friendlyMsg = (rawMsg.includes('Unexpected end of JSON') || rawMsg.includes('Failed to execute'))
            ? 'Phản hồi từ máy chủ bị gián đoạn (có thể do dung lượng file lớn hoặc kết nối mạng). Hãy thử tải riêng file này.'
            : (rawMsg || 'Lỗi khi gửi yêu cầu phân tích');

          setAnalyzedItems(prev => prev.map(existingItem => {
            if (chunk.some(f => f.name === existingItem.fileName)) {
              return {
                ...existingItem,
                matchStatus: 'INVALID_EXCEL',
                parseError: friendlyMsg,
                reasons: [friendlyMsg],
                selected: false
              };
            }
            return existingItem;
          }));
        }
      }

      setProgress(prev => ({
        ...prev,
        stage: 'idle',
        percent: 100,
        message: `Đã hoàn tất phân tích ${total} tệp Excel!`
      }));
    } catch (err: any) {
      alert('Không thể phân tích danh sách file: ' + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Toggle chọn / bỏ chọn từng file
  const handleToggleSelect = (id: string) => {
    setAnalyzedItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    }));
  };

  // Chọn tất cả các file hợp lệ
  const handleSelectAllValid = (selected: boolean) => {
    setAnalyzedItems(prev => prev.map(item => {
      const isValid = (item.assignedUnitId !== null) && !item.parseError;
      if (isValid) {
        return { ...item, selected };
      }
      return item;
    }));
  };

  // Đổi đơn vị gán thủ công cho 1 file
  const handleAssignUnit = (id: string, newUnitId: string | number) => {
    setAnalyzedItems(prev => prev.map(item => {
      if (item.id === id) {
        const uId = newUnitId === '' ? null : Number(newUnitId);
        const matchedU = units.find(u => u.id === uId);
        return {
          ...item,
          assignedUnitId: uId,
          unit: matchedU ? { id: matchedU.id, code: matchedU.unit_code, name: matchedU.unit_name, shortName: matchedU.unit_name } : null,
          matchStatus: uId !== null ? 'MATCHED' : 'NOT_FOUND',
          reasons: uId !== null ? ['Đã được Admin chỉ định đơn vị trực tiếp'] : ['Chưa chọn đơn vị'],
          // Nếu đã gán thủ công và không có lỗi parse thì tự động chọn
          selected: uId !== null && !item.parseError ? true : false
        };
      }
      return item;
    }));
  };

  // Tiến hành Nộp hộ chính thức các file được chọn theo từng nhóm nhỏ (Chunking)
  const handleExecuteUpload = async () => {
    const selectedList = analyzedItems.filter(item => item.selected && item.assignedUnitId);
    if (selectedList.length === 0) {
      alert('Chưa có file nào hợp lệ được chọn để nộp hộ.');
      return;
    }

    if (!selectedCollectionId) {
      alert('Vui lòng chọn đợt khảo sát để nộp hồ sơ.');
      return;
    }

    const confirmMsg = `Bạn có chắc chắn muốn nộp hộ dữ liệu cho ${selectedList.length} chi nhánh đã chọn không?\n\n` +
      `- Dữ liệu sẽ được lưu chính thức vào hệ thống theo từng đợt để đảm bảo tốc độ và an toàn.\n` +
      `- Trạng thái của ${selectedList.length} đơn vị sẽ tự động chuyển thành "ĐÃ GỬI CHÍNH THỨC".\n` +
      `- Tạo biên nhận điện tử và ghi nhận nhật ký hỗ trợ.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsExecuting(true);
      const total = selectedList.length;
      let totalSuccess = 0;
      let totalFailed = 0;
      const accumulatedResults: any[] = [];

      setProgress({
        current: 0,
        total,
        percent: 0,
        stage: 'executing',
        message: `Bắt đầu nộp hộ ${total} đơn vị...`
      });

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = selectedList.slice(i, i + CHUNK_SIZE);
        const currentCount = Math.min(i + chunk.length, total);
        const percent = Math.round((currentCount / total) * 100);

        setProgress({
          current: currentCount,
          total,
          percent,
          stage: 'executing',
          message: `Đang lưu & cấp biên nhận nhóm ${Math.floor(i / CHUNK_SIZE) + 1} (${currentCount}/${total}: ${chunk.map(c => c.fileName).join(', ')})...`
        });

        const fd = new FormData();
        chunk.forEach(item => {
          fd.append('files', item.file);
        });

        const assignments = chunk.map(item => ({
          fileName: item.fileName,
          unitId: item.assignedUnitId,
          selected: true
        }));

        fd.append('assignments', JSON.stringify(assignments));
        fd.append('collectionId', String(selectedCollectionId));
        fd.append('mode', 'execute');

        try {
          const res = await fetch('/api/training-demand/import-batch', {
            method: 'POST',
            body: fd
          });

          if (!res.ok) {
            let errorMsg = `Lỗi máy chủ (${res.status} ${res.statusText})`;
            try {
              const errData = await res.json();
              if (errData?.error) errorMsg = errData.error;
            } catch {
              const text = await res.text().catch(() => '');
              if (text && text.length < 200) errorMsg = text;
            }
            throw new Error(errorMsg);
          }

          let data: any;
          try {
            data = await res.json();
          } catch {
            throw new Error('Máy chủ phản hồi không đúng định dạng JSON hoặc kết nối bị gián đoạn');
          }

          const resList = data.results || [];
          accumulatedResults.push(...resList);
          totalSuccess += data.successCount || 0;
          totalFailed += data.failedCount || 0;

          const resultMap = new Map<string, any>();
          resList.forEach((r: any) => resultMap.set(r.fileName, r));

          setAnalyzedItems(prev => prev.map(item => {
            const r = resultMap.get(item.fileName);
            if (r) {
              return {
                ...item,
                executionResult: {
                  status: r.status,
                  message: r.message,
                  receiptCode: r.receiptCode,
                  totalParticipants: r.summary?.totalParticipants
                }
              };
            }
            return item;
          }));
        } catch (chunkErr: any) {
          console.error('Lỗi nộp hộ nhóm:', chunkErr);
          const rawMsg = chunkErr.message || '';
          const friendlyMsg = (rawMsg.includes('Unexpected end of JSON') || rawMsg.includes('Failed to execute'))
            ? 'Phản hồi từ máy chủ bị gián đoạn khi nộp nhóm này. Vui lòng thử nộp riêng từng file.'
            : (rawMsg || 'Lỗi kết nối máy chủ');

          chunk.forEach(chunkItem => {
            totalFailed++;
            accumulatedResults.push({
              fileName: chunkItem.fileName,
              status: 'FAILED',
              message: friendlyMsg
            });
            setAnalyzedItems(prev => prev.map(item => {
              if (item.id === chunkItem.id) {
                return {
                  ...item,
                  executionResult: {
                    status: 'FAILED',
                    message: friendlyMsg
                  }
                };
              }
              return item;
            }));
          });
        }
      }

      setExecutionResult({
        successCount: totalSuccess,
        failedCount: totalFailed,
        results: accumulatedResults
      });

      setProgress({
        current: total,
        total,
        percent: 100,
        stage: 'completed',
        message: `Hoàn tất nộp hộ: Thành công ${totalSuccess}, Thất bại ${totalFailed}`
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      alert('Nộp hộ thất bại: ' + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Thống kê số lượng
  const totalFiles = analyzedItems.length;
  const readyCount = analyzedItems.filter(it => 
    ['EXACT_CODE', 'EXACT_NAME', 'STRONG_MATCH', 'MATCHED'].includes(it.matchStatus) && !it.parseError
  ).length;
  const warningCount = totalFiles - readyCount;
  const selectedCount = analyzedItems.filter(it => it.selected && it.assignedUnitId).length;

  const filteredItems = analyzedItems.filter(item => {
    const isSafe = ['EXACT_CODE', 'EXACT_NAME', 'STRONG_MATCH', 'MATCHED'].includes(item.matchStatus) && !item.parseError;
    if (filterView === 'READY') return isSafe;
    if (filterView === 'WARNING') return !isSafe;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between border-b border-emerald-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">TẢI LÊN NHIỀU FILE EXCEL ĐƠN VỊ GỬI</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                  Batch Proxy Upload
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Tự động nhận diện đơn vị qua mã chi nhánh & tên file. Cảnh báo an toàn, tuyệt đối không suy đoán bừa.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isAnalyzing || isExecuting}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thân Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Thanh cấu hình Đợt khảo sát */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-700" />
                Đợt khảo sát áp dụng:
              </span>
              <select
                value={selectedCollectionId}
                onChange={e => setSelectedCollectionId(Number(e.target.value))}
                className="text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              >
                {collections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.year}) - {c.status === 'OPEN' ? 'Đang mở' : 'Đã khóa'}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500">
              Tổng số chi nhánh trong danh mục: <strong className="text-slate-800">{units.length}</strong> đơn vị
            </div>
          </div>

          {/* Vùng Chọn file / Kéo thả */}
          {totalFiles === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-white shadow-md border border-emerald-100 flex items-center justify-center text-emerald-700 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-800">
                  Nhấp để chọn hoặc kéo thả nhiều file Excel Mẫu số 04 vào đây
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Hệ thống hỗ trợ chọn đồng thời hàng chục hoặc hàng trăm file (<code className="text-emerald-700 font-bold">.xlsx</code>, <code className="text-emerald-700 font-bold">.xls</code>)
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#005F3E] text-white shadow-xs group-hover:bg-[#004d32] transition-colors">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Chọn các file Excel từ máy tính</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Thanh điều khiển danh sách đã phân tích */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Bộ lọc xem:</span>
                  <button
                    onClick={() => setFilterView('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      filterView === 'ALL'
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({totalFiles})
                  </button>
                  <button
                    onClick={() => setFilterView('READY')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                      filterView === 'READY'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Hợp lệ sẵn sàng nộp ({readyCount})</span>
                  </button>
                  <button
                    onClick={() => setFilterView('WARNING')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                      filterView === 'WARNING'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>Cần kiểm tra lại ({warningCount})</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing || isExecuting}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                    <span>Chọn thêm / Chọn lại file</span>
                  </button>
                  <button
                    onClick={() => {
                      setFiles([]);
                      setAnalyzedItems([]);
                      setExecutionResult(null);
                    }}
                    disabled={isAnalyzing || isExecuting}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Xóa tất cả
                  </button>
                </div>
              </div>

              {/* Thanh tiến trình thời gian thực (Progress Bar) */}
              {(isAnalyzing || isExecuting) && (
                <div className="p-4 rounded-xl bg-slate-900 text-white shadow-lg border border-slate-700 space-y-2.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span className="uppercase tracking-wider text-emerald-300 font-extrabold">
                        {isAnalyzing ? 'Tiến trình phân tích tệp' : 'Tiến trình nộp hộ & cấp biên nhận'}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-emerald-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs shadow-inner">
                      {progress.current} / {progress.total} file ({progress.percent}%)
                    </span>
                  </div>

                  {/* Thanh hiển thị % chạy mượt mà */}
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                    <div
                      className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out shadow-xs"
                      style={{ width: `${Math.max(4, progress.percent)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <p className="truncate max-w-2xl font-medium">
                      {progress.message || 'Hệ thống đang xử lý từng cụm 3 file để tối ưu bộ nhớ RAM và không làm đơ giao diện...'}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      Cụm 3 file / lượt
                    </span>
                  </div>
                </div>
              )}

              {/* Thông báo kết quả thực thi nộp hộ */}
              {executionResult && (
                <div>
                  {executionResult.successCount > 0 && executionResult.failedCount === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 flex items-start gap-3.5 text-emerald-950 shadow-sm animate-in fade-in duration-300">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="text-xs space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm text-emerald-900 tracking-tight">
                            HOÀN TẤT NỘP HỘ THÀNH CÔNG CHO {executionResult.successCount} ĐƠN VỊ!
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-200 text-emerald-900 border border-emerald-300">
                            Thành công 100%
                          </span>
                        </div>
                        <p className="text-emerald-800 leading-relaxed font-medium">
                          Hệ thống đã lưu trữ dữ liệu khảo sát và tự động đồng bộ trạng thái của các chi nhánh trên Dashboard chính sang <strong className="text-emerald-950 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded">ĐÃ GỬI CHÍNH THỨC</strong> kèm mã biên nhận điện tử.
                        </p>
                      </div>
                    </div>
                  ) : executionResult.successCount > 0 && executionResult.failedCount > 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-500 flex items-start gap-3.5 text-amber-950 shadow-sm animate-in fade-in duration-300">
                      <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div className="text-xs space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm text-amber-900 tracking-tight">
                            NỘP HỘ THÀNH CÔNG {executionResult.successCount} ĐƠN VỊ - CÓ {executionResult.failedCount} FILE THẤT BẠI
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-200 text-amber-900 border border-amber-300">
                            Một phần thành công
                          </span>
                        </div>
                        <p className="text-amber-800 leading-relaxed font-medium">
                          Các đơn vị thành công đã được cập nhật sang <strong className="text-emerald-800 font-bold">ĐÃ GỬI CHÍNH THỨC</strong> trên hệ thống. Với các file thất bại, vui lòng kiểm tra nguyên nhân chi tiết tại từng dòng bên dưới để xử lý.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-500 flex items-start gap-3.5 text-rose-950 shadow-sm animate-in fade-in duration-300">
                      <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <XCircle className="w-6 h-6" />
                      </div>
                      <div className="text-xs space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm text-rose-900 tracking-tight">
                            CHƯA NỘP ĐƯỢC FILE NÀO (0/{totalFiles} THÀNH CÔNG)
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-200 text-rose-900 border border-rose-300">
                            Thất bại / Bỏ qua
                          </span>
                        </div>
                        <p className="text-rose-800 leading-relaxed font-medium">
                          Không có file nào được nộp hộ thành công. Vui lòng kiểm tra lại xem các file đã được tích chọn chưa, hoặc kiểm tra xem chi nhánh đích đã được gán chính xác hay file có lỗi định dạng hay không.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bảng chi tiết từng file */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={readyCount > 0 && selectedCount === readyCount}
                            onChange={(e) => handleSelectAllValid(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                            title="Chọn/Bỏ chọn tất cả file hợp lệ"
                          />
                        </th>
                        <th className="py-2.5 px-3">Tên file đơn vị gửi</th>
                        <th className="py-2.5 px-3">Đơn vị nhận diện / Gán đích</th>
                        <th className="py-2.5 px-3">Trạng thái nhận diện & Cảnh báo an toàn</th>
                        <th className="py-2.5 px-3 text-right">Dữ liệu bóc tách</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.map((item) => {
                        const isSafe = ['EXACT_CODE', 'EXACT_NAME', 'STRONG_MATCH', 'MATCHED'].includes(item.matchStatus) && !item.parseError;
                        const isConflict = item.matchStatus === 'CONFLICT';
                        const isNotFound = item.matchStatus === 'NOT_FOUND';
                        const isInvalidExcel = item.matchStatus === 'INVALID_EXCEL' || !!item.parseError;

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              item.executionResult?.status === 'SUCCESS' 
                                ? 'bg-emerald-50/60'
                                : item.executionResult?.status === 'FAILED'
                                ? 'bg-rose-50/50'
                                : item.selected 
                                ? 'bg-emerald-50/30' 
                                : !isSafe 
                                ? 'bg-amber-50/20' 
                                : ''
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => handleToggleSelect(item.id)}
                                disabled={item.assignedUnitId === null || !!item.parseError || item.executionResult?.status === 'SUCCESS'}
                                className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              />
                            </td>

                            {/* Tên file */}
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800 break-all max-w-xs sm:max-w-sm flex items-center gap-1.5">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>{item.fileName}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {(item.fileSize / 1024).toFixed(1)} KB
                              </div>
                            </td>

                            {/* Đơn vị nhận diện / Gán đích */}
                            <td className="py-2.5 px-3">
                              {item.unit ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px]">
                                      {item.unit.code}
                                    </span>
                                    <span className="font-bold text-slate-900 text-xs">
                                      {item.unit.name}
                                    </span>
                                  </div>
                                  {/* Cho phép Admin thay đổi nếu muốn */}
                                  <select
                                    value={item.assignedUnitId || ''}
                                    onChange={(e) => handleAssignUnit(item.id, e.target.value)}
                                    disabled={item.executionResult?.status === 'SUCCESS'}
                                    className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 cursor-pointer max-w-[200px] disabled:opacity-60"
                                  >
                                    <option value={item.unit.id}>Đổi đơn vị khác...</option>
                                    {units.map(u => (
                                      <option key={u.id} value={u.id}>
                                        [{u.unit_code}] {u.unit_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : item.reasons[0] === 'Đang chờ phân tích...' ? (
                                <div className="text-slate-400 text-xs italic flex items-center gap-1.5 py-1">
                                  <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                                  <span>Đang chờ nhận diện...</span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="text-amber-800 font-bold text-xs flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Chưa xác định đơn vị</span>
                                  </div>
                                  <select
                                    value={item.assignedUnitId || ''}
                                    onChange={(e) => handleAssignUnit(item.id, e.target.value)}
                                    disabled={item.executionResult?.status === 'SUCCESS'}
                                    className="text-xs font-bold text-slate-800 bg-white border border-amber-300 rounded px-2 py-1 shadow-2xs cursor-pointer max-w-[220px] disabled:opacity-60"
                                  >
                                    <option value="">-- Chọn đơn vị chỉ định --</option>
                                    {units.map(u => (
                                      <option key={u.id} value={u.id}>
                                        [{u.unit_code}] {u.unit_name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* Trạng thái nhận diện & Cảnh báo an toàn / Kết quả nộp */}
                            <td className="py-2.5 px-3">
                              {item.executionResult ? (
                                item.executionResult.status === 'SUCCESS' ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-emerald-600 text-white shadow-xs">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      ĐÃ NỘP HỘ THÀNH CÔNG
                                    </span>
                                    {item.executionResult.receiptCode && (
                                      <div className="text-[10px] text-emerald-800 font-bold font-mono">
                                        Mã biên nhận: {item.executionResult.receiptCode}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-emerald-700">
                                      Trạng thái: <strong>ĐÃ GỬI CHÍNH THỨC</strong>
                                    </div>
                                  </div>
                                ) : item.executionResult.status === 'FAILED' ? (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-rose-600 text-white shadow-xs">
                                      <XCircle className="w-3.5 h-3.5" />
                                      NỘP HỘ THẤT BẠI
                                    </span>
                                    <p className="text-[10px] text-rose-800 font-medium">
                                      {item.executionResult.message || 'Lỗi khi ghi dữ liệu'}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-amber-500 text-white shadow-xs">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      ĐÃ BỎ QUA
                                    </span>
                                    <p className="text-[10px] text-amber-800">
                                      {item.executionResult.message || 'Chưa tích chọn nộp'}
                                    </p>
                                  </div>
                                )
                              ) : isSafe ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    {item.matchStatus === 'EXACT_CODE' && 'Khớp chính xác mã đơn vị'}
                                    {item.matchStatus === 'EXACT_NAME' && 'Khớp chính xác tên chi nhánh'}
                                    {(item.matchStatus === 'STRONG_MATCH' || item.matchStatus === 'MATCHED') && 'Nhận diện chuẩn xác'}
                                  </span>
                                  {item.reasons.length > 0 && (
                                    <p className="text-[10px] text-slate-500">
                                      {item.reasons[0]}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {isConflict && (
                                    <div className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-[11px] font-semibold space-y-0.5">
                                      <div className="flex items-center gap-1 font-bold text-red-700">
                                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>CẢNH BÁO MÂU THUẪN MÃ & TÊN</span>
                                      </div>
                                      <p className="text-[10px] text-red-800">
                                        {item.reasons.join('. ')}
                                      </p>
                                      <p className="text-[9px] text-red-600 italic">
                                        * Hệ thống không tự ý nộp bừa. Vui lòng kiểm tra lại file!
                                      </p>
                                    </div>
                                  )}

                                  {isNotFound && (
                                    item.reasons[0] === 'Đang chờ phân tích...' ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                                        <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                                        <span>Đang chờ phân tích...</span>
                                      </span>
                                    ) : (
                                      <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold space-y-0.5">
                                        <div className="flex items-center gap-1 font-bold text-amber-800">
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                          <span>KHÔNG TÌM THẤY ĐƠN VỊ TRONG HỆ THỐNG</span>
                                        </div>
                                        <p className="text-[10px] text-amber-800">
                                          {item.reasons.join('. ')}
                                        </p>
                                      </div>
                                    )
                                  )}

                                  {isInvalidExcel && (
                                    <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-semibold space-y-0.5">
                                      <div className="flex items-center gap-1 font-bold text-rose-700">
                                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                                        <span>LỖI ĐỊNH DẠNG FILE EXCEL</span>
                                      </div>
                                      <p className="text-[10px] text-rose-800">
                                        {item.parseError || 'File không khớp cấu trúc Mẫu số 04'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Dữ liệu bóc tách */}
                            <td className="py-2.5 px-3 text-right">
                              {item.parsedSummary ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900">
                                    {item.parsedSummary.programsCount} chuyên đề
                                  </div>
                                  <div className="text-[10px] text-emerald-800 font-semibold">
                                    {item.parsedSummary.participantsCount} lượt đăng ký
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">Chưa có dữ liệu</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Modal & Nút hành động */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {totalFiles > 0 ? (
              <span>
                Đã chọn: <strong className="text-emerald-700">{selectedCount}</strong> / {totalFiles} file | 
                Hợp lệ: <strong className="text-slate-800">{readyCount}</strong> | 
                Cảnh báo cần xem: <strong className="text-amber-700">{warningCount}</strong>
              </span>
            ) : (
              <span>Vui lòng chọn các file Excel để bắt đầu phân tích.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Đóng
            </button>

            {totalFiles > 0 && (
              <button
                type="button"
                onClick={executionResult && executionResult.successCount > 0 && executionResult.failedCount === 0 ? onClose : handleExecuteUpload}
                disabled={isExecuting || (!executionResult && selectedCount === 0) || isAnalyzing}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                  executionResult && executionResult.successCount > 0 && executionResult.failedCount === 0
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-[#005F3E] hover:bg-[#004d32]'
                }`}
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang nộp hộ dữ liệu...</span>
                  </>
                ) : executionResult && executionResult.successCount > 0 && executionResult.failedCount === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Hoàn tất ({executionResult.successCount} đơn vị) - Đóng</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Tiến hành Nộp Hộ ({selectedCount} file)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
