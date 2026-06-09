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

### Ticket 1.4 — Organization Management Endpoints
- [x] `POST /organizations` — Create organization endpoint
- [x] `POST /organizations/:id/members` — Add member endpoint
- [x] `GET /organizations/:id/members` — Get members of organization
- [x] `POST /auth/switch-organization` — Switch active organization and reissue JWT
- [x] `npm run build` — passes
- [x] `npm run test` — tests pass
- [x] `npm run lint` — no errors

---

## Milestone 2 — Tenant Isolation and API Protection

### Ticket 2.1 — Current User Decorator and Organization Access Helpers
- [x] `@CurrentUser()` already created in Ticket 1.1 ✓
- [x] `guards/organization-access.guard.ts` — resolves org from params > body > query > JWT, delegates to `assertOrganizationMember`
- [x] `assertOrganizationMember(userId, organizationId)` — ForbiddenException if not a member
- [x] `getDefaultOrganizationForUser(userId)` — returns earliest membership by createdAt
- [x] `getUserMembershipContext(userId)` — returns all memberships as context objects
- [x] `OrganizationAccessGuard` + `JwtAuthGuard` exported from `AuthModule`
- [x] 6 new tests for helper methods (`auth.service.spec.ts`)
- [x] 6 new tests for guard (`organization-access.guard.spec.ts`)
- [x] `npm run build` — ✅ passes
- [x] `npm run test` — ✅ 134 tests, 28 suites, all pass
- [x] `npm run lint` — ✅ no errors

### Ticket 2.2 — Protect Existing Endpoints with JWT
- [x] Add `JwtAuthGuard` to `UploadsController` (`/documents/upload`) — class-level guard + `@ApiBearerAuth()`
- [x] Add `JwtAuthGuard` to `DocumentsController` (`/documents/*`) — class-level guard + `@ApiBearerAuth()`
- [x] Add `JwtAuthGuard` to `AiProvidersController` (`/ai/providers*`) — class-level guard + `@ApiBearerAuth()`
- [x] Add `JwtAuthGuard` to `AiEvaluationController` (`/documents/:id/ai-evaluations*`) — class-level guard + `@ApiBearerAuth()`
- [x] Add `JwtAuthGuard` to `DocumentEventsController` (`/documents/events`, `/documents/:id/events`) — class-level guard + `@ApiBearerAuth()`
- [x] `AuthModule` imported into `UploadsModule`, `DocumentsModule`, `AiModule`, `AiEvaluationModule`, `EventsModule`
- [x] `/auth/register`, `/auth/login`, `/auth/refresh` remain public
- [x] `DocumentsController` spec updated to override `JwtAuthGuard` so unit tests pass
- [x] `npm run build` — ✅ passes
- [x] `npm run test` — ✅ 134 tests, 28 suites, all pass
- [x] `npm run lint` — ✅ no errors

### Ticket 2.3 — Scope Document Queries by Organization
- [x] Prisma schema — `userId`/`organizationId` made required (non-nullable) on `Document`
- [x] Migration `20260607193654_ticket_2_3_require_document_ownership` — deletes legacy ownerless docs, then enforces NOT NULL
- [x] `uploads.service.ts` — `processUploads` accepts `AuthenticatedUser`, writes `userId` + `organizationId`
- [x] `uploads.controller.ts` — injects `@CurrentUser()` and passes to `processUploads`
- [x] `documents.service.ts` — `findAll`, `findOne`, `findOnePublic`, `getDownloadUrl`, `retryProcessing`, `cancel`, `remove`, `updateFilename` all require `organizationId`; `findOne` checks org match before returning
- [x] `documents.controller.ts` — all org-scoped methods inject `@CurrentUser()` and forward `organizationId`
- [x] `ai-evaluation.service.ts` — `runEvaluation`, `runBatch`, `listEvaluations` require `organizationId`; scope document lookup to org
- [x] `ai-evaluation.controller.ts` — injects `@CurrentUser()` and passes `organizationId` to all service calls
- [x] `document-events.service.ts` — `DocumentEvent` carries `organizationId?`; `streamAllForOrg(organizationId)` added; `buildEvent` accepts optional `organizationId`
- [x] `document-events.controller.ts` — `streamAll` filtered by org (`streamAllForOrg`); `streamDocument` verifies org ownership before streaming
- [x] `events.module.ts` — imports `DocumentsModule` for ownership check
- [x] 4 new tests — `findAll` org query, `findOne` org isolation, controller `findAll` forwarding, controller spec `@CurrentUser` override
- [x] `npm run build` — ✅ passes
- [x] `npm run test` — ✅ 138 tests, 28 suites, all pass
- [x] `npm run lint` — ✅ no errors

