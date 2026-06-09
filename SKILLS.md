# SKILLS.md — Engineering Standards for AI Agent Implementation

## Purpose

This file defines the engineering standards the AI agent must follow before implementing any task in this repository.

The goal is not only to make the code work, but to make it production-minded, maintainable, secure, testable, and consistent with a clean full-stack TypeScript architecture.

Read this file before reading implementation tickets, task lists, or feature prompts.

---

## 1. Core Implementation Principles

### 1.1 Preserve Existing Behavior

Before changing code:

- Understand the current architecture.
- Identify the existing module boundaries.
- Trace the current request/data flow.
- Avoid rewrites unless explicitly required.
- Preserve existing Phase 1–4 functionality.
- Do not bypass privacy, PII, AI minimization, document-processing, queue, OCR, virus scanning, storage, or SSE behavior.

A successful implementation should look like a natural extension of the existing codebase, not a parallel replacement.

### 1.2 Make Small, Focused Changes

Prefer small, reviewable diffs.

Do not implement unrelated tasks just because they are nearby.

For each ticket:

- Implement only the requested scope.
- Avoid speculative abstractions.
- Avoid large rewrites.
- Avoid touching unrelated files.
- Keep commits logically separated where possible.

### 1.3 Prefer Correctness Over Cleverness

Use clear, explicit, conventional code.

Avoid:

- clever one-liners
- hidden side effects
- global mutable state
- magic strings without constants
- duplicated business rules
- over-generalized abstractions
- premature optimization

Code should be readable by a senior engineer reviewing a portfolio project.

---

## 2. Architectural Standards

### 2.1 Clean Architecture Direction

Keep business logic separated from framework and infrastructure concerns.

Recommended direction:

```txt
Controller / Route Handler
  -> Application Service / Use Case
    -> Domain Logic / Policies
      -> Repository / Prisma / External Provider / Queue / Storage
```

Controllers should:

- validate request shape
- read authenticated user context
- delegate to services/use cases
- return safe response DTOs

Controllers should not:

- contain business workflows
- perform direct Prisma queries unless already consistent with the project style
- construct low-level storage paths
- expose internal entities blindly

Services/use cases should:

- enforce business rules
- enforce tenant scoping
- coordinate repositories/providers
- return safe data

Infrastructure classes should:

- talk to Prisma, Redis, S3/MinIO, BullMQ, ClamAV, OCR, AI providers, etc.
- avoid owning business decisions unless explicitly intended

### 2.2 DDD-Inspired Boundaries

Use Domain-Driven Design pragmatically. Do not overbuild.

Identify domain concepts and keep language consistent:

- User
- Organization
- OrganizationMember
- Document
- DocumentStatus
- DocumentMetadata
- AiProvider
- AiEvaluationRun
- AuditLog
- RetentionPolicy
- ProcessingJob

Prefer domain terms over technical shortcuts.

Example:

Good:

```ts
document.organizationId
document.status
document.finalFilename
```

Avoid:

```ts
doc.org
doc.stateThing
doc.newNameMaybe
```

### 2.3 Bounded Contexts

Keep modules focused.

Suggested backend contexts:

- `auth` — login, registration, tokens, current user
- `users` / `organizations` — ownership and membership
- `documents` — document records, status, download, retry, cancel
- `uploads` — file validation and upload intake
- `processing` / workers — document pipeline execution
- `ai` / `ai-evaluations` — provider abstraction and model comparison
- `privacy` — PII detection, redaction, tokenization
- `audit` — safe event logging
- `maintenance` — cleanup and retention
- `health` / `metrics` — observability

Do not create circular dependencies between modules.

### 2.4 Dependency Direction

Higher-level business logic should not depend on low-level implementation details unnecessarily.

Prefer interfaces or narrow abstractions when:

- multiple providers exist
- behavior has clear variants
- testing needs substitution
- the project already uses provider abstractions

Do not introduce interfaces for every class by default.

---

