import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Qveto - Project Management & Team Collaboration',
  description:
    'Multi-organization project management and team collaboration SaaS by Team Nexora. Secure tenant isolation and RBAC.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-50 text-gray-900 selection:bg-primary-500 selection:text-white">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <AppShell>{children}</AppShell>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
