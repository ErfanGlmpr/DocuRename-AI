# Phase 5 — Implementation Task Tracker

Track each task below. Check the box **only** when:
- Code is written
- `npm run build` passes
- `npm run test` passes (all tests)
- `npm run lint` passes

---

## Milestone 1 — Backend Auth Foundation

### Ticket 1.1 — Auth Module Structure

- [x] `auth/types/authenticated-user.type.ts` — `AuthenticatedUser` interface
- [x] `auth/dto/register.dto.ts` — email, password (≥10 chars), optional name
- [x] `auth/dto/login.dto.ts` — email, password
- [x] `auth/dto/refresh-token.dto.ts` — refreshToken
- [x] `auth/guards/jwt-auth.guard.ts` — wraps `AuthGuard('jwt')`
- [x] `auth/current-user.decorator.ts` — `@CurrentUser()` extracts `AuthenticatedUser` from request
- [x] `auth/jwt.strategy.ts` — Passport JWT strategy, validates bearer token
- [x] `auth/local.strategy.ts` — Passport Local strategy, email/password
- [x] `auth/auth.service.ts` — register, login, refresh, logout, getMe
- [x] `auth/auth.module.ts` — wires JwtModule, PassportModule, strategies, controller

### Ticket 1.2 — User, Organization, OrganizationMember Prisma Models

- [x] `User` model — id, email, name?, passwordHash, refreshTokenHash?, timestamps
- [x] `Organization` model — id, name, timestamps
- [x] `OrganizationMember` model — userId, organizationId, role, unique constraint
- [x] `OrganizationRole` enum — OWNER, ADMIN, MEMBER
- [x] `Document` extended — userId?, organizationId? (nullable, enforced in Ticket 2.3)
- [x] `AuditLog` extended — actorUserId?, organizationId?
- [x] `AiEvaluationRun` extended — actorUserId?, organizationId?
- [x] Migration created and applied (`20260605160030_phase5_init`)
- [x] Prisma client regenerated successfully
- [x] Old migrations removed and replaced with single clean migration

### Ticket 1.3 — Register/Login/Refresh/Logout/Me Endpoints

- [x] `POST /auth/register` — creates user + org (transaction) + OWNER membership, returns tokens + user
- [x] `POST /auth/login` — validates credentials, returns tokens + user context
- [x] `POST /auth/refresh` — validates refresh token hash, rotates tokens, returns new pair
- [x] `POST /auth/logout` — requires JWT, clears refreshTokenHash
- [x] `GET /auth/me` — requires JWT, returns safe user + org + role (no password hashes)
- [x] Register: duplicate email returns `409 Conflict`
- [x] Login: wrong password returns `401 Unauthorized` (no detail leak)
- [x] Refresh: reused/invalid token returns `401 Unauthorized`
- [x] Passwords hashed with bcrypt (12 rounds)
- [x] Refresh tokens hashed before storage (never stored raw)
- [x] Timing-attack mitigation in `validateCredentials` (dummy bcrypt compare when user not found)

### Integration & Supporting Changes