## 3. TDD: Test-Driven Development Discipline

Use Test-Driven Development pragmatically.

For security-sensitive, tenant-scoped, or behavior-changing work, prefer this loop:

```txt
1. Understand the expected behavior.
2. Write or update a failing test that captures the behavior.
3. Implement the smallest clean change.
4. Run the relevant test.
5. Refactor while keeping tests green.
6. Run the full verification commands before considering the task done.
```

TDD is especially required for:

- authentication
- authorization
- tenant isolation
- upload validation
- document access
- download access
- retry/cancel behavior
- AI evaluation scoping
- sensitive-data hiding
- API response changes
- bug fixes

Before implementation, answer internally:

- What existing behavior must remain unchanged?
- What module owns this responsibility?
- What is the smallest safe change?
- What data must never be exposed?
- What tests prove this is correct?
- What failure modes must be handled?

When a tradeoff is made, document it briefly in:

- code comments, only where helpful
- README
- implementation notes
- test names
- environment variable documentation

Do not add noisy comments that simply restate the code.

---

## 4. Security Standards

### 4.1 Default Security Posture

Security-sensitive features must be deny-by-default.

Authentication and authorization must be explicit.

Protected resources include:

- uploads
- documents
- downloads
- retry/cancel operations
- AI evaluations
- model/provider endpoints
- SSE document streams
- organization-scoped admin data

### 4.2 Tenant Isolation

Every user-owned resource must be scoped by organization.

For document access, use organization scoping:

```ts
where: {
  id: documentId,
  organizationId: currentUser.organizationId,
}
```

Never fetch by `id` alone for user-accessible document operations.

Tenant isolation applies to:

- list documents
- get document detail
- download
- retry
- cancel
- delete, if implemented
- AI evaluations
- SSE streams
- audit queries
- admin/overview endpoints

### 4.3 Sensitive Data Handling

Never expose through public APIs or frontend:

- password hashes
- JWT secrets
- refresh token hashes
- raw extracted text
- full redacted text
- encrypted token maps
- original PII
- internal provider secrets
- storage credentials
- full prompt payloads containing document content
- stack traces in production responses

Never log:

- passwords
- access tokens
- refresh tokens
- raw document text
- token maps
- original PII
- full AI prompts
- full AI responses if they may contain sensitive document content

### 4.4 Authentication

Use secure password hashing:

- Argon2 preferred if already compatible
- bcrypt acceptable

Access tokens should be short-lived.

Refresh tokens, if implemented, should be stored as hashes.

JWT payloads should contain only necessary claims:

```ts
{
  sub: userId,
  email,
  organizationId,
  role
}
```

Do not put sensitive user data in JWTs.

### 4.5 Authorization

Authentication answers: “Who are you?”

Authorization answers: “Can you access this resource?”

Always check authorization for organization-owned resources.

Do not assume a valid JWT means access to all documents.

### 4.6 Upload Security

Uploads must be validated before storage and queueing.

Validate:

- MIME type
- extension
- PDF magic bytes
- file size
- file count
- total upload size
- non-empty file
- encrypted/password-protected PDFs if practical

If any file is invalid, reject the entire request.

Do not store or enqueue invalid files.

---

## 5. API Design Standards

### 5.1 DTOs and Validation

Use DTOs for request bodies.

Use `class-validator` and `class-transformer` in NestJS.

Global validation should use:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Do not accept unknown fields silently.

### 5.2 Response Safety

Do not return ORM entities directly if they contain sensitive or internal fields.

Prefer response DTOs or explicit mapping.

Example:

```ts
return {
  id: user.id,
  email: user.email,
  name: user.name,
};
```

Not:

```ts
return user;
```

### 5.3 Error Responses

Errors should be clear but safe.

Good:

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

Avoid exposing:

- SQL errors
- stack traces
- internal storage keys
- provider secrets
- raw validation internals
- sensitive document content

### 5.4 HTTP Semantics

