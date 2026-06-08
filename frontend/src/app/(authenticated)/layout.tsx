'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { getToken, clearToken } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      if (!getToken()) {
        router.replace('/login');
        return;
      }
      try {
        const data = await apiClient<User>('/auth/me');
        setUser(data);
      } catch {
        clearToken();
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  useEffect(() => {
    const handleUnauthorized = () => {
      router.replace('/login');
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors on logout, just clear token
    }
    clearToken();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">DocuRename AI</h1>
            <nav className="hidden md:flex gap-4">
              <Link href="/dashboard" className={`text-sm font-medium transition-colors hover:text-black dark:hover:text-white ${pathname === '/dashboard' ? 'text-black dark:text-white font-semibold' : 'text-zinc-500'}`}>
                Dashboard
              </Link>
              <Link href="/settings" className={`text-sm font-medium transition-colors hover:text-black dark:hover:text-white ${pathname === '/settings' ? 'text-black dark:text-white font-semibold' : 'text-zinc-500'}`}>
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 hidden md:inline-block">{user.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
