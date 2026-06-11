# DocuRename-AI — Phase 5 Final Hardening Tickets

## Context

Phase 5 has been implemented, including authentication, organization ownership, protected APIs, frontend dashboard, API hardening, upload validation, cleanup groundwork, SSE readiness, tests, docs, and Docker Compose updates.

This ticket list is a **final hardening pass**. Do not add new features. Do not rewrite the architecture. Fix only the issues listed below and preserve all existing Phase 1–5 behavior.

Before implementing, read:

* `SKILLS.md`
* existing Phase 5 task/ticket files
* current backend and frontend implementation
* current Postman collection
* README and `.env.example` files

Global rules:

* Keep strict TypeScript.
* Do not bypass the privacy/PII pipeline.
* Do not expose raw extracted text, full redacted text, token maps, original PII, secrets, passwords, or tokens.
* Preserve the existing document-processing pipeline.
* Keep changes small and reviewable.
* Use TDD where practical.
* A ticket is not complete until build, lint, and tests pass.
* Update Postman collection when endpoint behavior changes.
* Update TASKS.md once a ticket is completed.

Required verification after implementation:

```bash
npm run build
npm run lint
npm run test
```

If the repository has separate backend/frontend workspaces, run the equivalent commands in each affected workspace.

---

# Ticket 15 — Fix Tenant Isolation for Stuck Document Endpoints

## Problem

The stuck document endpoints are authenticated, but they are not properly organization-scoped.

Endpoints likely affected:

```txt
GET /documents/stuck
POST /documents/stuck/reconcile
```

Current risk:

* Any authenticated user may be able to see stuck documents from other organizations.
* Any authenticated user may be able to reconcile stuck documents across all organizations.
* This breaks SaaS tenant isolation.

## Goal

Make stuck-document inspection and reconciliation safe in a multi-tenant environment.

## Implementation Options

Choose the cleanest option based on current architecture.

Preferred option:

* Move these endpoints under admin-style behavior.
* Require authenticated user.
* Require `OWNER` or `ADMIN` role.
* Scope all results and actions to `currentUser.organizationId`.

Alternative acceptable option:

* Keep the endpoints under `/documents`.
* Require JWT.
* Pass `@CurrentUser()` into controller methods.
* Scope all stuck-document queries by `currentUser.organizationId`.
* If regular members should not use these endpoints, also add role protection.

## Required Changes

Update controller methods so they receive current user context:

```ts
@CurrentUser() currentUser: AuthenticatedUser
```

Update service methods so they accept organization context:

```ts
findStuckDocuments(currentUser: AuthenticatedUser)
reconcileStuckDocuments(currentUser: AuthenticatedUser)
```

or:

```ts
findStuckDocuments(organizationId: string)
reconcileStuckDocuments(organizationId: string)
```

All Prisma queries must include organization scoping:

```ts
where: {
  organizationId: currentUser.organizationId,
  status: ...,
  updatedAt: ...
}
```

Do not return stuck documents from other organizations.

## Acceptance Criteria

* `GET /documents/stuck` only returns stuck documents from the authenticated user’s organization.
* `POST /documents/stuck/reconcile` only reconciles stuck documents from the authenticated user’s organization.
* Cross-organization stuck documents are not visible.
* Cross-organization stuck documents are not modified.
* If role protection is added, `MEMBER` users cannot access these endpoints.
* Tests prove tenant isolation.

## Required Tests

Add or update tests for:

* user can see stuck documents in their own organization
* user cannot see stuck documents from another organization
* reconciliation does not affect another organization’s documents
* unauthenticated request is rejected
* if role guard is used, `MEMBER` is rejected and `OWNER`/`ADMIN` is allowed

---

# Ticket 16 — Enforce Organization Scoping Directly in Document Queries

## Problem

Some document service methods fetch a document by `id` first and then check whether the organization matches.

Example anti-pattern:

```ts
const document = await prisma.document.findUnique({
  where: { id },
});

if (document.organizationId !== currentUser.organizationId) {
  throw new NotFoundException();
}
```

This is safer than no check, but weaker than enforcing tenant isolation directly in the database query.

## Goal

All user-accessible document lookups must include `organizationId` in the Prisma query itself.

## Required Changes

Replace user-accessible document lookup patterns with scoped queries:

```ts
const document = await prisma.document.findFirst({
  where: {
    id: documentId,
    organizationId: currentUser.organizationId,
  },
});
```

Apply this to all user-facing document operations, including:

* get document detail
* download document
* retry document
* cancel document
* delete document, if implemented
* document-specific AI evaluations
* document-specific SSE access
* any helper method used by protected controllers

Do not apply this blindly to worker-only internal flows if the worker does not have request user context. Worker flows may fetch by document ID internally, but must not expose cross-tenant data externally.

## Acceptance Criteria

* User-accessible document queries are organization-scoped at the database query level.
* Cross-organization access returns `404` or safe `403`, depending on existing project convention.
* No foreign document metadata is returned.
* Worker processing remains compatible.
* Existing upload/processing/download flows still work.