Use appropriate status codes:

- `400` invalid input
- `401` unauthenticated
- `403` authenticated but forbidden
- `404` not found or intentionally hidden cross-tenant resource
- `409` conflict
- `422` semantically invalid request, if the project already uses it
- `429` rate limited
- `500` unexpected server error

For cross-tenant document access, prefer `404` when hiding resource existence is safer.

---

## 6. Backend TypeScript Standards

### 6.1 Strict TypeScript

Maintain strict TypeScript.

Avoid:

- `any`
- unsafe casts
- untyped request objects
- implicit return types on complex public methods
- duplicated literal unions

Use explicit types for:

- auth payloads
- current user
- DTOs
- provider results
- document status
- AI evaluation results
- upload validation errors

### 6.2 Error Handling

Use NestJS exceptions where appropriate:

- `BadRequestException`
- `UnauthorizedException`
- `ForbiddenException`
- `NotFoundException`
- `ConflictException`
- `TooManyRequestsException`, if applicable

Do not swallow errors silently.

If an error is expected, convert it to a safe domain/application error.

If an error is unexpected, log safely with correlation ID.

### 6.3 Configuration

All environment variables must be documented in `.env.example`.

Use a config service or existing project configuration pattern.

Avoid reading `process.env` throughout the codebase unless that is already the established style.

Validate or normalize configuration where practical.

### 6.4 Logging

Logs should be useful and safe.

Include:

- operation name
- document id
- organization id where safe
- user id where safe
- request id
- provider name
- status transitions
- failure reason summary

Do not include sensitive payloads.

---

## 7. Prisma and Database Standards

### 7.1 Schema Changes

When changing Prisma schema:

- extend existing models instead of duplicating
- add indexes for common scoped queries
- preserve existing data when practical
- generate migrations
- run Prisma client generation

Recommended indexes:

```prisma
@@index([organizationId])
@@index([userId])
@@index([organizationId, status])
@@index([organizationId, createdAt])
```

Use only where applicable.

### 7.2 Query Scoping

User-accessible queries must include organization scoping.

Bad:

```ts
prisma.document.findUnique({
  where: { id },
});
```

Good:

```ts
prisma.document.findFirst({
  where: {
    id,
    organizationId: currentUser.organizationId,
  },
});
```

### 7.3 Transactions

Use transactions when multiple related writes must succeed together.

Examples:

- registration creates user, organization, membership
- upload creates document and audit log
- cleanup deletes DB record and storage object
- refresh token rotation

### 7.4 Migration Safety

Avoid destructive migrations unless explicitly required.

For existing local/demo data, provide clear migration or reset instructions.

---

## 8. Frontend Standards

### 8.1 Frontend Architecture

Keep frontend code organized:

```txt
frontend/
  app/
  components/
  lib/
  hooks/
  types/
```

Prefer separation:

- pages/routes coordinate data and layout
- components render UI
- hooks manage reusable client behavior
- API client owns HTTP calls
- types define safe API contracts

### 8.2 Authentication UX

Protected pages should redirect unauthenticated users to `/login`.

Handle expired tokens consistently.

If using localStorage for MVP:

- document the limitation
- keep the implementation isolated in `lib/auth.ts`
- do not scatter token access across components

### 8.3 Data Fetching

Use TanStack Query for server state.

Handle:

- loading
- error
- empty state
- success state
- refetch after mutation

Do not use server state as uncontrolled local state unless needed.

### 8.4 Sensitive Data in UI

Frontend must not display:

- raw extracted text
- full redacted text
- token maps
- original PII
- secrets
- internal storage keys

Document detail pages may show only privacy metadata:

- `piiDetected`
- `piiEntityCount`
- `privacyMode`
- `aiInputMode`

### 8.5 UI Quality

Use accessible, predictable UI.

Requirements:

- clear validation messages
- disabled states during submit
- visible upload progress
- status badges for document states
- retry/cancel/download actions only when valid
- responsive layout
- clean empty states

