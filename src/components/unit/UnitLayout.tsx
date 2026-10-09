'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  History,
  ChevronDown,
  Menu,
  Search,
  User,
  KeyRound,
  LogOut,
  Info,
  Building2,
  Calendar,
  GraduationCap
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NotificationBell from '@/components/NotificationBell';

interface UnitLayoutProps {
  children: React.ReactNode;
}

export default function UnitLayout({ children }: UnitLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string; role: string; unit_name?: string; unit_code?: string; fullName?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function initUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        setUserProfile(data.user);
        if (data.user.mustChangePassword) {
          setShowPasswordModal(true);
        }
      } catch (err) {
        console.error(err);
      }
    }
    initUser();
  }, [router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('auth_user');
    router.push('/login');
  };

  // Get active query param tab
  const [activeTabParam, setActiveTabParam] = useState('TASKS');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (pathname.startsWith('/unit/training-demand')) {
        setActiveTabParam('TRAINING_DEMAND');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'TASKS';
      setActiveTabParam(tab);
    }
  }, [pathname]);

  const navItems = [
    {
      id: 'TASKS',
      title: 'Việc cần làm',
      href: '/unit?tab=TASKS',
      icon: Home,
    },
    {
      id: 'CANDIDATES',
      title: 'Danh sách thi nghiệp vụ',
      href: '/unit?tab=CANDIDATES',
      icon: FileCheck2,
    },
    {
      id: 'TRAINING_DEMAND',
      title: 'Khảo sát nhu cầu đào tạo',
      href: '/unit/training-demand',
      icon: GraduationCap,
    },
    {
      id: 'HISTORY',
      title: 'Lịch sử gửi file',
      href: '/unit?tab=HISTORY',
      icon: History,
    },
    {
      id: 'NETWORK',
      title: 'Tổng quan mạng lưới',
      href: '/unit?tab=NETWORK',
      icon: Building2,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col font-sans text-slate-800">
      <div className="flex flex-1 min-h-screen">
        {/* ================= LEFT SIDEBAR (Dark Agribank Green #005F3E) ================= */}
        <aside
          className={`bg-[#005F3E] text-white flex flex-col transition-all duration-300 ease-in-out z-30 sticky top-0 h-screen select-none ${
            collapsed ? 'w-20' : 'w-64'
          }`}
        >
          {/* Top Brand Logo */}
          <div className={`pt-5 pb-4 flex flex-col justify-center ${collapsed ? 'px-3 items-center' : 'px-4'}`}>
            {collapsed ? (
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center p-1" title="Agribank - Hệ Thống Thu Thập Dữ Liệu">
                <img
                  src="/icon-agribank.png"
                  alt="Agribank"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl px-3 py-2 shadow-sm flex items-center justify-center">
                  <img
                    src="/logo-agribank.png"
                    alt="Agribank"
                    className="h-7 w-auto object-contain max-w-full"
                  />
                </div>
                <p className="text-[10px] tracking-wider font-bold text-emerald-100 uppercase mt-2 text-center">
                  HỆ THỐNG THU THẬP DỮ LIỆU
                </p>
              </>
            )}
          </div>

          {/* Unit Name Info Badge in Sidebar */}
          {!collapsed && userProfile && (
            <div className="mx-3 mb-2 px-3 py-2 bg-black/20 rounded-xl border border-emerald-500/20 text-xs">
              <div className="font-bold text-amber-300 truncate">
                {userProfile.unit_name || 'Chi nhánh Agribank'}
              </div>
              <div className="text-[11px] text-emerald-200/80 font-mono mt-0.5">
                Mã ĐV: {userProfile.unit_code || userProfile.username}
              </div>
            </div>
          )}

          {/* Nav Items */}
          <nav className="flex-1 py-3 px-3 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = 
                (item.id === 'TRAINING_DEMAND' && pathname.startsWith('/unit/training-demand')) ||
                (item.id === 'TASKS' && !pathname.startsWith('/unit/training-demand') && (activeTabParam === 'TASKS' || !activeTabParam || activeTabParam === 'OVERVIEW')) ||
                (item.id === 'CANDIDATES' && !pathname.startsWith('/unit/training-demand') && (activeTabParam === 'CANDIDATES' || activeTabParam === 'ERRORS' || activeTabParam === 'UPLOAD' || activeTabParam === 'RECORDS')) ||
                (item.id === 'HISTORY' && !pathname.startsWith('/unit/training-demand') && activeTabParam === 'HISTORY') ||
                (item.id === 'NETWORK' && !pathname.startsWith('/unit/training-demand') && activeTabParam === 'NETWORK');
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setActiveTabParam(item.id)}
                  title={collapsed ? item.title : undefined}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] transition-all group ${
                    isActive
                      ? 'bg-black/25 text-white font-semibold border-l-4 border-amber-400 shadow-inner'
                      : 'text-emerald-100/90 font-medium hover:bg-black/15 hover:text-white'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? 'text-amber-300 scale-105' : 'text-emerald-200/80 group-hover:text-amber-300'}`} />
                  {!collapsed && (
                    <span className="flex-1 truncate text-left">{item.title}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* ================= MAIN RIGHT WRAPPER ================= */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* TOP HEADER */}
          <header className="h-16 bg-white border-b border-slate-200 shadow-xs px-6 flex items-center justify-between sticky top-0 z-20">
            {/* Left Header */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                HỆ THỐNG THU THẬP DỮ LIỆU
              </h1>
            </div>

            {/* Right Header */}
            <div className="flex items-center gap-6">
              <div className="relative w-56 sm:w-64 hidden md:block">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#005F3E] focus:bg-white"
                />
              </div>

              {/* Chuông thông báo */}
              <NotificationBell />

              {/* User Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  title="Menu tài khoản & Cài đặt"
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-full border transition-all cursor-pointer focus:outline-none ${
                    userDropdownOpen
                      ? 'bg-emerald-50/80 border-emerald-500/40 shadow-xs'
                      : 'border-slate-200 hover:border-emerald-500/30 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#005F3E] to-emerald-700 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-600/30 overflow-hidden shadow-xs shrink-0">
                    <span className="font-semibold text-xs">
                      {userProfile?.unit_code ? userProfile.unit_code.slice(0, 2).toUpperCase() : 'CN'}
                    </span>
                  </div>
                  <div className="hidden sm:flex flex-col text-left leading-tight pr-0.5">
                    <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                      {userProfile?.unit_name || userProfile?.fullName || userProfile?.username || 'Đơn vị'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono font-medium">
                      {userProfile?.username || 'Unit'}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180 text-[#005F3E]' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100">
                    {/* User Header Info */}
                    <div className="px-4 py-2.5">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {userProfile?.unit_name || userProfile?.fullName || userProfile?.username}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Tài khoản: <strong className="text-slate-700">{userProfile?.username}</strong>
                      </p>
                      <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                        {userProfile?.role === 'UNIT_ADMIN' ? 'Quản trị Đơn vị' :
                         userProfile?.role === 'UNIT_PREPARER' ? 'Người lập biểu' :
                         userProfile?.role === 'UNIT_APPROVER' ? 'Người duyệt biểu' :
                         userProfile?.role || 'Đơn vị'}
                      </div>
                    </div>

                    {/* Menu Actions */}
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          setShowPasswordModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-emerald-50/80 hover:text-[#005F3E] transition-colors text-left group cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-[#005F3E] flex items-center justify-center shrink-0 group-hover:bg-[#005F3E] group-hover:text-white transition-colors">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold block">Đổi mật khẩu</span>
                          <span className="text-[10px] text-slate-400 group-hover:text-emerald-700/80 block">Thay đổi mật khẩu đăng nhập</span>
                        </div>
                      </button>
                    </div>

                    {/* Logout */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-rose-50 hover:text-[#A81D22] transition-colors text-left group cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                          <LogOut className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        username={userProfile?.username || ''}
        forceChange={Boolean((userProfile as any)?.mustChangePassword)}
      />
    </div>
  );
}
