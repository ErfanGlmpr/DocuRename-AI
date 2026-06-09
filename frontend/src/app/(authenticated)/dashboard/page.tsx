'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Document } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const { data: documents, isLoading, error } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => apiClient('/documents'),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !documents) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-md">
        Failed to load dashboard data.
      </div>
    );
  }

  const total = documents.length;
  const completed = documents.filter((d) => d.status === 'COMPLETED').length;
  const failed = documents.filter((d) => d.status === 'FAILED').length;
  const processing = documents.filter((d) =>
    ['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(d.status)
  ).length;

  const recentUploads = documents.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 mt-2">Overview of your document processing operations.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processing}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{failed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {recentUploads.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-4">
              {recentUploads.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 last:border-0 pb-4 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {doc.finalName || doc.originalName}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="text-sm">
                    {doc.status === 'COMPLETED' && <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full text-xs font-medium">Completed</span>}
                    {doc.status === 'FAILED' && <span className="text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full text-xs font-medium">Failed</span>}
                    {doc.status === 'NEEDS_REVIEW' && <span className="text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-full text-xs font-medium">Needs Review</span>}
                    {['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(doc.status) && (
                      <span className="text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Processing
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
