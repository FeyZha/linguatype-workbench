import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LinguaType · 雅思表达支架',
  description:
    '为雅思作文中的中英混合句提供一次生成、按需揭示且非代写式的英文表达支架。',
  openGraph: {
    title: 'LinguaType · 雅思表达支架',
    description: '先写下意思，再解决表达。',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LinguaType · 雅思表达支架',
    description: '先写下意思，再解决表达。',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