## Required Tests

Add or update tests for:

* user cannot get another organization’s document by ID
* user cannot download another organization’s document
* user cannot retry another organization’s document
* user cannot cancel another organization’s document
* document list only returns current organization documents

---

# Ticket 17 — Fix Upload Validation Error Response Shape

## Problem

Upload validation currently rejects invalid files, but the error response is not structured enough for frontend usage.

Current style may be string-based:

```json
{
  "message": [
    "bad.exe: Invalid extension. Expected .pdf"
  ]
}
```

Target style should be structured per file:

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

## Goal

Return predictable, frontend-friendly validation errors for uploads.

## Required Changes

Update the upload validation pipe or exception factory to return:

```ts
{
  message: 'Upload validation failed',
  errors: Array<{
    filename: string;
    reason: string;
  }>;
}
```

Each invalid file should have one or more clear reasons.

If one file has multiple errors, either:

Option A — one error per reason:

```json
{
  "filename": "bad.exe",
  "reason": "Invalid extension. Expected .pdf"
}
```

Option B — one object with multiple reasons:

```json
{
  "filename": "bad.exe",
  "reasons": [
    "Invalid extension. Expected .pdf",
    "Invalid PDF magic bytes"
  ]
}
```

Prefer Option A if it is simpler and matches current API style better.

## Required Validation Coverage

The response should support errors for:

* invalid MIME type
* invalid extension
* invalid PDF magic bytes
* empty file
* oversized file
* too many files
* total upload size exceeded
* encrypted/password-protected PDF, if implemented

## Acceptance Criteria

* Invalid uploads return a stable structured response.
* Frontend can display per-file errors without parsing strings.
* The whole request is rejected if any file is invalid.
* No invalid file is stored.
* No invalid file is enqueued.
* Existing valid upload behavior still works.

## Required Tests

Add or update tests for:

* non-PDF upload returns structured error
* bad magic bytes returns structured error
* empty file returns structured error
* too many files returns structured error
* oversized total upload returns structured error
* mixed valid and invalid files reject the entire request
* invalid files are not stored
* invalid files are not enqueued

---

# Ticket 18 — Remove Legacy Silent Skip Behavior from Upload Service

## Problem

The upload service still contains legacy behavior that silently skips non-PDF or invalid files.

Even if validation currently prevents invalid files from reaching the service, this fallback is unsafe.

If the validation pipe is bypassed or reused incorrectly later, invalid files could be ignored silently instead of producing a clear failure.

## Goal

The upload service must never silently skip invalid files.

## Required Changes

Find logic similar to:

```ts
if (!isPdf) {
  continue;
}
```

or:

```ts
skip invalid file
```

Replace it with defensive failure behavior:

```ts
throw new BadRequestException({
  message: 'Upload validation failed',
  errors: [
    {
      filename: file.originalname,
      reason: 'Only PDF files are allowed',
    },
  ],
});
```

or centralize validation so the service can rely on already-validated input.

Important:

* Do not duplicate too much validation logic.
* The validation pipe should remain the primary validation layer.
* The service should defensively reject impossible invalid input.
* Do not partially process a mixed valid/invalid request.

## Acceptance Criteria

* Upload service does not silently skip invalid files.
* Invalid files cause a clear error.
* No invalid files are stored.
* No invalid files are queued.
* Valid multi-PDF upload still works.

## Required Tests

Add or update tests for:

* service throws if invalid file reaches it
* service does not enqueue invalid files
* service does not store invalid files
* valid files still process normally

---

# Ticket 19 — Harden CORS Fallback Behavior

## Problem

CORS is configured, but if `CORS_ORIGIN` is missing, the API may behave too permissively, especially with credentials enabled.

This is risky in production.

## Goal

Make CORS safe by default while keeping local development convenient.

## Required Changes

Review backend bootstrap configuration, likely in:

```txt
backend/src/main.ts
```

Implement safe behavior:

* In development:

  * default allowed origin can be `http://localhost:3000`
* In production:

  * missing `CORS_ORIGIN` should not result in broad credentialed CORS
  * either fail startup with a clear error or use a strict configured allowlist only

Support comma-separated origins if already practical:

```env
CORS_ORIGIN=http://localhost:3000,https://app.example.com
```

Do not use permissive wildcard CORS with credentials.

## Suggested Behavior

```ts
const corsOrigins = configService.get<string>('CORS_ORIGIN');

if (isProduction && !corsOrigins) {
  throw new Error('CORS_ORIGIN must be configured in production');
}
```

Then parse allowed origins into an allowlist.

## Acceptance Criteria

* Production does not start with unsafe missing CORS configuration.
* Local development still works with frontend on `http://localhost:3000`.
* Credentialed requests only work from allowed origins.
* README and `.env.example` document the behavior.

## Required Tests

Add tests where practical for:

* CORS origin parsing
* production missing CORS config behavior
* local default behavior

