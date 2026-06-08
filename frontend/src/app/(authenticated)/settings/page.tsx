'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/lib/types';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    apiClient<User>('/auth/me')
      .then(setUser)
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your personal account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="font-medium text-zinc-500">Name</div>
            <div className="col-span-2">{user.name || 'Not provided'}</div>
          </div>
          <div className="grid grid-cols-3 gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="font-medium text-zinc-500">Email</div>
            <div className="col-span-2">{user.email}</div>
          </div>
          <div className="grid grid-cols-3 gap-4 pb-2">
            <div className="font-medium text-zinc-500">User ID</div>
            <div className="col-span-2 text-sm font-mono break-all">{user.id}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your current workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="font-medium text-zinc-500">Organization ID</div>
            <div className="col-span-2 text-sm font-mono break-all">{user.organizationId}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