- [x] `AuthModule` registered in `app.module.ts`
- [x] `main.ts` Swagger updated — `auth` tag + `addBearerAuth()`
- [x] `.env.example` updated — `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `PASSWORD_MIN_LENGTH`
- [x] `.env` updated with local dev JWT secrets

### Tests

- [x] `auth/auth.service.spec.ts` — 8 tests covering all service methods
- [x] `auth/auth.controller.spec.ts` — 5 tests covering all endpoints
- [x] All 122 tests pass (`npm run test`)

### Verification

- [x] `npm run build` — ✅ passes
- [x] `npm run test` — ✅ 122 tests, 27 suites, all pass
- [x] `npm run lint` — ✅ no errors

---

## Milestone 2 — Tenant Isolation and API Protection

### Ticket 2.1 — Current User Decorator and Organization Access Helpers
- [ ] `@CurrentUser()` already created in Ticket 1.1 ✓
- [ ] `guards/organization-access.guard.ts`
- [ ] `assertOrganizationMember(userId, organizationId)` helper
- [ ] `getDefaultOrganizationForUser(userId)` helper
- [ ] `getUserMembershipContext(userId)` helper

### Ticket 2.2 — Protect Existing Endpoints with JWT
- [ ] Add `JwtAuthGuard` to `/uploads/*`
- [ ] Add `JwtAuthGuard` to `/documents/*`
- [ ] Add `JwtAuthGuard` to `/ai/providers*`
- [ ] Add `JwtAuthGuard` to `/ai-evaluations*`
- [ ] Add `JwtAuthGuard` to `/documents/events` and `/documents/:id/events`
- [ ] Add `JwtAuthGuard` to `/documents/:id/download`
- [ ] Keep `/auth/register`, `/auth/login`, `/health` public
- [ ] Build + test + lint pass

### Ticket 2.3 — Scope Document Queries by Organization
- [ ] `uploads.service.ts` — populate `userId` + `organizationId` from auth context
- [ ] `documents.service.ts` — scope `findAll`, `findOne`, `getDownloadUrl`, `retry`, `cancel`, `remove`
- [ ] `ai-evaluation.service.ts` — scope evaluation queries
- [ ] `events` — scope SSE stream to org
- [ ] Make `userId`/`organizationId` required on Document (migrate)
- [ ] Build + test + lint pass

### Ticket 2.4 — Scope Audit Logs and AI Evaluation Runs
- [ ] Write `actorUserId` + `organizationId` to `AuditLog` when user context is available
- [ ] Write `actorUserId` + `organizationId` to `AiEvaluationRun`
- [ ] Build + test + lint pass

---

## Milestone 3 — API Security Hardening

### Ticket 3.1 — Helmet, CORS Allowlist, Global ValidationPipe
- [ ] Install `helmet`
- [ ] Add `app.use(helmet())` in `main.ts`
- [ ] Add strict CORS config from `CORS_ORIGIN` env
- [ ] Add global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- [ ] Add `CORS_ORIGIN` to `.env.example`
- [ ] Build + test + lint pass

### Ticket 3.2 — Rate Limiting
- [ ] Install `@nestjs/throttler`
- [ ] Add global throttle config
- [ ] Apply stricter throttle to auth endpoints
- [ ] Apply separate throttle to uploads and AI evaluation
- [ ] Add rate limit env vars to `.env.example`
- [ ] Build + test + lint pass

### Ticket 3.3 — Secure Metrics and Health Details
- [ ] `METRICS_PUBLIC` env flag — require token if false
- [ ] `X-Metrics-Token` header support
- [ ] `HEALTH_DETAILED_PUBLIC` env flag
- [ ] Build + test + lint pass

### Ticket 3.4 — Correlation ID and Normalized Errors
- [ ] Correlation ID middleware (accept `X-Request-Id` or generate UUID)
- [ ] Include correlation ID in logs and error responses
- [ ] Normalize error shape: `{ message, error, statusCode, requestId }`
- [ ] Build + test + lint pass

---

## Milestone 4 — Upload Validation Hardening

### Ticket 4.1 — Strict Multi-File Upload Validation
- [ ] Add env: `MAX_FILES_PER_UPLOAD`, `MAX_TOTAL_UPLOAD_SIZE_MB`
- [ ] Validate MIME type = `application/pdf`
- [ ] Validate extension = `.pdf`
- [ ] Validate magic bytes = `%PDF-`
- [ ] Validate non-empty file
- [ ] Validate per-file size within limit
- [ ] Validate total upload size within limit
- [ ] Validate file count within limit
- [ ] Reject entire batch if any file is invalid
- [ ] Return per-file validation errors
- [ ] Build + test + lint pass

---

## Milestone 5 — Frontend Foundation

### Ticket 5.1 — Create Next.js Frontend App
- [ ] Scaffold Next.js with TypeScript, Tailwind CSS
- [ ] Add shadcn/ui, TanStack Query, React Hook Form, Zod
- [ ] Configure `NEXT_PUBLIC_API_BASE_URL`
- [ ] Frontend starts locally
- [ ] Build + lint pass (frontend)

### Ticket 5.2 — Frontend API Client and Auth Storage
- [ ] `frontend/lib/api-client.ts` — attach Bearer token, handle 401
- [ ] `frontend/lib/auth.ts` — token storage (localStorage for MVP)
- [ ] `frontend/lib/types.ts` — shared backend response types
- [ ] Build + lint pass (frontend)

### Ticket 5.3 — Register Page
- [ ] `/register` route with email, name, password
- [ ] Zod + React Hook Form validation
- [ ] Calls `POST /auth/register`
- [ ] Redirects to `/dashboard` on success
- [ ] Build + lint pass (frontend)

### Ticket 5.4 — Login Page
- [ ] `/login` route with email, password
- [ ] Calls `POST /auth/login`
- [ ] Safe error messages
- [ ] Redirects to `/dashboard`
- [ ] Build + lint pass (frontend)

### Ticket 5.5 — Authenticated Layout and Settings Page
- [ ] Protected layout wrapping dashboard routes
- [ ] Logout button
- [ ] `/settings` showing user, org, role
- [ ] Unauthenticated redirect to `/login`
- [ ] Build + lint pass (frontend)

---

## Milestone 6 — Frontend Dashboard and Documents

### Ticket 6.1 — Dashboard Page
- [ ] `/dashboard` with document counts (total, completed, failed, processing)
- [ ] Recent uploads list
- [ ] TanStack Query, loading/empty/error states
- [ ] Build + lint pass (frontend)

### Ticket 6.2 — Documents List and Upload Page
- [ ] `/documents` with drag-and-drop PDF upload
- [ ] Document table with status, filename, category, confidence, quality
- [ ] Retry/cancel actions
- [ ] SSE live updates or polling fallback
- [ ] Build + lint pass (frontend)

### Ticket 6.3 — Document Detail Page
- [ ] `/documents/:id` detail view
- [ ] Display metadata without raw text/PII
- [ ] Build + lint pass (frontend)

### Ticket 6.4 — AI Evaluation Page
- [ ] `/documents/:id/evaluations` — run and list AI evaluations
- [ ] Build + lint pass (frontend)
