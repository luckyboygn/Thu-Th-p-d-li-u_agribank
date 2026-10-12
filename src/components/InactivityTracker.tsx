'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 phút = 900,000 ms
const WARNING_THRESHOLD_MS = 60 * 1000; // Cảnh báo trước 60 giây cuối cùng
const THROTTLE_UPDATE_MS = 3000; // Giới hạn tần suất ghi localStorage 3s/lần
const SERVER_PING_INTERVAL_MS = 4 * 60 * 1000; // Gia hạn server cookie mỗi 4 phút khi đang có thao tác

export default function InactivityTracker() {
  const pathname = usePathname();
  const router = useRouter();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const lastActivityRef = useRef<number>(Date.now());
  const lastWriteStorageRef = useRef<number>(0);
  const lastServerPingRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);

  // Không kích hoạt bộ đếm nếu đang ở trang đăng nhập
  const isLoginPage = pathname === '/login';

  const performLogout = useCallback(async (reason = 'timeout') => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('agribank_last_active');
        window.location.href = `/login?reason=${reason}`;
      }
    }
  }, []);

  const refreshActivity = useCallback(() => {
    if (isLoginPage) return;
    const now = Date.now();
    lastActivityRef.current = now;

    // Throttle ghi localStorage để tránh quá tải
    if (now - lastWriteStorageRef.current > THROTTLE_UPDATE_MS) {
      lastWriteStorageRef.current = now;
      try {
        localStorage.setItem('agribank_last_active', String(now));
      } catch (e) {}
    }

    if (showWarning) {
      setShowWarning(false);
    }

    // Gia hạn trượt trên server định kỳ mỗi 4 phút khi có thao tác
    if (now - lastServerPingRef.current > SERVER_PING_INTERVAL_MS) {
      lastServerPingRef.current = now;
      fetch('/api/auth/me').catch(() => {});
    }
  }, [isLoginPage, showWarning]);

  // Khởi tạo và lắng nghe các sự kiện thao tác người dùng
  useEffect(() => {
    if (isLoginPage) {
      setShowWarning(false);
      return;
    }

    // Đọc thời gian hoạt động cuối cùng từ localStorage
    const savedLast = localStorage.getItem('agribank_last_active');
    const now = Date.now();
    if (savedLast) {
      const parsed = parseInt(savedLast, 10);
      if (!isNaN(parsed) && now - parsed < INACTIVITY_TIMEOUT_MS) {
        lastActivityRef.current = parsed;
      } else {
        // Đã quá 15 phút kể từ lần tương tác trước đó
        performLogout('timeout');
        return;
      }
    } else {
      // Khởi tạo mốc hoạt động mới
      localStorage.setItem('agribank_last_active', String(now));
      lastActivityRef.current = now;
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleUserInteraction = () => {
      refreshActivity();
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // Lắng nghe thay đổi giữa các tab trình duyệt
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agribank_last_active' && e.newValue) {
        const remoteTime = parseInt(e.newValue, 10);
        if (!isNaN(remoteTime)) {
          lastActivityRef.current = remoteTime;
          if (showWarning) setShowWarning(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Khi người dùng chuyển tab quay lại (hoặc bật lại màn hình)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentTime = Date.now();
        const storedLast = localStorage.getItem('agribank_last_active');
        const effectiveLast = storedLast ? parseInt(storedLast, 10) : lastActivityRef.current;
        if (currentTime - effectiveLast >= INACTIVITY_TIMEOUT_MS) {
          performLogout('timeout');
        } else {
          refreshActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Đồng hồ kiểm tra định kỳ mỗi giây
    const checkInterval = setInterval(() => {
      const currentTime = Date.now();
      const storedLast = localStorage.getItem('agribank_last_active');
      const effectiveLast = storedLast ? parseInt(storedLast, 10) : lastActivityRef.current;
      const elapsed = currentTime - effectiveLast;
      const remainingMs = INACTIVITY_TIMEOUT_MS - elapsed;

      // Phát event để Topbar có thể đọc thời gian còn lại nếu cần
      window.dispatchEvent(
        new CustomEvent('agribank_session_tick', {
          detail: { remainingMs: Math.max(0, remainingMs) }
        })
      );

      if (remainingMs <= 0) {
        performLogout('timeout');
      } else if (remainingMs <= WARNING_THRESHOLD_MS) {
        setSecondsRemaining(Math.max(1, Math.ceil(remainingMs / 1000)));
        setShowWarning(true);
      } else {
        if (showWarning) setShowWarning(false);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(checkInterval);
    };
  }, [isLoginPage, refreshActivity, performLogout, showWarning]);

  if (isLoginPage || !showWarning) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-300 transform scale-100 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-inner">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                CẢNH BÁO BẢO MẬT
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-2">
              Phiên làm việc sắp kết thúc
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Bạn đã không có thao tác nào trong hơn 14 phút. Để đảm bảo an toàn theo quy định, hệ thống Agribank sẽ tự động đăng xuất sau:
            </p>

            {/* Countdown Badge */}
            <div className="mt-4 p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-center gap-2 text-amber-900">
              <span className="text-xs font-semibold">Tự động đăng xuất sau:</span>
              <span className="text-2xl font-black font-mono text-rose-600 tabular-nums">
                {secondsRemaining}s
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => performLogout('manual')}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Đăng xuất ngay
          </button>
          <button
            type="button"
            onClick={refreshActivity}
            className="px-5 py-2.5 bg-[#005F3E] hover:bg-[#004d32] text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
          >
            <span>Tiếp tục làm việc</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
