'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getToken } from '@/lib/auth';
import type { Document } from '@/lib/types';
import { UploadZone } from '@/components/upload-zone';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, XCircle } from 'lucide-react';

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return 'default';
    case 'FAILED':
      return 'destructive';
    case 'NEEDS_REVIEW':
      return 'secondary';
    default:
      return 'outline';
  }
};

const getStatusText = (status: string) => {
  if (['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(status)) {
    return 'Processing';
  }
  return status.replace('_', ' ');
};

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const token = getToken();

  // 1. Initial Fetch
  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => apiClient('/documents'),
  });

  // 2. Setup SSE for live updates
  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

    fetchEventSource(`${baseUrl}/documents/events`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      onmessage() {
        // Any incoming SSE message means document state changed, so we refetch the list
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      },
      onerror() {
        // Ignore and let it silently retry
      }
    }).catch((err) => {
      if (err.name === 'AbortError') {
        // Expected when component unmounts
        return;
      }
      console.error('SSE Error:', err);
    });

    return () => {
      controller.abort();
    };
  }, [token, queryClient]);

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiClient(`/documents/${id}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient(`/documents/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <p className="text-zinc-500 mt-2">Upload and manage your PDFs.</p>
      </div>

      <UploadZone />

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Generated Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-500" />
                </TableCell>
              </TableRow>
            ) : !documents || documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-zinc-500">
                  No documents found. Upload a PDF above to get started!
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => {
                const isProcessing = ['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(doc.status);
                
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={doc.originalName}>
                      <Link href={`/documents/${doc.id}`} className="hover:underline text-primary">
                        {doc.originalName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={doc.finalName || '-'}>
                      {doc.finalName || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(doc.status)} className="flex w-max items-center gap-1">
                        {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                        {getStatusText(doc.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{doc.category || '-'}</TableCell>
                    <TableCell>
                      {doc.confidence ? `${(doc.confidence * 100).toFixed(0)}%` : '-'}
                    </TableCell>
                    <TableCell className="text-zinc-500 whitespace-nowrap text-sm">
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {doc.status === 'FAILED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryMutation.mutate(doc.id)}
                            disabled={retryMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" /> Retry
                          </Button>
                        )}
                        <Link href={`/documents/${doc.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                          View
                        </Link>
                        {isProcessing && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelMutation.mutate(doc.id)}
                            disabled={cancelMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Cancel
                          </Button>
                        )}
                        {/* We'll add detail view link in Ticket 6.3 */}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
