import type { Metadata } from 'next';
import { Archivo, Archivo_Narrow } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['400', '700', '800'],
});

const archivoNarrow = Archivo_Narrow({
  variable: '--font-archivo-narrow',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const metadata: Metadata = {
  title: 'Slack',
  description: 'NestJS microservices + Next.js frontend',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${archivo.variable} ${archivoNarrow.variable}`}><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
