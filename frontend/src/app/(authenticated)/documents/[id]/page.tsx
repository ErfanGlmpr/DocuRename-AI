'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getToken, setToken, clearToken } from '@/lib/auth';
import { Document } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, CheckCircle2, Clock, ShieldCheck, ShieldAlert, XCircle, Download, Loader2, RefreshCw, X } from 'lucide-react';

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'COMPLETED': return 'default';
    case 'FAILED': return 'destructive';
    case 'NEEDS_REVIEW': return 'secondary';
    default: return 'outline';
  }
};

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;

  const { data: doc, isLoading, error } = useQuery<Document>({
    queryKey: ['document', documentId],
    queryFn: () => apiClient(`/documents/${documentId}`),
    // Polling fallback
    refetchInterval: (query) => {
      const currentDoc = query.state.data;
      const isProcessing = currentDoc && ['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(currentDoc.status);
      return isProcessing ? 5000 : false;
    },
  });

  const [isDownloading, setIsDownloading] = React.useState(false);
  const queryClient = useQueryClient();
  const token = getToken();

  // Setup SSE for live updates for this document
  useEffect(() => {
    if (!token || !documentId) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    let isMounted = true;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const fetchSSE = async () => {
      let retryCount = 0;
      while (isMounted) {
        try {
          const currentToken = getToken();
          if (!currentToken) break;

          const response = await fetch(`${baseUrl}/documents/${documentId}/events`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${currentToken}`,
              Accept: 'text/event-stream',
            },
          });

          if (!response.ok || !response.body) {
            if (response.status === 401) {
              try {
                const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
                  method: 'POST',
                  credentials: 'include',
                });
                if (!refreshRes.ok) throw new Error('Refresh failed');
                const data = await refreshRes.json();
                setToken(data.accessToken);
                continue;
              } catch {
                clearToken();
                window.dispatchEvent(new Event('auth-unauthorized'));
                break;
              }
            }
             // Wait before reconnecting on server error
             await new Promise(r => setTimeout(r, 2000));
             continue;
          }

          if (!isMounted) {
            response.body.cancel().catch(() => {});
            return;
          }

          activeReader = response.body.getReader();
          retryCount = 0;

          while (isMounted) {
            const readPromise = activeReader.read();
            readPromise.catch(() => {});
            const { done } = await readPromise;
            if (done || !isMounted) break;
            queryClient.invalidateQueries({ queryKey: ['document', documentId] });
            queryClient.invalidateQueries({ queryKey: ['documents'] });
          }
        } catch (err: unknown) {
          if (err instanceof TypeError && err.message.includes('network error')) {
            // Expected if server closes connection
          } else {
            console.error('SSE Error:', err);
          }
          if (isMounted) {
             await new Promise(r => setTimeout(r, Math.min(10000, 1000 * Math.pow(2, retryCount++))));
          }
        }
      }
    };

    fetchSSE();

    return () => {
      isMounted = false;
      if (activeReader) {
        activeReader.cancel().catch(() => {});
      }
    };
  }, [documentId, token, queryClient]);

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiClient(`/documents/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient(`/documents/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const res = await apiClient<{ url: string }>(`/documents/${documentId}/download`);
      if (res.url) {
        window.open(res.url, '_blank');
      }
    } catch (err) {
      console.error('Failed to download document', err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="p-8 text-center text-destructive">
        Failed to load document details. It may have been deleted.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{doc.finalName || doc.originalName}</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              Uploaded on {format(new Date(doc.createdAt), 'MMM d, yyyy h:mm a')}
              <Badge variant={getStatusBadgeVariant(doc.status)}>
                {doc.status.replace('_', ' ')}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {doc.status === 'FAILED' && (
            <Button
              variant="outline"
              onClick={() => retryMutation.mutate(doc.id)}
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          )}

          {['QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING'].includes(doc.status) && (
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate(doc.id)}
              disabled={cancelMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" /> Cancel
            </Button>
          )}

          {(doc.status === 'COMPLETED' || doc.status === 'NEEDS_REVIEW') && (
            <Button onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Quick Summary */}
        <Card className="md:col-span-1 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg">AI Confidence</CardTitle>
            <CardDescription>Overall quality and certainty score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center p-6 bg-secondary/20 rounded-xl border">
              <div className="text-4xl font-bold mb-2">
                {doc.confidence !== null ? `${Math.round(doc.confidence * 100)}%` : 'N/A'}
              </div>
              <p className="text-sm text-muted-foreground">Confidence Score</p>
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Category</span>
                <Badge variant="outline">{doc.category || 'Unknown'}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Quality Score</span>
                <span className="font-medium">{doc.qualityScore ?? 'N/A'}/100</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Pages</span>
                <span className="font-medium">{doc.pageCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">PII Detected</span>
                {doc.piiDetected ? (
                  <Badge variant="secondary" className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Yes ({doc.piiEntityCount})</Badge>
                ) : (
                  <Badge variant="outline" className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Clean</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Deep Details via Tabs */}
        <div className="md:col-span-2">
          <Tabs defaultValue="extracted" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
              <TabsTrigger value="processing">Processing Details</TabsTrigger>
              <TabsTrigger value="privacy">Privacy & Security</TabsTrigger>
            </TabsList>
            
            <TabsContent value="extracted" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Document Data</CardTitle>
                  <CardDescription>Information identified by the AI model</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Title</p>
                      <p className="font-medium">{doc.title || 'Not found'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Document Date</p>
                      <p className="font-medium">{doc.documentDate || 'Not found'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Issuer / Sender</p>
                      <p className="font-medium">{doc.issuer || 'Not found'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Recipient</p>
                      <p className="font-medium">{doc.recipient || 'Not found'}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-sm text-muted-foreground">Reference Number</p>
                      <p className="font-medium font-mono">{doc.referenceNumber || 'Not found'}</p>
                    </div>
                  </div>
                  
                  {doc.summary && (
                    <div className="mt-6 pt-6 border-t space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> AI Summary</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">{doc.summary}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="processing" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Processing Analytics</CardTitle>
                  <CardDescription>Under-the-hood metrics for how this document was handled</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">AI Provider & Model</p>
                      <p className="font-medium">{doc.aiProvider} ({doc.aiModel})</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Processing Duration</p>
                      <p className="font-medium">
                        {doc.processingDurationMs ? `${(doc.processingDurationMs / 1000).toFixed(2)}s` : 'N/A'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Token Usage</p>
                      <p className="font-medium">{doc.totalTokens?.toLocaleString() || 'N/A'} total</p>
                      <p className="text-xs text-muted-foreground">{doc.promptTokens} prompt / {doc.completionTokens} completion</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">OCR Fallback Used?</p>
                      <p className="font-medium flex items-center gap-2">
                        {doc.ocrUsed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        {doc.ocrUsed ? `Yes (${doc.ocrTextLength} chars)` : 'No'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Chunks Processed</p>
                      <p className="font-medium">{doc.chunkCount ?? 0} chunk(s)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="privacy" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Privacy & Security Log</CardTitle>
                  <CardDescription>Security and redaction operations performed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${doc.virusScanned && doc.virusScanResult === 'Clean' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Anti-Virus Scan</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.virusScanned ? doc.virusScanResult : 'Not scanned'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={doc.virusScanned && doc.virusScanResult === 'Clean' ? 'outline' : 'destructive'}>
                      {doc.virusScanned ? 'Completed' : 'Skipped'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 text-blue-700">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">AI Input Mode</p>
                        <p className="text-sm text-muted-foreground">What the AI was allowed to see</p>
                      </div>
                    </div>
                    <Badge variant="outline">{doc.aiInputMode}</Badge>
                  </div>

                  {doc.piiProcessedAt && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      PII pipeline executed at {format(new Date(doc.piiProcessedAt), 'MMM d, yyyy h:mm a')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
