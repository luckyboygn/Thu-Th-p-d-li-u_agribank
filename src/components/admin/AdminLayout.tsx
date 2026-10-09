'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  Database,
  FileText,
  Settings,
  ChevronDown,
  Menu,
  Search,
  User,
  KeyRound,
  LogOut,
  Info,
  LayoutGrid,
  GraduationCap,
  Eye,
  Users,
  Building2,
  HardDrive,
  UserPlus
} from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NotificationBell from '@/components/NotificationBell';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [userProfile, setUserProfile] = useState<{ username: string; role: string; fullName?: string } | null>(null);
  const [masterDbCount, setMasterDbCount] = useState<number>(244);
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
        if (data.user.role !== 'SUPER_ADMIN' && data.user.role !== 'VIEWER') {
          router.push('/unit');
          return;
        }
        setUserProfile(data.user);
        if (data.user.mustChangePassword) {
          setShowPasswordModal(true);
        }

        // Fetch master employees count
        const dbRes = await fetch('/api/master-employees?limit=1');
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          if (dbData.total) setMasterDbCount(dbData.total);
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

  const navItems = [
    {
      title: 'Tổng quan',
      href: '/admin',
      icon: Home,
      exact: true,
      hasChevron: false,
    },
    {
      title: 'Quản lý đợt thu thập',
      href: '/admin/exams',
      icon: Calendar,
      exact: false,
      hasChevron: true,
    },
    {
      title: 'Quản lý biểu mẫu (Forms)',
      href: '/admin/forms',
      icon: LayoutGrid,
      exact: false,
      hasChevron: true,
    },
    {
      title: 'Khảo sát nhu cầu đào tạo',
      href: '/admin/training-demand',
      icon: GraduationCap,
      exact: false,
      hasChevron: true,
    },
    {
      title: 'Quản lý tài khoản',
      href: '/admin/users',
      icon: Users,
      exact: false,
      hasChevron: false,
    },
    {
      title: 'Quản lý đơn vị',
      href: '/admin/units',
      icon: Building2,
      exact: false,
      hasChevron: false,
    },
    {
      title: 'CSDL Trung tâm',
      href: '/admin/master-db',
      icon: Database,
      badge: masterDbCount ? String(masterDbCount) : '244',
      exact: false,
      hasChevron: false,
    },
    {
      title: 'Đề nghị bổ sung CB',
      href: '/admin/employee-requests',
      icon: UserPlus,
      exact: false,
      hasChevron: false,
    },
    {
      title: 'Audit Logs',
      href: '/admin/audit-log',
      icon: FileText,
      exact: false,
      hasChevron: false,
    },
    {
      title: 'Sao lưu CSDL',
      href: '/admin/backup',
      icon: HardDrive,
      exact: false,
      hasChevron: false,
    },
    {
      title: 'Cài đặt',
      href: '#',
      icon: Settings,
      exact: false,
      hasChevron: true,
    },
  ];

  const isItemActive = (item: typeof navItems[0]) => {
    if (item.exact) return pathname === item.href;
    if (item.href === '#') return false;
    return pathname.startsWith(item.href);
  };

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

          {/* Navigation Menu */}
          <nav className="flex-1 py-4 px-3 space-y-2 overflow-y-auto">
            {navItems.map((item) => {
              const active = isItemActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  title={collapsed ? item.title : undefined}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] font-medium transition-all group relative ${
                    active
                      ? 'bg-black/25 text-white shadow-inner font-semibold border-l-4 border-amber-400'
                      : 'text-emerald-100/90 hover:bg-black/15 hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-transform ${
                      active ? 'text-amber-300' : 'text-emerald-200/80 group-hover:text-white'
                    }`}
                  />
                  {!collapsed && (
                    <span className="flex-1 truncate text-left">{item.title}</span>
                  )}

                  {!collapsed && item.badge && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#A81D22] text-white shadow-sm">
                      {item.badge}
                    </span>
                  )}

                  {!collapsed && item.hasChevron && (
                    <ChevronDown className="w-4 h-4 text-emerald-300/70" />
                  )}

                  {collapsed && item.badge && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#A81D22] absolute top-2 right-2 ring-2 ring-[#005F3E]" />
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
            {/* Left: Hamburger + Title "HỆ THỐNG THU THẬP DỮ LIỆU" */}
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

            {/* Right: Search Box + User Profile with Dropdown */}
            <div className="flex items-center gap-6">
              {/* Search Pill Input */}
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

              {/* Chuông Thông Báo */}
              <NotificationBell />

              {/* User Profile Pill with Avatar & Name */}
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
                  {/* Photo Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-600/30 overflow-hidden shadow-xs shrink-0">
                    <span className="font-semibold text-xs">
                      {userProfile?.fullName ? userProfile.fullName.slice(0, 2).toUpperCase() : userProfile?.username ? userProfile.username.slice(0, 2).toUpperCase() : 'AD'}
                    </span>
                  </div>
                  <div className="hidden sm:flex flex-col text-left leading-tight pr-0.5">
                    <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                      {userProfile?.fullName || userProfile?.username || 'Admin'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {userProfile?.role === 'SUPER_ADMIN' ? 'Super Admin' : userProfile?.role === 'VIEWER' ? 'Viewer' : userProfile?.role}
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
                        {userProfile?.fullName || userProfile?.username}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Tài khoản: <strong className="text-slate-700">{userProfile?.username}</strong>
                      </p>
                      <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                        {userProfile?.role === 'SUPER_ADMIN' ? 'Quản trị Cấp cao' :
                         userProfile?.role === 'VIEWER' ? 'Người xem (Chỉ đọc)' :
                         userProfile?.role}
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

          {/* VIEWER NOTICE BANNER */}
          {userProfile?.role === 'VIEWER' && (
            <div className="bg-amber-400 text-slate-950 px-6 py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-b border-amber-500 shadow-xs">
              <Eye className="w-4 h-4 shrink-0 text-slate-950" />
              <span>CHẾ ĐỘ CHỈ XEM (VIEWER) — Bạn đang đăng nhập với quyền Người xem. Toàn bộ các chức năng thêm, sửa, xóa dữ liệu đã được vô hiệu hóa.</span>
            </div>
          )}

          {/* PAGE CONTENT */}
          <main className="flex-1 p-6 md:p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        username={userProfile?.username || 'admin'}
        forceChange={Boolean((userProfile as any)?.mustChangePassword)}
      />
    </div>
  );
}