### Ticket 2.4 — Scope Audit Logs and AI Evaluation Runs
- [x] Write `actorUserId` + `organizationId` to `AuditLog` when user context is available
- [x] Write `actorUserId` + `organizationId` to `AiEvaluationRun`
- [x] Build + test + lint pass

---

## Milestone 3 — API Security Hardening

### Ticket 3.1 — Helmet, CORS Allowlist, Global ValidationPipe
- [x] Install `helmet`
- [x] Add `app.use(helmet())` in `main.ts`
- [x] Add strict CORS config from `CORS_ORIGIN` env
- [x] Add global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- [x] Add `CORS_ORIGIN` to `.env.example`
- [x] Build + test + lint pass

### Ticket 3.2 — Rate Limiting
- [x] Install `@nestjs/throttler`
- [x] Add global throttle config
- [x] Apply stricter throttle to auth endpoints
- [x] Apply separate throttle to uploads and AI evaluation
- [x] Add rate limit env vars to `.env.example`
- [x] Build + test + lint pass

### Ticket 3.3 — Secure Metrics and Health Details
- [x] `METRICS_PUBLIC` env flag — require token if false
- [x] `X-Metrics-Token` header support
- [x] `HEALTH_DETAILED_PUBLIC` env flag
- [x] Build + test + lint pass

### Ticket 3.4 — Correlation ID and Normalized Errors
- [x] Correlation ID middleware (accept `X-Request-Id` or generate UUID)
- [x] Include correlation ID in logs and error responses
- [x] Normalize error shape: `{ message, error, statusCode, requestId }`
- [x] Build + test + lint pass

---

## Milestone 4 — Upload Validation Hardening

### Ticket 4.1 — Strict Multi-File Upload Validation
- [x] Add env: `MAX_FILES_PER_UPLOAD`, `MAX_TOTAL_UPLOAD_SIZE_MB`
- [x] Validate MIME type = `application/pdf`
- [x] Validate extension = `.pdf`
- [x] Validate magic bytes = `%PDF-`
- [x] Validate non-empty file
- [x] Validate per-file size within limit
- [x] Validate total upload size within limit
- [x] Validate file count within limit
- [x] Reject entire batch if any file is invalid
- [x] Return per-file validation errors
- [x] Build + test + lint pass

---

## Milestone 5 — Frontend Foundation

### Ticket 5.1 — Create Next.js Frontend App
- [x] Scaffold Next.js with TypeScript, Tailwind CSS
- [x] Add shadcn/ui, TanStack Query, React Hook Form, Zod
- [x] Configure `NEXT_PUBLIC_API_BASE_URL`
- [x] Frontend starts locally
- [x] Build + lint pass (frontend)

### Ticket 5.2 — Frontend API Client and Auth Storage
- [x] `frontend/lib/api-client.ts` — attach Bearer token, handle 401
- [x] `frontend/lib/auth.ts` — token storage (localStorage for MVP)
- [x] `frontend/lib/types.ts` — shared backend response types
- [x] Build + lint pass (frontend)

### Ticket 5.3 — Register Page
- [x] `/register` route with email, name, password
- [x] Zod + React Hook Form validation
- [x] Calls `POST /auth/register`
- [x] Redirects to `/dashboard` on success
- [x] Build + lint pass (frontend)

### Ticket 5.4 — Login Page
- [x] `/login` route with email, password
- [x] Calls `POST /auth/login`
- [x] Safe error messages
- [x] Redirects to `/dashboard`
- [x] Build + lint pass (frontend)

### Ticket 5.5 — Authenticated Layout and Settings Page
- [x] Protected layout wrapping dashboard routes
- [x] Logout button
- [x] `/settings` showing user, org, role
- [x] Unauthenticated redirect to `/login`
- [x] Build + lint pass (frontend)

---

## Milestone 6 — Frontend Dashboard and Documents

### Ticket 6.1 — Dashboard Page
- [x] `/dashboard` with document counts (total, completed, failed, processing)
- [x] Recent uploads list
- [x] TanStack Query, loading/empty/error states
- [x] Build + lint pass (frontend)

### Ticket 6.2 — Documents List and Upload Page
- [x] `/documents` with drag-and-drop PDF upload
- [x] Document table with status, filename, category, confidence, quality
- [x] Retry/cancel actions
- [x] SSE live updates or polling fallback
- [x] Build + lint pass (frontend)

### Ticket 6.3 — Document Detail Page
- [x] `/documents/:id` detail view
- [x] Display metadata without raw text/PII
- [x] Build + lint pass (frontend)

