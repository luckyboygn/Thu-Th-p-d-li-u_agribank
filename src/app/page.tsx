'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const lastActiveStr = localStorage.getItem('agribank_last_active');
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 phút

    // Nếu không có mốc hoạt động gần đây hoặc đã quá 15 phút kể từ lần tương tác cuối:
    // Hủy bỏ phiên cũ ngay lập tức, chuyển về màn hình đăng nhập, tuyệt đối không tự động vào tài khoản cache
    if (!lastActiveStr || now - parseInt(lastActiveStr, 10) > INACTIVITY_TIMEOUT) {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('agribank_last_active');
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      router.push('/login');
      return;
    }

    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then((data) => {
        if (data.authenticated && data.user) {
          localStorage.setItem('agribank_last_active', String(Date.now()));
          if (data.user.role === 'SUPER_ADMIN' || data.user.role === 'VIEWER') {
            router.push('/admin');
          } else {
            router.push('/unit');
          }
        } else {
          localStorage.removeItem('auth_user');
          localStorage.removeItem('agribank_last_active');
          router.push('/login');
        }
      })
      .catch(() => {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('agribank_last_active');
        router.push('/login');
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-300 text-sm">Đang tải hệ thống đối chiếu...</p>
      </div>
    </div>
  );
}