---

## 9. Testing Standards

### 9.1 Testing Philosophy

Add practical tests for important behavior.

Prioritize:

- security boundaries
- tenant isolation
- upload validation
- auth flow
- document processing contracts
- sensitive data not being exposed

Do not chase meaningless coverage.

### 9.2 Backend Tests

Backend tests should cover:

- registration creates user and organization
- login succeeds/fails correctly
- protected endpoints require JWT
- user cannot access another organization’s document
- uploads reject invalid files
- invalid uploads are not stored or enqueued
- document list/detail/download are organization-scoped
- AI evaluations are organization-scoped

### 9.3 Frontend Tests

Frontend tests should cover:

- login form
- register form
- API client attaches auth token
- protected route behavior
- document list rendering
- document detail hides sensitive fields
- upload flow error handling

### 9.4 Test Data

Use factories or helpers where practical.

Make tenant boundaries explicit in test names.

Example:

```txt
does not allow a user to download a document from another organization
```

---

## 10. AI Provider and Privacy Pipeline Standards

### 10.1 Provider Abstraction

Do not hardcode provider-specific logic into document services.

Use existing AI provider abstractions.

Provider calls should receive only privacy-safe minimized input.

### 10.2 Prompt and Response Safety

Do not log full prompts or full model responses if they may contain document content.

Do not store raw AI input unless already intentionally designed and privacy-safe.

### 10.3 Evaluation Safety

AI evaluation endpoints must:

- require auth
- scope documents by organization
- not expose raw document text
- not bypass redaction/minimization
- record actor and organization where practical

---

## 11. Queue, Worker, and Event Standards

### 11.1 Queue Jobs

Queue jobs should contain minimal necessary data.

Prefer:

```ts
{
  documentId: string
}
```

Optionally include organization id for extra validation.

Do not put raw document text, PII, or token maps in queue payloads.

### 11.2 Workers

Workers should:

- fetch document by id
- use document ownership fields for audit/event context
- not rely on request-scoped user context
- update status consistently
- emit privacy-safe events

### 11.3 SSE and Events

SSE events must not expose sensitive content.

Allowed event fields may include:

- document id
- status
- progress
- safe message
- timestamps
- error summary
- final filename if safe

Do not include:

- raw text
- full metadata containing PII
- token maps
- storage secrets

---

## 12. File and Storage Standards

### 12.1 Storage Keys

Storage keys should be safe and non-guessable.

Avoid exposing raw storage keys publicly.

Downloads should go through authenticated, organization-scoped backend endpoints.

### 12.2 File Naming

Generated filenames must be sanitized.

Avoid:

- path traversal
- control characters
- overly long names
- unsafe unicode normalization issues
- reserved names where applicable

### 12.3 Cleanup

Cleanup must be conservative.

Default behavior:

- cleanup disabled
- do not delete completed user documents
- do not aggressively delete data
- audit cleanup actions where practical

---

## 13. Observability Standards

### 13.1 Metrics

Metrics should be useful but safe.

Do not include:

- user emails
- document names if sensitive
- raw text
- PII
- tokens
- provider secrets

### 13.2 Health Checks

Public health checks should be minimal in production.

Detailed internals should require configuration or protection.

### 13.3 Request IDs

Use correlation/request IDs for tracing.

Include request ID in:

- logs
- error responses
- relevant audit records where practical

---

## 14. Documentation and Postman Standards

Update documentation when behavior changes.

Required documentation updates:

- README
- `.env.example`
- Docker Compose notes
- Postman collection when API endpoints are added or modified
- known limitations

### 14.1 Postman Collection Rules

The Postman collection must be updated whenever:

- a new endpoint is introduced
- an existing endpoint path changes
- an existing request body changes
- an existing response shape changes
- authentication requirements change
- headers change
- query parameters change
- environment variables or bearer token usage changes

Related endpoints must be grouped together in the same Postman folder.

Recommended folder structure:

