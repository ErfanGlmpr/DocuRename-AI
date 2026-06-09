import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './page';
import { apiClient } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
  ApiError: class extends Error {
    constructor(public status: number, public message: string) {
      super(message);
    }
  },
}));

vi.mock('@/lib/auth', () => ({
  setToken: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    render(<LoginPage />);
    
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('submits the form successfully', async () => {
    vi.mocked(apiClient).mockResolvedValue({ accessToken: 'test-token' });

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalled();
    });
    
    const callArgs = vi.mocked(apiClient).mock.calls[0];
    expect(callArgs[0]).toBe('/auth/login');
    const bodyObj = JSON.parse(callArgs[1].body);
    expect(bodyObj).toEqual(expect.objectContaining({
      email: 'test@example.com',
      password: 'password123'
    }));
  });
});
