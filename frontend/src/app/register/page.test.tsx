import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RegisterPage from './page';
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

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders register form', () => {
    render(<RegisterPage />);
    
    expect(screen.getByText(/create an account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 10 characters long/i)).toBeInTheDocument();
  });

  it('submits the form successfully', async () => {
    vi.mocked(apiClient).mockResolvedValue({ accessToken: 'test-token' });

    render(<RegisterPage />);
    
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password1234' } });
    
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => {
      expect(apiClient).toHaveBeenCalled();
    });
    
    const callArgs = vi.mocked(apiClient).mock.calls[0];
    expect(callArgs[0]).toBe('/auth/register');
    const bodyObj = JSON.parse(callArgs[1].body);
    expect(bodyObj).toEqual(expect.objectContaining({
      name: 'John Doe',
      email: 'test@example.com',
      password: 'password1234'
    }));
  });
});
