'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  Search,
  PlusCircle,
  Edit,
  Power,
  RefreshCw,
  X,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  Upload,
  MapPin,
  Layers,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface UnitItem {
  id: number;
  unit_code: string;
  unit_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  unit_type: 'HO' | 'BRANCH_L1' | 'BRANCH_L2' | 'SUBSIDIARY';
  region: 'MIEN_BAC' | 'MIEN_TRUNG' | 'TAY_NGUYEN' | 'MIEN_NAM' | 'HO';
  parent_unit_id: number | null;
  parent_unit_name?: string;
  parent_unit_code?: string;
  upload_count: number;
  demand_count: number;
  user_count: number;
  created_at: string;
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
  BRANCH_L2: 'Chi nhánh Loại 2 / PGD',
  HO: 'Trụ sở chính / Ban',
  SUBSIDIARY: 'Công ty con / ĐVSN'
};

export default function AdminUnitsPage() {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Modal Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitType, setNewUnitType] = useState<string>('BRANCH_L1');
  const [newRegion, setNewRegion] = useState<string>('MIEN_BAC');
  const [newParentId, setNewParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Modal Edit
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editUnitCode, setEditUnitCode] = useState('');
  const [editUnitName, setEditUnitName] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editUnitType, setEditUnitType] = useState<string>('BRANCH_L1');
  const [editRegion, setEditRegion] = useState<string>('MIEN_BAC');
  const [editParentId, setEditParentId] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Import Excel
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/units');
      if (res.ok) {
        const data = await res.json();
        setUnits(data.units || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  const filteredUnits = useMemo(() => {
    return units.filter(u => {
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (regionFilter !== 'ALL' && u.region !== regionFilter) return false;
      if (typeFilter !== 'ALL' && u.unit_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchCode = u.unit_code.toLowerCase().includes(q);
        const matchName = u.unit_name.toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }, [units, statusFilter, regionFilter, typeFilter, searchQuery]);

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitCode: newUnitCode,
          unitName: newUnitName,
          status: 'ACTIVE',
          unitType: newUnitType,
          region: newRegion,
          parentUnitId: newParentId ? parseInt(newParentId) : null
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi thêm đơn vị');
      setMessage({ type: 'success', text: d.message || 'Thêm đơn vị thành công!' });
      setShowCreateModal(false);
      setNewUnitCode('');
      setNewUnitName('');
      setNewUnitType('BRANCH_L1');
      setNewRegion('MIEN_BAC');
      setNewParentId('');
      fetchUnits();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: UnitItem) => {
    setEditingUnit(u);
    setEditUnitCode(u.unit_code);
    setEditUnitName(u.unit_name);
    setEditStatus(u.status);
    setEditUnitType(u.unit_type || 'BRANCH_L1');
    setEditRegion(u.region || 'MIEN_BAC');
    setEditParentId(u.parent_unit_id ? String(u.parent_unit_id) : '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUnit.id,
          unitCode: editUnitCode,
          unitName: editUnitName,
          status: editStatus,
          unitType: editUnitType,
          region: editRegion,
          parentUnitId: editParentId ? parseInt(editParentId) : null
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật');
      setMessage({ type: 'success', text: 'Cập nhật phân cấp đơn vị thành công!' });
      setEditingUnit(null);
      fetchUnits();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (u: UnitItem) => {
    const nextStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMsg = nextStatus === 'INACTIVE'
      ? `Bạn có chắc muốn VÔ HIỆU HÓA đơn vị "${u.unit_name}" (${u.unit_code})?`
      : `Bạn có muốn KÍCH HOẠT LẠI đơn vị "${u.unit_name}" (${u.unit_code})?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: u.id,
          status: nextStatus
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật');
      setMessage({ type: 'success', text: `Đã ${nextStatus === 'ACTIVE' ? 'kích hoạt lại' : 'vô hiệu hóa'} đơn vị thành công!` });
      fetchUnits();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Tải file mẫu phân cấp đơn vị
  const handleDownloadTemplate = () => {
    const templateData = units.slice(0, 10).map(u => ({
      'Mã đơn vị': u.unit_code,
      'Tên đơn vị': u.unit_name,
      'Phân loại': UNIT_TYPE_LABELS[u.unit_type] || 'Chi nhánh Loại 1',
      'Vùng miền': REGION_LABELS[u.region] || 'Miền Bắc',
      'Mã đơn vị cấp trên': u.parent_unit_code || ''
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PhanCapDonVi');
    XLSX.writeFile(wb, 'Mau_Phan_Cap_Don_Vi_Agribank.xlsx');
  };

  // Upload file Excel cập nhật phân cấp
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/units/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý file Excel.');
      setImportResult(data);
      setMessage({ type: 'success', text: data.message });
      fetchUnits();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#005F3E] flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-[#005F3E]" />
            Quản Lý Danh Sách & Phân Cấp Đơn Vị Agribank
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý mạng lưới chi nhánh toàn quốc, phân loại cấp tổ chức và vùng miền (Bắc, Trung, Nam, Tây Nguyên).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            <span>Nhập từ Excel</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Thêm đơn vị mới</span>
          </button>

          <button
            onClick={fetchUnits}
            className="p-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-xs"
            title="Làm mới"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Thông báo */}
      {message && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-semibold ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Bộ lọc 4 tiêu chí */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tìm kiếm đơn vị</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Mã (VD: 2500) hoặc tên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 pr-8 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Vùng miền</label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả Vùng miền --</option>
              {Object.entries(REGION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Phân loại đơn vị</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả Phân loại --</option>
              {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả ({units.length}) --</option>
              <option value="ACTIVE">Hoạt động (ACTIVE)</option>
              <option value="INACTIVE">Vô hiệu hóa (INACTIVE)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng danh sách đơn vị */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
          <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wide flex items-center gap-2">
            <span>Danh sách đơn vị ({filteredUnits.length} / {units.length})</span>
          </h2>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Đang tải danh sách đơn vị...</div>
        ) : filteredUnits.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Không tìm thấy đơn vị nào phù hợp bộ lọc.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 w-24">Mã ĐV</th>
                  <th className="p-3 min-w-[200px]">Tên đơn vị</th>
                  <th className="p-3">Phân loại</th>
                  <th className="p-3">Vùng miền</th>
                  <th className="p-3">Đơn vị cấp trên</th>
                  <th className="p-3 text-center">Nộp thi</th>
                  <th className="p-3 text-center">Khảo sát</th>
                  <th className="p-3 text-center">User</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUnits.map((u, idx) => {
                  const isActive = u.status === 'ACTIVE';
                  const regLabel = REGION_LABELS[u.region] || u.region;
                  const typeLabel = UNIT_TYPE_LABELS[u.unit_type] || u.unit_type;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-center">{idx + 1}</td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {u.unit_code}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{u.unit_name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {regLabel}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {u.parent_unit_name ? (
                          <span className="text-[11px]" title={`Mã: ${u.parent_unit_code}`}>
                            {u.parent_unit_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${u.upload_count > 0 ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
                          {u.upload_count || 0}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${u.demand_count > 0 ? 'bg-blue-50 text-blue-800' : 'text-slate-400'}`}>
                          {u.demand_count || 0}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {u.user_count || 0}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          {isActive ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-rose-600" />}
                          {isActive ? 'Hoạt động' : 'Vô hiệu'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900"
                            title="Sửa phân cấp & thông tin đơn vị"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded transition-colors ${
                              isActive
                                ? 'hover:bg-rose-50 text-rose-700 hover:text-rose-800'
                                : 'hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800'
                            }`}
                            title={isActive ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm Đơn Vị */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-[#005F3E]" />
                Thêm Đơn Vị Mới & Phân Cấp
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUnit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Mã đơn vị <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 2500..."
                    value={newUnitCode}
                    onChange={(e) => setNewUnitCode(e.target.value.trim().toUpperCase())}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Vùng miền <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 font-semibold text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    {Object.entries(REGION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên đơn vị (Chi nhánh) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Agribank Chi nhánh Bắc Giang"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phân loại đơn vị</label>
                  <select
                    value={newUnitType}
                    onChange={(e) => setNewUnitType(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đơn vị cấp trên (nếu có)</label>
                  <select
                    value={newParentId}
                    onChange={(e) => setNewParentId(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    <option value="">-- Không có (Trực thuộc TW) --</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.unit_code} - {u.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-[#005F3E] text-white rounded-lg font-bold hover:bg-[#004d32] disabled:opacity-50"
                >
                  {creating ? 'Đang tạo...' : 'Tạo đơn vị'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sửa Phân Cấp & Thông Tin Đơn Vị */}
      {editingUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Edit className="w-4 h-4 text-[#005F3E]" />
                Sửa Phân Cấp & Đơn Vị: {editingUnit.unit_code}
              </h3>
              <button onClick={() => setEditingUnit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã đơn vị</label>
                  <input
                    type="text"
                    required
                    value={editUnitCode}
                    onChange={(e) => setEditUnitCode(e.target.value.trim().toUpperCase())}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vùng miền</label>
                  <select
                    value={editRegion}
                    onChange={(e) => setEditRegion(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 font-semibold text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    {Object.entries(REGION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên đơn vị</label>
                <input
                  type="text"
                  required
                  value={editUnitName}
                  onChange={(e) => setEditUnitName(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phân loại đơn vị</label>
                  <select
                    value={editUnitType}
                    onChange={(e) => setEditUnitType(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    {Object.entries(UNIT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đơn vị cấp trên</label>
                  <select
                    value={editParentId}
                    onChange={(e) => setEditParentId(e.target.value)}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    <option value="">-- Không có (Trực thuộc TW) --</option>
                    {units.filter(u => u.id !== editingUnit.id).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.unit_code} - {u.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trạng thái</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                >
                  <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                  <option value="INACTIVE">Vô hiệu hóa (INACTIVE)</option>
                </select>
              </div>

              {((editingUnit.upload_count || 0) > 0 || (editingUnit.demand_count || 0) > 0) && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Đơn vị này đã có dữ liệu kê khai. Hệ thống chỉ cho phép cập nhật phân cấp hoặc vô hiệu hóa, không xóa dữ liệu.</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUnit(null)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-[#005F3E] text-white rounded-lg font-bold hover:bg-[#004d32] disabled:opacity-50"
                >
                  {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nhập Phân Cấp Từ Excel */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#005F3E]" />
                Nhập Phân Cấp & Vùng Miền Từ Excel
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Tải lên file Excel danh sách đơn vị để cập nhật hàng loạt <strong>Vùng miền</strong> (Miền Bắc, Miền Trung, Miền Nam, Tây Nguyên), <strong>Phân loại</strong> (Chi nhánh Loại 1, Loại 2, Hội sở) và <strong>Mã đơn vị cấp trên</strong>.
              </p>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">Cấu trúc các cột trong file Excel:</div>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><code>Mã đơn vị</code>: Mã số chi nhánh (bắt buộc)</li>
                  <li><code>Vùng miền</code>: Miền Bắc / Miền Trung / Tây Nguyên / Miền Nam</li>
                  <li><code>Phân loại</code>: Chi nhánh Loại 1 / Chi nhánh Loại 2 / Trụ sở chính</li>
                  <li><code>Mã đơn vị cấp trên</code>: Mã chi nhánh Loại 1 quản lý (tùy chọn)</li>
                </ul>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải file Excel mẫu</span>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{importing ? 'Đang xử lý...' : 'Chọn file Excel tải lên'}</span>
                </button>
              </div>

              {importResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 space-y-1 mt-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{importResult.message}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 text-xs"
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
