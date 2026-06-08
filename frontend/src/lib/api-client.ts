import { getToken, clearToken } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Set default Content-Type if not provided and not sending FormData
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      // Dispatch event to allow UI layer to handle redirect to login
      window.dispatchEvent(new Event('auth-unauthorized'));
    }
  }

  if (!response.ok) {
    let errorData;
    let errorMessage = 'An error occurred';
    try {
      errorData = await response.json();
      // Handle the normalized error shape from Ticket 3.4
      errorMessage = errorData.message || errorData.error || response.statusText;
      if (Array.isArray(errorMessage)) {
        errorMessage = errorMessage.join(', ');
      }
    } catch {
      errorMessage = response.statusText;
    }
    throw new ApiError(response.status, errorMessage, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
