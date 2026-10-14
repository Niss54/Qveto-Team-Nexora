import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qveto - Project Management & Collaboration',
  description: 'Multi-organization project management and team collaboration platform by Team Nexora',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
