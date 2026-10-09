'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCheck, Lock, AlertCircle, Building2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const u = customUser || username;
    const p = customPass || password;

    if (!u || !p) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đăng nhập không thành công.');
      }

      // Lưu user vào localStorage để tiện hiển thị client-side
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      if (data.user.role === 'SUPER_ADMIN') {
        router.push('/admin');
      } else {
        router.push('/unit');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <img
            src="/logo-agribank.png"
            alt="Agribank"
            className="h-12 w-auto object-contain max-w-[280px]"
          />
        </div>
        <h2 className="text-sm font-bold tracking-tight text-slate-700 uppercase">
          HỆ THỐNG THU THẬP DỮ LIỆU
        </h2>
        <p className="text-xs text-slate-500 mt-1">Cổng thu thập & đối chiếu kê khai điện tử B2B</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-md rounded-lg sm:px-10 border border-[#E2E8F0]">
          {error && (
            <div className="mb-5 bg-rose-50 border-l-4 border-[#A81D22] p-4 rounded-r-md flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#A81D22] shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-[#A81D22]">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tài khoản (user)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserCheck className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ví dụ: 1300_Admin, 3100_Admin, admin..."
                  className="block w-full pl-9 pr-3 py-2 bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-3 py-2 bg-[#F4F6F8] border border-[#E2E8F0] rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#005F3E] focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 rounded-lg shadow-sm text-xs font-bold text-white bg-[#005F3E] hover:bg-[#004d32] focus:outline-none focus:ring-2 focus:ring-[#005F3E] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Góc nhỏ bên phải hiển thị rõ ngày giờ bản update */}
      <div className="fixed bottom-3 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-xl shadow-xs text-slate-600 text-[11px] select-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
        <span className="font-semibold text-slate-700">Bản cập nhật:</span>
        <span className="font-mono text-[#005F3E] font-bold">09/10/2026 14:00</span>
      </div>
    </div>
  );
}
