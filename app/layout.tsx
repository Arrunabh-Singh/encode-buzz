import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Backdrop } from '@/components/Backdrop';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'Qurious',
  description: 'Live buzzer quiz — who answers first, wins.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Backdrop />
        {children}
      </body>
    </html>
  );
}
