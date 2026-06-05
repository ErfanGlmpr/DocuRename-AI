export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
