import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { apiClient, ApiError } from './api-client';
import { setToken, clearToken } from './auth';

describe('apiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    clearToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches auth token when present', async () => {
    setToken('test-token');
    
    const mockResponse = { ok: true, json: async () => ({ success: true }) };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    await apiClient('/test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const callArgs = (global.fetch as Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('omits auth token when not present', async () => {
    const mockResponse = { ok: true, json: async () => ({ success: true }) };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    await apiClient('/test');

    const callArgs = (global.fetch as Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('throws ApiError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Invalid data' }),
    };
    (global.fetch as Mock).mockResolvedValue(mockResponse);

    await expect(apiClient('/test')).rejects.toThrow(ApiError);
    await expect(apiClient('/test')).rejects.toThrow('Invalid data');
  });
});