If bootstrap-level CORS testing is impractical, document manual verification in README or implementation notes.

---

# Ticket 20 — Review and Update Postman Collection

## Problem

Phase 5 introduced or modified protected APIs, auth behavior, upload behavior, tenant scoping, and possibly admin/maintenance endpoints.

The Postman collection must stay aligned with the actual API.

## Goal

Update the Postman collection so it is usable for local Phase 5 testing.

## Required Changes

Update the Postman collection whenever any endpoint was added or modified.

Group related endpoints into folders with proper names.

Required folder structure, if applicable:

```txt
Auth
  Register User
  Login User
  Refresh Token
  Logout User
  Get Current User

Uploads
  Upload PDFs

Documents
  List Documents
  Get Document Details
  Download Renamed PDF
  Retry Failed Document
  Cancel Processing Document
  List Stuck Documents
  Reconcile Stuck Documents

AI Providers
  List AI Providers
  Check Provider Health

AI Evaluations
  Run Model Evaluation
  Run Batch Model Evaluation
  List Evaluation Runs
  Get Evaluation Run

Admin
  Get Organization Overview

Health and Metrics
  Basic Health
  Detailed Health
  Metrics
```

Only include folders/endpoints that exist in the project.

## Postman Requirements

* Protected endpoints must use bearer token configuration.
* Auth requests should save access token and refresh token into Postman variables if practical.
* Do not commit real tokens, passwords, secrets, or production URLs.
* Use clear request names.
* Keep local environment variables generic.

Recommended variables:

```txt
baseUrl
accessToken
refreshToken
documentId
provider
model
```

## Acceptance Criteria

* Collection includes all current auth endpoints.
* Collection includes protected document/upload endpoints.
* Collection includes updated stuck-document behavior.
* Collection reflects structured upload validation response where relevant.
* Related endpoints are grouped together.
* Request names are clear.
* No real secrets are committed.

---

# Ticket 21 — Add/Update Final Security Regression Tests

## Problem

The implementation needs regression coverage for the final hardening fixes.

## Goal

Add focused tests that prevent future regressions in tenant isolation, upload validation, and endpoint protection.

## Required Test Areas

### Auth and Protection

* unauthenticated requests to protected document endpoints fail
* authenticated requests succeed for owned organization resources

### Tenant Isolation

* user cannot list another organization’s documents
* user cannot get another organization’s document details
* user cannot download another organization’s PDF
* user cannot retry another organization’s document
* user cannot cancel another organization’s document
* user cannot view another organization’s stuck documents
* user cannot reconcile another organization’s stuck documents

### Upload Validation

* invalid MIME type rejected
* invalid extension rejected
* bad magic bytes rejected
* empty file rejected
* too many files rejected
* total size exceeded rejected
* mixed valid/invalid upload rejects whole request
* invalid files are not stored
* invalid files are not enqueued
* error response is structured

### Sensitive Data

* document detail does not expose raw text
* document detail does not expose redacted text in full
* document detail does not expose token maps
* frontend document detail does not render sensitive fields, if frontend tests exist

## Acceptance Criteria

* Tests are meaningful and stable.
* Tests verify the actual security behavior, not just implementation details.
* All tests pass.
* No tests are skipped unless there is a documented reason.

---

# Ticket 22 — Final Verification and Documentation Pass

## Goal

Ensure Phase 5 is actually complete after hardening.

## Required Commands

Run the correct commands for the repository structure.

At minimum:

```bash
npm run build
npm run lint
npm run test
```

If backend has its own package:

```bash
cd backend
npm run build
npm run lint
npm run test
```

If frontend has its own package:

```bash
cd frontend
npm run build
npm run lint
npm run test
```

If Prisma changed:

```bash
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate status
```

If Docker Compose was affected:

```bash
docker compose config
```

If practical:

```bash
docker compose up --build
```

## Documentation Updates

Update README if any of the following changed:

* CORS behavior
* stuck-document endpoint access
* admin/role requirements
* upload validation response shape
* Postman usage
* environment variables
* local development instructions

Update `.env.example` if any env behavior changed.

## Acceptance Criteria

* Backend build passes.
* Backend lint passes.
* Backend tests pass.
* Frontend build passes, if frontend exists.
* Frontend lint passes, if frontend exists.
* Frontend tests pass, if frontend exists.
* Prisma validates, if schema changed.
* Postman collection is updated.
* README and env examples are accurate.
* No known build/lint/test errors remain.
* No task is marked complete while errors exist.

---

# Final Definition of Done

This hardening pass is complete only when:

* stuck-document endpoints are tenant-safe
* document lookups are organization-scoped directly in Prisma queries
* upload validation returns structured per-file errors
* upload service no longer silently skips invalid files
* CORS fallback is safe for production
* Postman collection is updated and grouped cleanly
* security regression tests are added or updated
* all build, lint, and test commands pass
* README and env examples are accurate
* no sensitive data is exposed through API, frontend, logs, SSE, metrics, or Postman examples
