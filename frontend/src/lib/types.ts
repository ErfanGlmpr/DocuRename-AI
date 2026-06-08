export interface User {
  id: string;
  email: string;
  name?: string;
  organizationId: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string[];
  error: string;
  requestId: string;
}
