

# DocuRename-AI — Phase 5 Implementation Tickets

## Phase 5 Name

**SaaS Foundation: Authentication, Tenant Isolation, Frontend Dashboard, and API Hardening**

## Global Implementation Rules

Before starting any ticket, follow these rules:

* Preserve all existing Phase 1–4 functionality.
* Do not rewrite the existing processing pipeline unnecessarily.
* Do not bypass the privacy, PII redaction, prompt minimization, or tokenization pipeline.
* Do not expose raw extracted text, full redacted text, token maps, passwords, tokens, or PII through public APIs or frontend.
* Keep strict TypeScript.
* Keep the existing NestJS architecture modular.
* Prefer incremental, focused commits.
* Add/update tests where practical.
* Update `.env.example` files when adding environment variables.
* Keep the repository suitable as a public portfolio project.
* Update/edit the postman collection if needed after each feature/ticket implementation.
* Once a ticket is complete, run `npm run build`, `npm run test` and `npm run lint` in the backend and frontend directories respectively and check that everything is working.
* Do not proceed until all tests pass and build succeeds. and linting issues are resolved.
* Update README.md after each feature/ticket implementation with new features documented and necessary steps for setup and running the project.
* Update Phase5-Task.md checklist after each ticket implementation with the status of the ticket.

---

# Milestone 1 — Backend Auth Foundation

## Ticket 1.1 — Add Auth Module Structure

**Goal:** Add a clean NestJS authentication module.

Create:

```txt
backend/src/auth/
  auth.module.ts
  auth.controller.ts
  auth.service.ts
  jwt.strategy.ts
  local.strategy.ts
  current-user.decorator.ts
  guards/
    jwt-auth.guard.ts
  dto/
    register.dto.ts
    login.dto.ts
    refresh-token.dto.ts
  types/
    authenticated-user.type.ts
```

**Requirements:**

* Use Passport.js.
* Use JWT access tokens.
* Use refresh tokens if practical.
* Use `bcrypt` or `argon2` for password hashing.
* Add DTO validation with `class-validator`.
* Never return password hashes.
* Never log passwords or tokens.

**Acceptance Criteria:**

* Auth module compiles.
* Auth service can hash and validate passwords.
* JWT strategy validates a token and attaches a safe user payload to the request.
* `AuthenticatedUser` type exists:

```ts
export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
```

---

## Ticket 1.2 — Add User, Organization, and Membership Models

**Goal:** Add SaaS-style ownership models to Prisma.

Update Prisma schema with:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String?
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships OrganizationMember[]
  documents   Document[]
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members   OrganizationMember[]
  documents Document[]
}

model OrganizationMember {
  id             String           @id @default(uuid())
  userId         String
  organizationId String
  role           OrganizationRole
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
}

enum OrganizationRole {
  OWNER
  ADMIN
  MEMBER
}
```

Extend existing models:

```prisma
Document {
  userId         String
  organizationId String
}

AuditLog {
  actorUserId    String?
  organizationId String?
}

AiEvaluationRun {
  actorUserId    String?
  organizationId String?
}
```

**Requirements:**

* Extend existing models instead of duplicating.
* Add indexes for organization-scoped lookups where useful.
* Generate and commit Prisma migration.
* Keep existing document records migratable. If required, add a safe migration strategy or document local reset instructions.

**Acceptance Criteria:**

* Prisma schema validates.
* Migration runs.
* Prisma client generation succeeds.
* Existing backend still compiles.

---

## Ticket 1.3 — Implement Register/Login/Refresh/Logout/Me

**Goal:** Implement required auth endpoints.

Add endpoints:

```txt
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

**Register behavior:**

* Create user with hashed password.
* Create default organization.
* Add user as `OWNER`.
* Return safe user object and tokens.

Suggested default organization name:

```txt
<User name or email>'s Organization
```

**Login behavior:**

* Validate email/password.
* Return access token and refresh token.
* Return current user and active organization.

**Refresh behavior:**

* Validate refresh token.
* If refresh token hashes are implemented, compare against stored hash.
* Return a new access token.
* Rotate refresh token if practical.

**Logout behavior:**

* Clear refresh token hash if implemented.
* Return success.

**Me behavior:**

* Requires JWT.
* Returns current user, organization, and role.

