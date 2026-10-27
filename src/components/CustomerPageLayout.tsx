import type { ReactNode } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';

export default function CustomerPageLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background text-foreground"><LandingNavbar /><div className="flex-1">{children}</div><Footer /></div>;
}