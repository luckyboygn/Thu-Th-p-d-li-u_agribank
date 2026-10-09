'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutGrid,
  PlusCircle,
  ShieldCheck,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Trash2,
  Calendar,
  Layers
} from 'lucide-react';

interface FormFieldItem {
  fieldName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options?: string[];
}

interface FormItem {
  id: number;
  collection_id: number;
  form_code: string;
  title: string;
  description: string;
  input_method: string;
  validation_mode: 'MASTER_VALIDATION' | 'FORM_VALIDATION_ONLY';
  employee_code_field?: string;
  elearning_field?: string;
  fieldCount: number;
  created_at: string;
}

export default function AdminFormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal / Form Builder state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFormCode, setNewFormCode] = useState('');
  const [newFormTitle, setNewFormTitle] = useState('');
  const [newFormDesc, setNewFormDesc] = useState('');
  const [newInputMethod, setNewInputMethod] = useState<'EXCEL' | 'WEB_FORM' | 'BOTH'>('BOTH');
  const [newValMode, setNewValMode] = useState<'MASTER_VALIDATION' | 'FORM_VALIDATION_ONLY'>('FORM_VALIDATION_ONLY');
  const [newEmpCodeField, setNewEmpCodeField] = useState('employee_code');
  const [newElearnField, setNewElearnField] = useState('elearning_account');
  const [customFields, setCustomFields] = useState<FormFieldItem[]>([
    { fieldName: 'topic', label: 'Nội dung / Lĩnh vực', fieldType: 'TEXT', required: true },
    { fieldName: 'quantity', label: 'Số lượng', fieldType: 'NUMBER', required: true }
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCollections = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      const list = data.exams || [];
      setCollections(list);
      if (list.length > 0 && !selectedCollectionId) {
        setSelectedCollectionId(list[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchForms = async (collId?: number) => {
    try {
      setLoading(true);
      const url = collId ? `/api/forms?collectionId=${collId}` : '/api/forms';
      const res = await fetch(url);
      const data = await res.json();
      setForms(data.forms || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (selectedCollectionId) {
      fetchForms(selectedCollectionId);
    }
  }, [selectedCollectionId]);

  const addFieldRow = () => {
    setCustomFields([
      ...customFields,
      { fieldName: `field_${customFields.length + 1}`, label: `Trường ${customFields.length + 1}`, fieldType: 'TEXT', required: false }
    ]);
  };

  const removeFieldRow = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormCode || !newFormTitle || !selectedCollectionId) {
      setMessage({ type: 'error', text: 'Vui lòng nhập Mã form, Tên form và chọn Đợt thu thập.' });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: selectedCollectionId,
          formCode: newFormCode,
          title: newFormTitle,
          description: newFormDesc,
          inputMethod: newInputMethod,
          validationMode: newValMode,
          employeeCodeField: newValMode === 'MASTER_VALIDATION' ? newEmpCodeField : null,
          elearningField: newValMode === 'MASTER_VALIDATION' ? newElearnField : null,
          fields: customFields
        })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi khi tạo biểu mẫu');

      setMessage({ type: 'success', text: 'Đã tạo Biểu mẫu thu thập mới thành công!' });
      setShowCreateModal(false);
      setNewFormCode('');
      setNewFormTitle('');
      setNewFormDesc('');
      fetchForms(selectedCollectionId);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Quản trị Kiến trúc Biểu mẫu
          </div>
          <h2 className="text-xl font-bold text-[#005F3E] flex items-center gap-2 mt-1">
            <LayoutGrid className="w-6 h-6 text-[#005F3E]" />
            <span>Danh mục Biểu mẫu thu thập dữ liệu (Forms)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Thiết lập linh hoạt cơ chế kiểm tra (Master Validation đối chiếu cán bộ hoặc Form Validation Only cho các khảo sát ý kiến/nhu cầu), hỗ trợ thu thập đa dạng nghiệp vụ từ các đơn vị toàn hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-amber-300" />
            + Tạo Biểu mẫu mới (Form Builder)
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline">Đóng</button>
        </div>
      )}

      {/* Bộ chọn Đợt thu thập */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <Calendar className="w-4 h-4 text-[#005F3E]" />
          <span>Lọc theo Đợt thu thập:</span>
        </div>
        <select
          value={selectedCollectionId || ''}
          onChange={(e) => setSelectedCollectionId(parseInt(e.target.value))}
          className="text-xs font-bold text-slate-800 border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#005F3E] cursor-pointer"
        >
          {collections.map(c => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.code}) — [{c.status}]
            </option>
          ))}
        </select>
      </div>

      {/* Danh sách Biểu mẫu */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forms.map((form) => {
          const isMaster = form.validation_mode === 'MASTER_VALIDATION';

          return (
            <div
              key={form.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {form.form_code}
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                    isMaster
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  }`}>
                    {isMaster ? 'MASTER VALIDATION' : 'FORM VALIDATION ONLY'}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{form.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {form.description || 'Chưa có mô tả chi tiết cho biểu mẫu này.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Phương thức nộp:</span>
                    <span className="font-semibold text-slate-700">{form.input_method}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Số trường quy tắc:</span>
                    <span className="font-bold text-[#005F3E]">{form.fieldCount} trường</span>
                  </div>
                  {isMaster && (
                    <div className="p-2 bg-amber-50/50 rounded-lg text-[11px] text-amber-900 border border-amber-200/60 mt-2">
                      <div className="font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                        Đối chiếu 2 chiều Cán bộ:
                      </div>
                      <div className="font-mono text-[10px] text-amber-800 mt-0.5">
                        {form.employee_code_field || 'Mã CB'} ↔ {form.elearning_field || 'eLearning'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">ID: #{form.id}</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  Đang hoạt động <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL TẠO FORM MỚI (FORM BUILDER) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#005F3E]" />
                Tạo Biểu Mẫu Mới (Form Builder)
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Biểu Mẫu (Viết hoa, viết liền):</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: KHAO_SAT_CSVC"
                    value={newFormCode}
                    onChange={(e) => setNewFormCode(e.target.value.toUpperCase())}
                    className="w-full text-xs font-mono font-bold p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#005F3E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phương thức nhập (Input Method):</label>
                  <select
                    value={newInputMethod}
                    onChange={(e: any) => setNewInputMethod(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#005F3E]"
                  >
                    <option value="BOTH">Cả hai (Web Form & Nộp Excel)</option>
                    <option value="WEB_FORM">Chỉ Web Form</option>
                    <option value="EXCEL">Chỉ nộp file Excel</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Biểu Mẫu:</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Khảo sát hiện trạng cơ sở vật chất CNTT 2027"
                  value={newFormTitle}
                  onChange={(e) => setNewFormTitle(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả mục đích thu thập:</label>
                <textarea
                  rows={2}
                  placeholder="Giải thích ngắn gọn cho các đơn vị hiểu mục đích biểu mẫu này..."
                  value={newFormDesc}
                  onChange={(e) => setNewFormDesc(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#005F3E]"
                />
              </div>

              {/* LỰA CHỌN VALIDATION MODE (MẶC ĐỊNH FORM_VALIDATION_ONLY) */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-900">
                  Cơ chế kiểm tra dữ liệu (Validation Mode):
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 ${
                    newValMode === 'FORM_VALIDATION_ONLY'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="valMode"
                        checked={newValMode === 'FORM_VALIDATION_ONLY'}
                        onChange={() => setNewValMode('FORM_VALIDATION_ONLY')}
                      />
                      <span className="text-xs">FORM_VALIDATION_ONLY (Mặc định)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal pl-5">
                      Chỉ kiểm tra quy tắc biểu mẫu (bắt buộc, số lượng, chọn mục). Tuyệt đối không đối chiếu Master Database.
                    </p>
                  </label>

                  <label className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 ${
                    newValMode === 'MASTER_VALIDATION'
                      ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="valMode"
                        checked={newValMode === 'MASTER_VALIDATION'}
                        onChange={() => setNewValMode('MASTER_VALIDATION')}
                      />
                      <span className="text-xs">MASTER_VALIDATION</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal pl-5">
                      Bắt buộc xác thực danh tính 2 chiều (Mã cán bộ ↔ eLearning) với Master DB.
                    </p>
                  </label>
                </div>

                {newValMode === 'MASTER_VALIDATION' && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Trường Mã cán bộ:</label>
                      <input
                        type="text"
                        value={newEmpCodeField}
                        onChange={(e) => setNewEmpCodeField(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Trường Tài khoản eLearning:</label>
                      <input
                        type="text"
                        value={newElearnField}
                        onChange={(e) => setNewElearnField(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DANH SÁCH TRƯỜNG DỮ LIỆU CỦA FORM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900">
                    Các trường dữ liệu cấu hình ({customFields.length}):
                  </label>
                  <button
                    type="button"
                    onClick={addFieldRow}
                    className="text-xs text-[#005F3E] font-bold hover:underline"
                  >
                    + Thêm trường
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {customFields.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <input
                        type="text"
                        placeholder="Tên biến (VD: topic)"
                        value={f.fieldName}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[idx].fieldName = e.target.value;
                          setCustomFields(updated);
                        }}
                        className="w-28 p-1.5 border border-slate-300 rounded font-mono text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Nhãn hiển thị (VD: Lĩnh vực)"
                        value={f.label}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[idx].label = e.target.value;
                          setCustomFields(updated);
                        }}
                        className="flex-1 p-1.5 border border-slate-300 rounded text-[11px]"
                      />
                      <select
                        value={f.fieldType}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[idx].fieldType = e.target.value;
                          setCustomFields(updated);
                        }}
                        className="w-24 p-1.5 border border-slate-300 rounded text-[11px]"
                      >
                        <option value="TEXT">Văn bản</option>
                        <option value="NUMBER">Số lượng</option>
                        <option value="SINGLE_SELECT">Chọn một</option>
                        <option value="DATE">Ngày tháng</option>
                        <option value="LONG_TEXT">Đoạn văn</option>
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 shrink-0">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => {
                            const updated = [...customFields];
                            updated[idx].required = e.target.checked;
                            setCustomFields(updated);
                          }}
                        />
                        Bắt buộc
                      </label>
                      <button
                        type="button"
                        onClick={() => removeFieldRow(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700"
                        title="Xóa trường"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu & Khởi tạo Biểu Mẫu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