**Environment variables:**

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PASSWORD_MIN_LENGTH=10
```

**Acceptance Criteria:**

* A user can register.
* A default organization is created.
* The user is assigned `OWNER`.
* A user can log in.
* Invalid password fails safely.
* `GET /auth/me` requires JWT and returns no password hash.
* Auth errors do not leak sensitive details.

---

## Ticket 1.4 — Organization Management Endpoints

**Goal:** Allow users to create, join, and switch active organizations.

Add endpoints:

```txt
POST /organizations
POST /organizations/:id/members
POST /auth/switch-organization
```

**Requirements:**

* `POST /organizations`: Create a new organization and assign the creator as `OWNER`.
* `POST /organizations/:id/members`: Add a user (by email or ID) to the organization with a specified role. Requires caller to be `OWNER` or `ADMIN`.
* `POST /auth/switch-organization`: Accepts a target `organizationId`. Validates the user is a member of that organization. Returns a new JWT `accessToken` with the new `organizationId` encoded in the payload.

**Acceptance Criteria:**

* User can create additional organizations.
* User can invite/add members to organizations they manage.
* User can switch their active context by retrieving a new JWT.

---

# Milestone 2 — Tenant Isolation and API Protection

## Ticket 2.1 — Add Current User Decorator and Organization Access Helpers

**Goal:** Standardize access to authenticated user context.

Implement:

```txt
backend/src/auth/current-user.decorator.ts
backend/src/auth/guards/organization-access.guard.ts
```

**Requirements:**

* `@CurrentUser()` returns `AuthenticatedUser`.
* JWT payload should include:

  * user id
  * email
  * active organization id
  * role
* Add helper methods where useful:

  * `assertOrganizationMember(userId, organizationId)`
  * `getDefaultOrganizationForUser(userId)`
  * `getUserMembershipContext(userId)`

**Acceptance Criteria:**

* Controllers can inject `@CurrentUser()`.
* Organization context is available in protected routes.
* Role is available for future admin guards.

---

## Ticket 2.2 — Protect Existing Endpoint Groups with JWT

**Goal:** Require authentication for sensitive backend APIs.

Protect these groups:

```txt
/uploads/*
/documents/*
/ai/providers*
/ai-evaluations*
/documents/:id/ai-evaluations*
/documents/events
/documents/:id/events
/documents/:id/download
retry/cancel endpoints
```

Public endpoints may remain:

```txt
/auth/register
/auth/login
/health
```

Metrics may remain public only if explicitly configured.

**Requirements:**

* Add `JwtAuthGuard` to protected controllers/routes.
* Keep Swagger decorators updated if Swagger exists.
* Do not accidentally protect health checks needed by Docker Compose unless configured.

**Acceptance Criteria:**

* Uploads require JWT.
* Document list/detail/download require JWT.
* Retry/cancel/evaluation require JWT.
* SSE endpoints require JWT.
* Existing processing behavior still works for authenticated requests.

---

## Ticket 2.3 — Scope Document Queries by Organization

**Goal:** Prevent cross-tenant document access.

Update all document-related service methods so queries include:

```ts
where: {
  id: documentId,
  organizationId: currentUser.organizationId,
}
```

Apply to:

* list documents
* get document detail
* download document
* retry document
* cancel document
* AI evaluations
* document-specific SSE stream
* delete document if implemented

**Upload behavior:**

* New documents must be saved with:

  * `userId`
  * `organizationId`

**Worker behavior:**

* Workers do not rely on request user context.
* Workers process by document id.
* Document records already contain ownership.
* Avoid exposing cross-org data in worker logs or events.

**Acceptance Criteria:**

* User A cannot list User B’s organization documents.
* User A cannot download User B’s organization documents.
* Retry/cancel/evaluation are organization-scoped.
* Uploaded documents contain correct ownership fields.

---

## Ticket 2.4 — Scope Audit Logs and AI Evaluation Runs

**Goal:** Associate audit and AI evaluation activity with users and organizations.

**Requirements:**

* When current user context exists, write:

  * `actorUserId`
  * `organizationId`
* AI evaluation runs must be scoped to the current organization.
* Users cannot run evaluations against another organization’s document.
* Evaluation history queries must be organization-scoped.

**Acceptance Criteria:**

* Audit logs include actor and organization when available.
* AI evaluation runs include actor and organization when available.
* Cross-organization evaluation access is blocked.

---

# Milestone 3 — API Security Hardening

## Ticket 3.1 — Add Helmet, CORS Allowlist, and Global ValidationPipe

**Goal:** Harden the NestJS API bootstrap.

Add:

* `helmet`
* strict CORS config
* global `ValidationPipe`

Example:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

**Environment variables:**

```env
CORS_ORIGIN=http://localhost:3000
```

**Requirements:**

* CORS should not be `*` in production.
* Support comma-separated CORS origins if practical.
* Keep local frontend/backend development working.

**Acceptance Criteria:**

* Unknown DTO fields are rejected.
* Helmet is enabled.
* CORS only allows configured origins.
* Frontend can still call backend in local dev.

---

## Ticket 3.2 — Add Rate Limiting

**Goal:** Add abuse protection for sensitive routes.

Use `@nestjs/throttler`.

Add env:

```env
RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_RATE_LIMIT_MAX_REQUESTS=20
AI_EVALUATION_RATE_LIMIT_MAX_REQUESTS=20
```

Apply separate throttling where practical:

* auth login/register
* upload
* AI evaluation
* download
* general API

**Acceptance Criteria:**

* General API has a default rate limit.
* Auth endpoints have stricter throttling.
* Upload and AI evaluation endpoints have separate limits.
* Rate limit responses are safe and normalized.

---

## Ticket 3.3 — Secure Metrics and Health Details

**Goal:** Avoid leaking production internals.

Add env:

```env
METRICS_PUBLIC=false
METRICS_TOKEN=
HEALTH_DETAILED_PUBLIC=false
```

**Requirements:**

* If `METRICS_PUBLIC=false`, require either:

  * valid auth, or
  * `X-Metrics-Token`
* Detailed health output should only be public if `HEALTH_DETAILED_PUBLIC=true`.
* Basic health can remain public for container orchestration.

**Acceptance Criteria:**

* `/metrics` is not publicly accessible in production by default.
* Detailed health internals are hidden unless configured.
* Local development remains convenient.

---

## Ticket 3.4 — Add Correlation ID Middleware and Normalized Error Responses

**Goal:** Improve observability and safer API errors.

**Requirements:**

* Add request correlation ID middleware.
* Accept incoming `X-Request-Id` if present, otherwise generate one.
* Include correlation ID in logs and error responses.
* Normalize API errors to a consistent shape.

Example error shape:

```json
{
  "message": "Upload validation failed",
  "error": "Bad Request",
  "statusCode": 400,
  "requestId": "..."
}
```

**Acceptance Criteria:**

* Every request has a correlation ID.
* Error responses include `requestId`.
* Sensitive details are not leaked in production errors.

---

# Milestone 4 — Upload Validation Hardening

## Ticket 4.1 — Add Strict Multi-File Upload Validation

**Goal:** Reject the entire upload request if any file is invalid.

Add env:

```env
MAX_FILES_PER_UPLOAD=10
MAX_TOTAL_UPLOAD_SIZE_MB=100
```

Validate:

* MIME type is `application/pdf`
* extension is `.pdf`
* magic bytes start with `%PDF-`
* file is non-empty
* per-file size is within existing max size
* total upload size is within max total size
* file count does not exceed max
* encrypted/password-protected PDF detection if practical

**Important behavior change:**

* Do not silently skip invalid files.
* Do not enqueue any files if the request contains invalid files.
* Do not store invalid files.

Error response example:

```json
{
  "message": "Upload validation failed",
  "errors": [
    {
      "filename": "bad.exe",
      "reason": "Only PDF files are allowed"
    }
  ]
}
```

**Acceptance Criteria:**

* Non-PDF file is rejected.
* Bad magic bytes are rejected.
* Empty file is rejected.
* Too many files are rejected.
* Oversized total upload is rejected.
* No invalid file is stored.
* No invalid file is enqueued.
* Per-file validation errors are returned.

---

# Milestone 5 — Frontend Foundation

## Ticket 5.1 — Create Next.js Frontend App

**Goal:** Add a frontend application.

Create:

```txt
frontend/
  app/
  components/
  lib/
  package.json
  .env.example
```

Recommended stack:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* TanStack Query
* React Hook Form
* Zod
* react-dropzone or Uppy

Add env:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

**Acceptance Criteria:**

* Frontend starts locally.
* Tailwind works.
* Basic app layout exists.
* API base URL is configurable.
* TypeScript strictness is enabled.

---

## Ticket 5.2 — Implement Frontend API Client and Auth Storage

**Goal:** Create a reusable frontend API client.

Create:

```txt
frontend/lib/api-client.ts
frontend/lib/auth.ts
frontend/lib/types.ts
```

**Requirements:**

* Attach `Authorization: Bearer <token>` to protected requests.
* Handle `401` by clearing auth state and redirecting to `/login`.
* For MVP, localStorage is acceptable if documented.
* Prefer httpOnly cookies only if practical without overcomplicating.

**Acceptance Criteria:**

* Authenticated API requests include bearer token.
* 401 responses redirect to login.
* Token storage limitation is documented.
* Shared backend response types are represented safely.

---

## Ticket 5.3 — Build Register Page

**Route:**

```txt
/register
```

**Features:**

* Email field
* Name field
* Password field
* Zod validation
* React Hook Form
* Calls `POST /auth/register`
* Stores auth result
* Redirects to `/dashboard`

**Acceptance Criteria:**

* User can register from frontend.
* Validation errors are displayed.
* Successful registration redirects to dashboard.
* Password is never logged.

---

## Ticket 5.4 — Build Login Page

**Route:**

```txt
/login
```

**Features:**

* Email field
* Password field
* Calls `POST /auth/login`
* Stores token
* Redirects to `/dashboard`
* Shows safe login errors

**Acceptance Criteria:**

* User can log in.
* Invalid credentials show a safe error.
* Successful login redirects to dashboard.
* Authenticated state persists across refresh for MVP.

---

## Ticket 5.5 — Build Authenticated Layout and Settings Page

**Routes:**

```txt
/settings
```

**Features:**

* Protected layout for dashboard/documents/settings/model-evaluation.
* Basic navigation.
* Logout button.
* Show:

  * current user
  * organization name
  * current role

**Acceptance Criteria:**

* Protected routes redirect unauthenticated users to login.
* User can log out.
* Settings displays current user and organization context.
* No sensitive auth tokens are displayed.

---

# Milestone 6 — Frontend Dashboard and Documents

## Ticket 6.1 — Build Dashboard Page

**Route:**

```txt
/dashboard
```

Show:

* total documents
* completed documents
* failed documents
* processing documents
* recent uploads

**Requirements:**

* Use organization-scoped protected API.
* Use TanStack Query.
* Handle loading, empty, and error states.

**Acceptance Criteria:**

* Dashboard renders after login.
* Counts are correct for current organization.
* Recent uploads are shown.
* Empty state is clean.

---

## Ticket 6.2 — Build Documents List and Upload Page

**Route:**

```txt
/documents
```

Features:

* Drag-and-drop PDF upload
* Multiple PDF support
* Upload progress
* Document table
* Status badges
* Final filename
* Category
* Confidence
* Quality score
* Error message if failed
* Retry action
* Cancel action
* Detail page link
* Live updates through SSE or polling fallback

**Acceptance Criteria:**

* User can upload one or more PDFs.
* Invalid upload errors are shown clearly.
* Document list updates after upload.
* Statuses are visible.
* Retry/cancel actions work when allowed.
* No raw text or PII is shown.

---

## Ticket 6.3 — Build Document Detail Page

**Route:**

```txt
/documents/[id]
```

Show:

* original filename
* final filename
* processing status
* category
* title
* issuer
* recipient
* reference number
* document date
* summary
* AI provider/model
* confidence
* quality score
* OCR used
* virus scan status
* privacy metadata only:

  * `piiDetected`
  * `piiEntityCount`
  * `privacyMode`
  * `aiInputMode`
* download button if completed
* retry button if failed
* cancel button if processing

Do **not** show:

* raw extracted text
* full redacted text
* encrypted token map
* original PII

**Acceptance Criteria:**

* Detail page loads only for current organization documents.
* Completed renamed PDF can be downloaded.
* Failed documents can be retried.
* Processing documents can be cancelled.
* Sensitive fields are not rendered.

---

## Ticket 6.4 — Add Frontend Live Updates

**Goal:** Connect frontend document status updates.

**Requirements:**

* Use existing SSE endpoints if available.
* Send auth token safely.
* If SSE auth through headers is difficult in browser `EventSource`, use one of:

  * cookie-based auth if implemented
  * token query param only if short-lived and documented
  * polling fallback
* Preserve security.

**Acceptance Criteria:**

* Document status updates without manual refresh.
* Polling fallback works.
* No sensitive event payload is exposed.
* Events are organization-scoped.

---

# Milestone 7 — Frontend Model Evaluation

## Ticket 7.1 — Build Model Evaluation Page

**Route:**

```txt
/model-evaluation
```

Features:

* Select an existing document.
* List configured providers.
* Health-check provider.
* Run single model evaluation.
* Run batch model evaluation.
* Compare:

  * provider
  * model
  * category
  * suggested filename
  * confidence
  * latency
  * token usage
  * error if failed

**Requirements:**

* All calls require auth.
* All evaluation data must be organization-scoped.
* Do not expose raw extracted text or PII.

**Acceptance Criteria:**

* User can run evaluation for their own document.
* User cannot evaluate another organization’s document.
* Results table renders provider comparison.
* Sensitive text is not shown.

---

# Milestone 8 — Maintenance and Retention Groundwork

## Ticket 8.1 — Add Maintenance Module

**Goal:** Add conservative cleanup groundwork.

Create:

```txt
backend/src/maintenance/
  maintenance.module.ts
  cleanup.service.ts
  retention-policy.service.ts
```

Add env:

```env
CLEANUP_ENABLED=false
FAILED_DOCUMENT_RETENTION_DAYS=30
AI_EVALUATION_RETENTION_DAYS=30
DELETE_ORPHANED_OBJECTS=false
```

**Features:**

* Scheduled cleanup job using `@nestjs/schedule`.
* Delete stale failed documents older than configured days if cleanup is enabled.
* Optionally delete old AI evaluation runs.
* Optionally detect/delete orphaned storage objects.
* Mark stale processing jobs as failed if not already handled elsewhere.

**Safety requirements:**

* Cleanup disabled by default.
* Do not delete completed documents by default.
* Log cleanup actions.
* Audit cleanup actions when practical.

**Acceptance Criteria:**

* Maintenance module compiles.
* Cleanup does nothing unless enabled.
* Failed-document cleanup respects retention days.
* Completed documents are not deleted by default.

---

# Milestone 9 — Multi-Instance SSE Readiness

## Ticket 9.1 — Add Configurable Event Transport

**Goal:** Keep current SSE behavior but add production-ready transport groundwork.

Add env:

```env
EVENT_TRANSPORT=in-memory
```

Supported values:

```txt
in-memory
redis
```

**Requirements:**

* Keep existing in-process RxJS behavior as default.
* Add abstraction around document events.
* If practical, implement Redis Pub/Sub:

  * worker publishes document events to Redis
  * API instances subscribe
  * SSE clients receive events regardless of instance
* Event payloads must not contain sensitive data.

**Acceptance Criteria:**

* Existing local SSE still works with `EVENT_TRANSPORT=in-memory`.
* Redis transport works if implemented.
* Event payloads remain privacy-safe.
* Frontend live updates continue to work.

---

# Milestone 10 — Optional Organization Admin Overview

## Ticket 10.1 — Add Basic Admin Overview Endpoint

**Goal:** Add backend-only organization overview for OWNER/ADMIN.

Endpoint:

```txt
GET /admin/overview
```

Return:

* document counts by status
* failed document count
* processing document count
* average processing duration
* provider usage counts
* OCR usage count
* virus scan failures

**Requirements:**

* Protect with JWT.
* Add role guard.
* Allow only `OWNER` and `ADMIN`.
* Scope all stats to current organization.

**Acceptance Criteria:**

* OWNER/ADMIN can access org overview.
* MEMBER cannot access.
* No cross-organization data is returned.

---

# Milestone 11 — Tests

## Ticket 11.1 — Add Auth Tests

Cover:

* register creates user and organization
* register creates OWNER membership
* login returns token
* invalid password fails
* protected route requires JWT
* `/auth/me` returns safe user object

**Acceptance Criteria:**

* Auth tests pass.
* Password hash is never returned.

---

## Ticket 11.2 — Add Authorization and Tenant Isolation Tests

Cover:

* user cannot access another organization’s document
* document list only returns current organization documents
* document detail is scoped
* download is scoped
* retry is scoped
* cancel is scoped
* evaluation is scoped

**Acceptance Criteria:**

* Cross-organization access returns 403 or 404.
* No foreign document data is leaked.

---

## Ticket 11.3 — Add Upload Validation Tests

Cover:

* rejects non-PDF
* rejects bad magic bytes
* rejects oversized file
* rejects too many files
* rejects empty file
* rejects oversized total upload
* does not enqueue invalid files
* does not store invalid files

**Acceptance Criteria:**

* Upload validation tests pass.
* Entire request fails if any file is invalid.

---

## Ticket 11.4 — Add API Hardening Tests

Cover where practical:

* validation pipe rejects unknown fields
* unauthenticated protected route fails
* rate limiter works
* metrics protection works when `METRICS_PUBLIC=false`

**Acceptance Criteria:**

* Security behavior is tested where practical.
* Tests are stable and not overly brittle.

---

## Ticket 11.5 — Add Frontend Tests

Cover:

* login form renders and submits
* register form renders and submits
* upload flow renders
* documents list renders statuses
* document detail hides sensitive fields
* API client attaches auth token

**Acceptance Criteria:**

* Frontend test suite passes.
* Sensitive fields are not rendered in document detail tests.

---

# Milestone 12 — Documentation and Developer Experience

## Ticket 12.1 — Update README for Phase 5

Add a Phase 5 section covering:

1. Authentication
2. Organization/tenant isolation
3. Frontend dashboard
4. Protected APIs
5. Upload validation hardening
6. Rate limiting and security headers
7. Data retention settings
8. SSE transport modes
9. New environment variables
10. Local frontend + backend development
11. Docker Compose usage
12. Known limitations

**Acceptance Criteria:**

* README explains how to run backend and frontend.
* README explains auth flow.
* README documents MVP token-storage limitation if localStorage is used.
* README documents cleanup defaults and safety.

---

## Ticket 12.2 — Update Environment Examples

Update:

```txt
backend/.env.example
frontend/.env.example
```

Backend env additions:

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PASSWORD_MIN_LENGTH=10

CORS_ORIGIN=http://localhost:3000

RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_RATE_LIMIT_MAX_REQUESTS=20
AI_EVALUATION_RATE_LIMIT_MAX_REQUESTS=20

MAX_FILES_PER_UPLOAD=10
MAX_TOTAL_UPLOAD_SIZE_MB=100

METRICS_PUBLIC=false
METRICS_TOKEN=
HEALTH_DETAILED_PUBLIC=false

CLEANUP_ENABLED=false
FAILED_DOCUMENT_RETENTION_DAYS=30
AI_EVALUATION_RETENTION_DAYS=30
DELETE_ORPHANED_OBJECTS=false

EVENT_TRANSPORT=in-memory
```

Frontend env:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

**Acceptance Criteria:**

* Env examples include all new variables.
* Defaults are safe for local development.
* Production-sensitive settings are documented.

---

## Ticket 12.3 — Update Postman Collection

Add or update requests for:

* register
* login
* refresh
* logout
* me
* protected upload
* protected document list
* protected document detail
* protected download
* protected retry/cancel
* protected AI evaluation
* bearer token usage

**Acceptance Criteria:**

* Postman collection supports auth flow.
* Protected endpoints include bearer token setup.
* Collection still works against local dev environment.

---

# Milestone 13 — Docker Compose

## Ticket 13.1 — Add Frontend to Docker Compose

**Goal:** Make full-stack local startup work.

Update `docker-compose.yml` to include:

* frontend
* backend API
* backend worker
* postgres
* redis
* minio
* ollama
* clamav
* OCR sidecar if already used

Expected local URLs:

```txt
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

**Requirements:**

* Frontend gets `NEXT_PUBLIC_API_BASE_URL`.
* Backend gets `CORS_ORIGIN=http://localhost:3000`.
* Existing backend worker and infrastructure continue to work.
* Swagger remains available if currently configured.

**Acceptance Criteria:**

* `docker compose up --build` starts the full stack.
* Frontend can reach backend.
* Backend can reach Postgres, Redis, MinIO, Ollama, ClamAV, and OCR services as before.
* Existing processing pipeline still works.

---

# Final Phase 5 Acceptance Checklist

Phase 5 is complete only when all of the following are true:

* User can register.
* User can log in.
* Default organization is created during registration.
* Registered user becomes organization `OWNER`.
* Upload endpoints require authentication.
* Uploaded documents receive `userId` and `organizationId`.
* Users cannot access documents from another organization.
* Downloads are protected and organization-scoped.
* Retry endpoints are protected and organization-scoped.
* Cancel endpoints are protected and organization-scoped.
* AI evaluation endpoints are protected and organization-scoped.
* SSE endpoints are protected.
* Existing PDF processing pipeline still works.
* PII privacy pipeline is still respected.
* Cloud AI providers receive only redacted/minimized input.
* Frontend supports login/register.
* Frontend supports PDF upload.
* Frontend shows document list and live status.
* Frontend shows document details.
* Frontend allows download of completed renamed PDFs.
* Frontend does not show raw text, redacted text, token maps, or original PII.
* API uses Helmet.
* API uses CORS allowlist.
* API uses global validation pipe.
* API uses rate limiting.
* Upload validation clearly rejects invalid PDFs.
* README is updated.
* Env examples are updated.
* Docker Compose still works.
* Tests pass.
* Existing Phase 1–4 functionality remains working.
