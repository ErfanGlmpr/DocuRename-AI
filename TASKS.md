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

### Ticket 6.4 — Add Frontend Live Updates
- [x] Use existing SSE endpoints if available
- [x] Send auth token safely
- [x] Polling fallback implementation
- [x] Events are organization-scoped
- [x] Document status updates without manual refresh

---

## Milestone 8 — Maintenance and Retention Groundwork

### Ticket 8.1 — Add Maintenance Module
- [x] Create `maintenance.module.ts`, `cleanup.service.ts`, `retention-policy.service.ts`
- [x] Add env config (`CLEANUP_ENABLED`, `FAILED_DOCUMENT_RETENTION_DAYS`, `AI_EVALUATION_RETENTION_DAYS`, `DELETE_ORPHANED_OBJECTS`)
- [x] Scheduled cleanup job using `@nestjs/schedule`
- [x] Delete stale failed documents older than configured days
- [x] Delete old AI evaluation runs
- [x] Detect/delete orphaned storage objects

---

## Milestone 9 — Multi-Instance SSE Readiness

### Ticket 9.1 — Add Configurable Event Transport
- [x] Backend: Add `EVENT_TRANSPORT` config (default to `in-memory`).
- [x] Backend: Conditionally establish `ioredis` `pubClient` and `subClient` if configured.
- [x] Backend: Subscribe `subClient` to `document-events` channel.
- [x] Backend: Update `emit()` to conditionally publish to Redis or direct RxJS Subject.
- [x] Backend: Mock `ConfigService` in existing events tests.
- [x] Backend: Close Redis clients gracefully in `onModuleDestroy`.

---

## Milestone 10 — Optional Organization Admin Overview

### Ticket 10.1 — Add Basic Admin Overview Endpoint
- [x] Create `@Roles()` decorator and `OrganizationRoleGuard`.
- [x] Create `AdminModule`, `AdminController`, and `AdminService`.
- [x] Retrieve document count by status and average processing duration.
- [x] Protect endpoint so only `OWNER` and `ADMIN` can access.
- [x] Scope statistics strictly to the user's `organizationId`.

### Ticket 10.2 — Add Frontend Admin Dashboard
- [x] Update frontend `User` type with `role` property.
- [x] Define `AdminOverview` data interface.
- [x] Create protected `/admin` route fetching from `/admin/overview`.
- [x] Build dashboard displaying metrics grouped in cards.
- [x] Add restricted `Admin Panel` link to global layout navigation.

---

## Milestone 11 — Tests

### Ticket 11.1 — Add Auth Tests
- [x] Register creates user and organization.
- [x] Register creates OWNER membership.
- [x] Login returns token.
- [x] Invalid password fails safely.
- [x] Protected route requires JWT.
- [x] `/auth/me` returns safe user object.
- [x] Fix E2E testing worker leaks (`forceExit` + `--runInBand`).

### Ticket 11.2 — Add Authorization and Tenant Isolation Tests
- [x] User cannot access another organization’s document.
- [x] Document list only returns current organization documents.
- [x] Document detail is scoped.
- [x] Download is scoped.
- [x] Retry is scoped.
- [x] Cancel is scoped.
- [x] Evaluation is scoped.

### Ticket 11.3 — Add Upload Validation Tests
- [x] Rejects non-PDF.
- [x] Rejects bad magic bytes.
- [x] Rejects oversized file.
- [x] Rejects too many files.
- [x] Rejects empty file.
- [x] Rejects oversized total upload.
- [x] Does not enqueue invalid files.
- [x] Does not store invalid files.

### Ticket 11.4 — Add API Hardening Tests
- [x] Validation pipe rejects unknown fields.
- [x] Unauthenticated protected route fails.
- [x] Rate limiter works.
- [x] Metrics protection works when `METRICS_PUBLIC=false`.

### Ticket 11.5 — Add Frontend Tests
- [x] Login form renders and submits.
- [x] Register form renders and submits.
- [x] Upload flow renders.
- [x] Documents list renders statuses.
- [x] Document detail hides sensitive fields.
- [x] API client attaches auth token.

---

## Milestone 12 — Documentation and Developer Experience

### Ticket 12.1 — Update README for Phase 5
- [x] Add a Phase 5 section covering auth, orgs, dashboard, protected APIs, validation, rate limiting, data retention, SSE, env vars.

