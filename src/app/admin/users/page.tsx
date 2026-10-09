'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Lock,
  Unlock,
  KeyRound,
  Edit,
  Building2,
  Shield,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  X
} from 'lucide-react';

interface UserItem {
  id: number;
  username: string;
  full_name: string;
  role: 'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER' | 'VIEWER';
  unit_id: number | null;
  unit_code?: string;
  unit_name?: string;
  status: 'ACTIVE' | 'INACTIVE';
  token_version: number;
  created_at: string;
}

interface UnitItem {
  id: number;
  unit_code: string;
  unit_name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER' | 'VIEWER'>('UNIT_ADMIN');
  const [newUnitId, setNewUnitId] = useState<number | ''>('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Modal Edit
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'SUPER_ADMIN' | 'UNIT_ADMIN' | 'UNIT_PREPARER' | 'UNIT_APPROVER' | 'VIEWER'>('UNIT_ADMIN');
  const [editUnitId, setEditUnitId] = useState<number | ''>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal Reset Password Result
  const [tempPasswordResult, setTempPasswordResult] = useState<{ username: string; tempPass: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await fetch('/api/units');
      if (res.ok) {
        const data = await res.json();
        setUnits(data.units || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchUnits();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (unitFilter !== 'ALL' && String(u.unit_id) !== unitFilter) return false;
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchUser = u.username.toLowerCase().includes(q);
        const matchName = u.full_name.toLowerCase().includes(q);
        const matchUnit = (u.unit_name || '').toLowerCase().includes(q) || (u.unit_code || '').toLowerCase().includes(q);
        if (!matchUser && !matchName && !matchUnit) return false;
      }
      return true;
    });
  }, [users, unitFilter, roleFilter, statusFilter, searchQuery]);

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const isUnitRole = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(newRole);
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          fullName: newFullName,
          role: newRole,
          unitId: isUnitRole ? Number(newUnitId) : null,
          password: newPassword || undefined
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi tạo người dùng');
      setMessage({ type: 'success', text: d.message || 'Đã tạo tài khoản thành công!' });
      setShowCreateModal(false);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Open Edit Modal
  const openEdit = (u: UserItem) => {
    setEditingUser(u);
    setEditFullName(u.full_name);
    setEditRole(u.role);
    setEditUnitId(u.unit_id || '');
    setEditStatus(u.status);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const isUnitRole = ['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(editRole);
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          fullName: editFullName,
          role: editRole,
          unitId: isUnitRole ? Number(editUnitId) : null,
          status: editStatus
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi cập nhật');
      setMessage({ type: 'success', text: 'Cập nhật tài khoản thành công!' });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Toggle Lock/Unlock
  const handleToggleLock = async (u: UserItem) => {
    const nextStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMsg = nextStatus === 'INACTIVE'
      ? `Bạn có chắc chắn muốn KHÓA tài khoản "${u.username}"? Người dùng sẽ bị chấm dứt phiên đăng nhập ngay lập tức.`
      : `Bạn có muốn MỞ KHÓA tài khoản "${u.username}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, status: nextStatus })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi thao tác');
      setMessage({ type: 'success', text: `Đã ${nextStatus === 'INACTIVE' ? 'khóa' : 'mở khóa'} tài khoản ${u.username} thành công!` });
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Reset Password
  const handleResetPassword = async (u: UserItem) => {
    if (!confirm(`Bạn có chắc chắn muốn ĐẶT LẠI MẬT KHẨU cho tài khoản "${u.username}"? Hệ thống sẽ sinh mật khẩu tạm ngẫu nhiên và hủy mọi phiên làm việc cũ.`)) {
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Lỗi đặt lại mật khẩu');
      setTempPasswordResult({ username: u.username, tempPass: d.tempPassword });
      setCopied(false);
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#005F3E] flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#005F3E]" />
            Quản Lý Tài Khoản & Người Dùng Hệ Thống
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý tài khoản toàn mạng lưới, phân quyền truy cập, khóa/mở khóa và đặt lại mật khẩu tạm an toàn.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-[#005F3E] hover:bg-[#004d32] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm tài khoản mới</span>
          </button>
          <button
            onClick={fetchUsers}
            className="p-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg shadow-xs"
            title="Tải lại danh sách"
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

      {/* Bộ lọc và Tìm kiếm */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tìm kiếm</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Tên đăng nhập, họ tên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 pr-8 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Đơn vị</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả đơn vị ({units.length}) --</option>
              {units.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.unit_code} - {u.unit_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Vai trò</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả vai trò --</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (Trung tâm)</option>
              <option value="UNIT_ADMIN">UNIT_ADMIN (Đơn vị)</option>
              <option value="UNIT_PREPARER">UNIT_PREPARER (Người lập)</option>
              <option value="UNIT_APPROVER">UNIT_APPROVER (Người duyệt)</option>
              <option value="VIEWER">VIEWER (Chỉ xem)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#005F3E]"
            >
              <option value="ALL">-- Tất cả trạng thái --</option>
              <option value="ACTIVE">Hoạt động (ACTIVE)</option>
              <option value="INACTIVE">Bị khóa (INACTIVE)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng danh sách người dùng */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
          <h2 className="text-xs font-bold uppercase text-slate-700 tracking-wide">
            Danh sách tài khoản ({filteredUsers.length} / {users.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Đang tải danh sách người dùng...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Không tìm thấy tài khoản phù hợp với điều kiện lọc.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="p-3">#</th>
                  <th className="p-3">Tài khoản</th>
                  <th className="p-3">Họ và tên</th>
                  <th className="p-3">Vai trò</th>
                  <th className="p-3">Đơn vị trực thuộc</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3 text-center">Phiên</th>
                  <th className="p-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u, idx) => {
                  const isActive = u.status === 'ACTIVE';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-900">{u.username}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{u.full_name}</td>
                      <td className="p-3">
                        {u.role === 'SUPER_ADMIN' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Trung tâm
                          </span>
                        ) : u.role === 'UNIT_ADMIN' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Đơn vị (Toàn quyền)
                          </span>
                        ) : u.role === 'UNIT_PREPARER' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Người lập (Maker)
                          </span>
                        ) : u.role === 'UNIT_APPROVER' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                            Người duyệt (Checker)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Chỉ xem
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">
                        {u.unit_code ? (
                          <span>
                            <strong>{u.unit_code}</strong> - {u.unit_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Toàn hệ thống</span>
                        )}
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
                          {isActive ? 'Hoạt động' : 'Bị khóa'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-slate-400 text-[11px]">
                        v{u.token_version}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900"
                            title="Sửa thông tin"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 hover:bg-amber-50 rounded text-amber-700 hover:text-amber-800"
                            title="Đặt lại mật khẩu tạm"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleLock(u)}
                            className={`p-1.5 rounded transition-colors ${
                              isActive
                                ? 'hover:bg-rose-50 text-rose-700 hover:text-rose-800'
                                : 'hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800'
                            }`}
                            title={isActive ? 'Khóa tài khoản' : 'Mở khóa'}
                          >
                            {isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
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

      {/* Modal Thêm Người Dùng Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#005F3E]" />
                Thêm Tài Khoản Mới
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên đăng nhập <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: 1300_Admin"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.trim())}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Họ và tên cán bộ <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vai trò</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                >
                  <option value="UNIT_ADMIN">UNIT_ADMIN (Quản trị Đơn vị)</option>
                  <option value="UNIT_PREPARER">UNIT_PREPARER (Người lập - Maker)</option>
                  <option value="UNIT_APPROVER">UNIT_APPROVER (Người duyệt - Checker)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Quản trị Trung tâm)</option>
                  <option value="VIEWER">VIEWER (Xem báo cáo)</option>
                </select>
              </div>

              {['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(newRole) && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Gán Đơn vị trực thuộc <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={newUnitId}
                    onChange={(e) => setNewUnitId(Number(e.target.value))}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_code} - {u.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mật khẩu khởi tạo (để trống sẽ dùng mặc định)
                </label>
                <input
                  type="password"
                  placeholder="Mặc định: Unit@123456"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
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
                  {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sửa Người Dùng */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Edit className="w-4 h-4 text-[#005F3E]" />
                Sửa Thông Tin Tài Khoản: {editingUser.username}
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vai trò</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                >
                  <option value="UNIT_ADMIN">UNIT_ADMIN (Quản trị Đơn vị)</option>
                  <option value="UNIT_PREPARER">UNIT_PREPARER (Người lập - Maker)</option>
                  <option value="UNIT_APPROVER">UNIT_APPROVER (Người duyệt - Checker)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Quản trị Trung tâm)</option>
                  <option value="VIEWER">VIEWER (Xem báo cáo)</option>
                </select>
              </div>

              {['UNIT_ADMIN', 'UNIT_PREPARER', 'UNIT_APPROVER'].includes(editRole) && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Đơn vị trực thuộc</label>
                  <select
                    required
                    value={editUnitId}
                    onChange={(e) => setEditUnitId(Number(e.target.value))}
                    className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_code} - {u.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trạng thái</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-[#F4F6F8] border rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#005F3E]"
                >
                  <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                  <option value="INACTIVE">Khóa tài khoản (INACTIVE)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
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

      {/* Modal Hiển thị Mật khẩu tạm duy nhất một lần */}
      {tempPasswordResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4 border-2 border-emerald-500">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-[#005F3E] rounded-full flex items-center justify-center mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">Đặt Lại Mật Khẩu Thành Công</h3>
              <p className="text-xs text-slate-500">
                Mật khẩu tạm đã được tạo ngẫu nhiên cho tài khoản{' '}
                <strong className="text-slate-800">{tempPasswordResult.username}</strong>. Mật khẩu này chỉ hiển thị{' '}
                <span className="text-rose-600 font-bold">DUY NHẤT 1 LẦN</span>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
              <span className="font-mono font-black text-base text-slate-900 tracking-wider">
                {tempPasswordResult.tempPass}
              </span>
              <button
                onClick={() => copyToClipboard(tempPasswordResult.tempPass)}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-xs font-semibold text-slate-700 flex items-center gap-1 shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>

            <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Cán bộ bắt buộc phải đổi mật khẩu ở lần đăng nhập tiếp theo.
            </div>

            <button
              onClick={() => setTempPasswordResult(null)}
              className="w-full py-2 bg-[#005F3E] text-white rounded-lg text-xs font-bold hover:bg-[#004d32] shadow-xs"
            >
              Tôi đã lưu lại mật khẩu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
