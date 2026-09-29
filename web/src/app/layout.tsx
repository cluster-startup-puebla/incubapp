import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { TenantTheme } from '@/theme/tenant-theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Incubapp',
  description: 'Incubapp',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body className="bg-background text-foreground antialiased">
        <TenantTheme slug={null}>
          <Navbar />
          <main>{children}</main>
        </TenantTheme>
      </body>
    </html>
  );
}