### Ticket 12.2 — Update Environment Examples
- [x] Update backend `/.env.example`.
- [x] Update frontend `/.env.example`.

### Ticket 12.3 — Update Postman Collection
- [x] Add auth endpoints and protected routes.

---

## Milestone 13 — Docker Compose & Infrastructure

### Ticket 13.1 — Full Stack Containerization
- [x] Backend: Add `Dockerfile` for standalone production-ready NestJS builds.
- [x] Frontend: Configure `next.config.ts` for standalone output.
- [x] Frontend: Add `Dockerfile` for optimized multi-stage Next.js builds.
- [x] Compose: Migrate backend execution from manual scripts to `docker-compose.yml`.
- [x] Compose: Add frontend service mapping to port 3001 in `docker-compose.yml`.
- [x] Environment: Establish `env_file` loading strategy across containers.
- [x] Bugfix: Remove destructive `npx prisma db push --accept-data-loss` from backend startup to prevent silent Phase 5 schema data wipes.

### Ticket 13.2 — Developer Experience (Local Overrides)
- [x] Create `docker-compose.override.example.yml` for isolated hot-reloading dev environments.
- [x] Configure anonymous volumes (`/app/node_modules`) to avoid cross-OS dependency conflicts.
- [x] Map local source folders to override production standalone images with `npm run dev` and `npm run start:dev`.
- [x] Add override configurations to `.gitignore`.

---

## Milestone 14 — Security Hardening (HttpOnly Cookies)

### Ticket 14.1 — Silent Token Refresh & HttpOnly Cookies
- [x] Backend: Transition from JSON `refreshToken` to `HttpOnly`, `Secure` cookies.
- [x] Backend: Parse cookies via `cookie-parser`.
- [x] Backend: Update `AuthController` tests to mock Express `Request` and `Response`.
- [x] Frontend: Configure `credentials: 'include'` on API client.
- [x] Frontend: Implement 401 interceptor in `apiClient` to silently rotate tokens using the HttpOnly cookie.
- [x] Frontend: Implement promise lock to prevent redundant concurrent refresh requests.
- [x] Frontend: Update SSE (`fetchSSE`) logic to handle 401s and rotate token.
- [x] Build + test + lint pass (backend and frontend)

---

## Milestone 15 — Phase 5 Final Hardening Tickets

### Ticket 15 — Fix Tenant Isolation for Stuck Document Endpoints
- [x] Endpoints require authenticated user and scope results/actions to `currentUser.organizationId`.
- [x] `GET /documents/stuck` only returns stuck documents from the authenticated user’s organization.
- [x] `POST /documents/stuck/reconcile` only reconciles stuck documents from the authenticated user’s organization.
- [x] Added tests proving tenant isolation.

### Ticket 16 — Enforce Organization Scoping Directly in Document Queries
- [x] User-accessible document queries are organization-scoped at the database query level.
- [x] Cross-organization access returns safe error.
- [x] Added tests verifying user cannot access other organizations' documents by ID.

### Ticket 17 — Fix Upload Validation Error Response Shape
- [x] Upload validation returns predictable, frontend-friendly structured errors per file.
- [x] The whole request is rejected if any file is invalid.
- [x] Invalid files are not stored or enqueued.
- [x] Added tests for structured error responses across all validation scenarios.

### Ticket 18 — Remove Legacy Silent Skip Behavior from Upload Service
- [x] Upload service does not silently skip invalid files.
- [x] Invalid files cause a clear error.
- [x] No invalid files are stored or queued.
- [x] Valid multi-PDF upload still works.
- [x] Added unit tests for service validation behavior.

### Ticket 19 — Harden CORS Fallback Behavior
- [x] Production does not start with unsafe missing CORS configuration.
- [x] Local development still works with frontend on `http://localhost:3000`.
- [x] Credentialed requests only work from allowed origins.
- [x] README and `.env.example` document the behavior.

### Ticket 20 — Review and Update Postman Collection
- [x] Collection includes all current auth endpoints.
- [x] Collection includes protected document/upload endpoints.
- [x] Collection includes updated stuck-document behavior.
- [x] Collection reflects structured upload validation response where relevant.
- [x] Related endpoints are grouped together into cleanly named folders.
- [x] Request names are clear.
- [x] No real secrets are committed.
