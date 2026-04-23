import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/providers/AuthProvider';
import RemoveServiceWorker from '@/components/RemoveServiceWorker';
import { ibmPlexSansThai, inter } from './fonts';

export const metadata: Metadata = {
  title: "PS Rice — ระบบจัดการงานพนักงาน",
  description: "ระบบจัดการงานพนักงาน ลงเวลาเข้าออกงาน และส่งหลักฐานการทำงาน",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: '#064e3b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${ibmPlexSansThai.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <RemoveServiceWorker />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
