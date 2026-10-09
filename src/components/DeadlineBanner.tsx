'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Lock, Calendar } from 'lucide-react';

interface DeadlineBannerProps {
  title?: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string;
  isExtended?: boolean;
  extensionReason?: string;
}

export default function DeadlineBanner({
  title = 'Đợt thu thập',
  startAt,
  endAt,
  status = 'OPEN',
  isExtended = false,
  extensionReason
}: DeadlineBannerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
    isBeforeStart: boolean;
    totalMsRemaining: number;
  } | null>(null);

  useEffect(() => {
    function calculateTime() {
      const now = new Date().getTime();

      // Kiểm tra xem đã đến giờ mở chưa
      if (startAt) {
        const startTime = new Date(startAt).getTime();
        if (now < startTime) {
          const diffStart = startTime - now;
          setTimeLeft({
            days: Math.floor(diffStart / (1000 * 60 * 60 * 24)),
            hours: Math.floor((diffStart % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((diffStart % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((diffStart % (1000 * 60)) / 1000),
            isPast: false,
            isBeforeStart: true,
            totalMsRemaining: diffStart
          });
          return;
        }
      }

      // Kiểm tra hạn chót kết thúc
      if (endAt) {
        const endTime = new Date(endAt).getTime();
        const diff = endTime - now;

        if (diff <= 0) {
          setTimeLeft({
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            isPast: true,
            isBeforeStart: false,
            totalMsRemaining: 0
          });
        } else {
          setTimeLeft({
            days: Math.floor(diff / (1000 * 60 * 60 * 24)),
            hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((diff % (1000 * 60)) / 1000),
            isPast: false,
            isBeforeStart: false,
            totalMsRemaining: diff
          });
        }
      } else {
        setTimeLeft(null);
      }
    }

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [startAt, endAt]);

  if (status !== 'OPEN') {
    return (
      <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 text-xs text-slate-700 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500" />
          <span className="font-semibold">{title}: Đợt hiện đang đóng (CLOSED). Không nhận thêm bài nộp mới.</span>
        </div>
      </div>
    );
  }

  if (!timeLeft) {
    return null;
  }

  // Trường hợp chưa tới giờ bắt đầu
  if (timeLeft.isBeforeStart) {
    return (
      <div className="bg-sky-50 border border-sky-300 rounded-xl p-3.5 text-xs text-sky-900 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-700 shrink-0" />
          <span>
            <strong className="font-bold">{title}:</strong> Chưa đến thời gian mở tiếp nhận. Bắt đầu sau{' '}
            <span className="font-mono font-bold text-sky-950">
              {timeLeft.days} ngày {timeLeft.hours} giờ {timeLeft.minutes} phút {timeLeft.seconds} giây
            </span>
            {startAt && (
              <span className="text-sky-700 ml-1">
                (Thời gian mở: {new Date(startAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})
              </span>
            )}
          </span>
        </div>
      </div>
    );
  }

  // Trường hợp đã quá hạn chót
  if (timeLeft.isPast) {
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 text-xs text-rose-900 flex items-center justify-between shadow-xs animate-pulse">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#A81D22] shrink-0" />
          <span>
            <strong className="font-bold">{title}:</strong>{' '}
            <span className="text-[#A81D22] font-black uppercase tracking-wide">Đã hết hạn tiếp nhận dữ liệu!</span>{' '}
            Các thao tác tải lên, chỉnh sửa và gửi bài đã bị khóa.
            {endAt && (
              <span className="text-rose-700 ml-1">
                (Hạn chót: {new Date(endAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})
              </span>
            )}
          </span>
        </div>
        {isExtended && (
          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-300 shrink-0 ml-2">
            Đã hết hạn gia hạn riêng
          </span>
        )}
      </div>
    );
  }

  // Còn dưới 3 ngày (đổi màu vàng cam / đỏ đô cảnh báo gấp)
  const isUrgent = timeLeft.days < 3;

  return (
    <div
      className={`rounded-xl p-3.5 text-xs border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
        isUrgent
          ? 'bg-amber-50 border-amber-300 text-amber-950 ring-1 ring-amber-400/30'
          : 'bg-emerald-50/70 border-emerald-300/80 text-emerald-950'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Clock className={`w-4 h-4 shrink-0 ${isUrgent ? 'text-amber-700 animate-bounce' : 'text-emerald-700'}`} />
        <div>
          <span>
            <strong className="font-bold">{title}:</strong> Thời gian tiếp nhận còn lại:{' '}
            <span className={`font-mono font-black text-sm ${isUrgent ? 'text-[#A81D22]' : 'text-[#005F3E]'}`}>
              {timeLeft.days > 0 && `${timeLeft.days} ngày `}
              {timeLeft.hours} giờ {timeLeft.minutes} phút {timeLeft.seconds} giây
            </span>
          </span>
          {endAt && (
            <span className="text-slate-500 text-[11px] block sm:inline sm:ml-2">
              (Hạn chót:{' '}
              <strong className="text-slate-700 font-semibold">
                {new Date(endAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </strong>
              )
            </span>
          )}
        </div>
      </div>

      {isExtended && (
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white/80 px-2.5 py-1 rounded-lg border border-amber-300 text-[11px] text-amber-900 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            <strong>Được gia hạn riêng:</strong> {extensionReason || 'Theo phê duyệt của Quản trị viên'}
          </span>
        </div>
      )}
    </div>
  );
}