```txt
Auth
  Register
  Login
  Refresh Token
  Logout
  Me

Documents
  List Documents
  Get Document
  Download Document
  Retry Document
  Cancel Document

Uploads
  Upload PDFs

AI Providers
  List Providers
  Provider Health Check

AI Evaluations
  Run Evaluation
  Run Batch Evaluation
  List Evaluation Runs

Admin
  Organization Overview

Health and Metrics
  Health
  Metrics
```

Postman request names must be clear and action-oriented.

Good names:

```txt
Register User
Login User
Get Current User
Upload PDFs
List Documents
Get Document Details
Download Renamed PDF
Retry Failed Document
Cancel Processing Document
Run Model Evaluation
```

Avoid vague names:

```txt
Test
Endpoint 1
New Request
API Call
```

Protected requests must include bearer-token configuration or inherit it from the collection/folder.

Do not store real secrets, real tokens, real user passwords, or production credentials in the Postman collection.

Document security tradeoffs clearly.

Example:

```txt
For the MVP frontend, access tokens are stored in localStorage. This is simple for local development but less secure than httpOnly cookies. Production deployments should prefer httpOnly secure cookies with CSRF protection.
```

---

## 15. Definition of Done

A ticket is not done until all verification commands pass with zero errors.

A ticket is done only when:

- implementation matches the requested scope
- existing behavior is preserved
- code compiles
- linting passes
- all relevant tests pass
- full project test suite passes where practical
- no sensitive data is exposed
- tenant scoping is enforced where applicable
- environment variables are documented
- README is updated if behavior changed
- Postman collection is updated when endpoints are added or modified
- related Postman endpoints are grouped into properly named folders
- Docker/local dev still works if affected
- no unrelated rewrites were introduced
- all discovered build, lint, and test errors are fixed

The AI agent must not claim completion while build, lint, or test errors remain.

---

## 16. Pre-Implementation Checklist

Before editing files, the AI agent must answer internally:

- Which modules are affected?
- What existing tests cover this?
- What new tests are needed?
- What sensitive data could accidentally leak?
- What tenant boundary must be enforced?
- What is the smallest clean implementation?
- What existing patterns should be followed?

---

## 17. Post-Implementation Checklist

After editing files, the AI agent must run the verification commands and fix all errors before considering the task complete.

Required commands:

```bash
npm run build
npm run lint
npm run test
```

If any command fails:

1. inspect the error
2. fix the root cause
3. rerun the failed command
4. rerun the full verification sequence
5. repeat until all commands pass

If Prisma changed, also run:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
```

If frontend changed, run the frontend verification commands in the frontend workspace:

```bash
npm run build
npm run lint
npm run test
```

If backend changed, run the backend verification commands in the backend workspace:

```bash
npm run build
npm run lint
npm run test
```

Use the correct package manager and workspace commands for the repository.

A task is not complete if any build, lint, type-check, test, Prisma, or relevant workspace command is failing.

---

## 18. Agent Behavior Rules

The AI agent must:

- read this file before implementing tickets
- respect ticket scope
- ask for clarification only when blocked
- prefer safe defaults
- avoid broad rewrites
- explain important tradeoffs
- use TDD for security-sensitive and behavior-changing work
- add tests for security-sensitive behavior
- keep implementation consistent with existing style
- run `npm run build`, `npm run lint`, and `npm run test`
- fix all build, lint, and test errors before claiming completion
- update the Postman collection when endpoints are added or modified
- group related Postman endpoints in properly named folders
- stop after completing the requested ticket or milestone

The AI agent must not:

- implement future tickets without instruction
- remove existing security/privacy features
- expose PII or raw document text
- disable tests to make changes pass
- ignore failing build, lint, or test commands
- weaken TypeScript strictness
- introduce unrelated dependencies
- change public API contracts without documenting them
- change API endpoints without updating Postman
- silently ignore validation errors
- store invalid uploads
- enqueue invalid uploads
