import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocumentDetailPage from './page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
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

describe('DocumentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('renders document details successfully', async () => {
    const mockDocument = {
      id: '1',
      originalName: 'invoice.pdf',
      finalName: '2024_01_invoice.pdf',
      status: 'COMPLETED',
      category: 'Invoice',
      confidence: 0.95,
      createdAt: new Date().toISOString(),
      title: 'Monthly Invoice',
      documentDate: 'Jan 2024',
      issuer: 'Acme Corp',
      recipient: 'John Doe',
      referenceNumber: 'INV-001',
      summary: 'Invoice for January services.',
      piiDetected: false,
    };

    vi.mocked(apiClient).mockResolvedValue(mockDocument);

    renderWithProviders(<DocumentDetailPage />);

    // Wait for the data to load
    await waitFor(() => {
      expect(screen.getByText('2024_01_invoice.pdf')).toBeInTheDocument();
    });

    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Monthly Invoice')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    vi.mocked(apiClient).mockRejectedValue(new Error('Failed to fetch'));

    renderWithProviders(<DocumentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load document details/i)).toBeInTheDocument();
    });
  });
});
