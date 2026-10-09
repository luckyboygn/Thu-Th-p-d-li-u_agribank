import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hệ Thống Thu Thập Dữ Liệu',
  description: 'Hệ thống tự động thu thập và đối chiếu hai chiều danh sách cán bộ',
  icons: {
    icon: '/icon-agribank.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
