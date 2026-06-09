import { getToken, setToken, clearToken } from './auth';

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

let refreshTokenPromise: Promise<string | null> | null = null;

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit & { _retry?: boolean } = {}
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

  options.credentials = 'include';

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !options._retry) {
    if (!refreshTokenPromise) {
      refreshTokenPromise = fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Refresh failed');
          const data = await res.json();
          setToken(data.accessToken);
          return data.accessToken;
        })
        .catch(() => null)
        .finally(() => {
          refreshTokenPromise = null;
        });
    }

    const newAccessToken = await refreshTokenPromise;
    if (newAccessToken) {
      return apiClient<T>(endpoint, { ...options, _retry: true });
    }

    clearToken();
    if (typeof window !== 'undefined') {
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
