'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  UserPlus,
  Info,
  X
} from 'lucide-react';

interface NotificationItem {
  id: number;
  title: string;
  content: string;
  type: string;
  link: string | null;
  is_read: number | boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Polling định kỳ mỗi 45s
    const interval = setInterval(() => {
      fetchNotifications();
    }, 45000);

    return () => clearInterval(interval);
  }, []);

  // Xử lý đóng dropdown khi bấm ra ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: number, link?: string | null) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (link) {
        window.location.href = link;
      }
    } catch (err) {
      console.error('Error marking read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'DEADLINE_WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
      case 'SUBMISSION_REOPENED':
        return <RotateCcw className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />;
      case 'REQUEST_STATUS_UPDATED':
        return <UserCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
      case 'NEW_EMPLOYEE_REQUEST':
        return <UserPlus className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none"
        title="Thông báo"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-extrabold text-white bg-rose-600 rounded-full ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden text-xs">
          {/* Header */}
          <div className="px-4 py-3 bg-[#005F3E] text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-300" />
              <span className="font-bold text-xs">Thông Báo Hệ Thống</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-700 text-emerald-100 text-[10px] font-bold rounded-full">
                  {unreadCount} mới
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-emerald-200 hover:text-white flex items-center gap-1 font-medium transition-colors"
                title="Đánh dấu tất cả là đã đọc"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Đã đọc hết
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>Bạn không có thông báo nào.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isRead = Number(n.is_read) === 1;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleMarkAsRead(n.id, n.link)}
                    className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex gap-2.5 ${
                      !isRead ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    {getIcon(n.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className={`text-xs ${!isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                          {n.title}
                        </h4>
                        {!isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#005F3E] shrink-0 mt-1"></span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {n.content}
                      </p>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(n.created_at).toLocaleString('vi-VN')}
                        </span>
                        {n.link && (
                          <span className="text-[#005F3E] hover:underline flex items-center gap-0.5">
                            Chi tiết <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400">
              Hệ thống thông báo tự động Agribank
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
