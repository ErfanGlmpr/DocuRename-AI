import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UploadZone } from './upload-zone';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
  ApiError: class extends Error {
    constructor(public status: number, public message: string) {
      super(message);
    }
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('UploadZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('renders upload dropzone', () => {
    renderWithProviders(<UploadZone />);
    expect(screen.getByText(/drag & drop some pdfs here/i)).toBeInTheDocument();
  });

  it('adds file on drop and renders upload button', async () => {
    renderWithProviders(<UploadZone />);

    // react-dropzone renders a hidden input.
    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(hiddenInput).toBeInTheDocument();

    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
    
    fireEvent.change(hiddenInput, { target: { files: [file] } });

    // Wait for the UI to update with the selected file
    expect(await screen.findByText('test.pdf')).toBeInTheDocument();
    
    // Check if the upload button is now visible
    const uploadButton = screen.getByRole('button', { name: /upload files/i });
    expect(uploadButton).toBeInTheDocument();
  });

  it('calls API and clears files on successful upload', async () => {
    vi.mocked(apiClient).mockResolvedValue({ success: true });
    
    renderWithProviders(<UploadZone />);

    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.4'], 'test2.pdf', { type: 'application/pdf' });
    
    fireEvent.change(hiddenInput, { target: { files: [file] } });

    const uploadButton = await screen.findByRole('button', { name: /upload files/i });
    
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalledWith('/documents/upload', expect.objectContaining({
        method: 'POST',
      }));
    });

    // Files should be cleared on success
    await waitFor(() => {
      expect(screen.queryByText('test2.pdf')).not.toBeInTheDocument();
    });
  });
});
