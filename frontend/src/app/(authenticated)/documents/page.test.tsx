import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentsPage from './page';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}));

// Mock UploadZone to isolate DocumentsPage testing
vi.mock('@/components/upload-zone', () => ({
  UploadZone: () => <div data-testid="upload-zone-mock" />,
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('renders a list of documents and their statuses', async () => {
    const mockDocuments = [
      {
        id: '1',
        originalName: 'invoice.pdf',
        finalName: '2024_01_invoice.pdf',
        status: 'COMPLETED',
        category: 'Invoice',
        confidence: 0.95,
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        originalName: 'tax_form.pdf',
        finalName: null,
        status: 'QUEUED',
        category: null,
        confidence: null,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(apiClient).mockResolvedValue(mockDocuments);

    renderWithProviders(<DocumentsPage />);

    // Wait for the table to populate
    await waitFor(() => {
      expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    });

    // Check Document 1 (Completed)
    expect(screen.getByText('2024_01_invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();

    // Check Document 2 (Queued)
    expect(screen.getByText('tax_form.pdf')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument(); // getStatusText transforms QUEUED to 'Processing'
  });

  it('renders empty state when no documents exist', async () => {
    vi.mocked(apiClient).mockResolvedValue([]);

    renderWithProviders(<DocumentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No documents found/i)).toBeInTheDocument();
    });
  });
});
