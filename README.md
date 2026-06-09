# PDF AI Renaming SaaS

This is the backend for a PDF AI renaming application. It extracts text from uploaded PDFs, protects user privacy by redacting Personally Identifiable Information (PII), sends the safe text to a local LLM (Ollama) to extract metadata, and generates a safe, clean filename.

## Phase 1 Overview
Phase 1 focuses on the core functionality:
- PDF upload and storage in MinIO.
- Text extraction using `pdf-parse`.
- Metadata extraction using local Ollama (Llama 3.1).
- Automatic filename generation.

## Phase 2: Privacy & PII Protection (New!)
Phase 2 adds a robust privacy pipeline before data is sent to the AI:
- **PII Detection**: Detects EMAIL, PHONE, IBAN, CREDIT_CARD, VAT_ID, TAX_ID, labeled Names/Addresses, etc.
- **Tokenization**: Replaces sensitive data with stable tokens (e.g., `[EMAIL_1]`).
- **Encrypted Storage**: Stores original PII values in an encrypted map (AES-256-GCM).
- **Prompt Minimization**: Intelligent text reduction to fit context windows and reduce data exposure.
- **Audit Logging**: Secure audit trail of all processing events.

---

## Architecture

- **NestJS**: Backend framework.
- **Prisma + PostgreSQL**: Database for Document records and Audit Logs.
- **MinIO**: S3-compatible local storage for original and final PDFs.
- **BullMQ + Redis**: Background job queue for processing documents.
- **Ollama**: Local AI provider running `llama3.1:8b`.
- **Privacy Module**: Native TypeScript implementation for PII protection.

---

## Local Setup Instructions

### Prerequisites
- Node.js 18+
- Docker and Docker Compose

### 1. Configure Environment (Backend)
Navigate to the `backend` directory:
```bash
cd backend
```
Copy the example environment file:
```bash
cp .env.example .env
```
*(Note: `.env` already contains local dev defaults. For cloud models like Gemini, OpenAI, etc. you'll need to configure their respective API keys).*

### 2. Start Infrastructure (Docker Compose)
Make sure Docker is running. From the **root** of the project, run:
```bash
docker compose up -d
```
This starts:
- **PostgreSQL** (Port 5434)
- **Redis** (Port 6379)
- **MinIO** (Port 9000/9001)
- **Ollama** (Port 11434)
- **ClamAV** (Port 3310 - Virus scanner)
- **OCR Sidecar** (Port 8080 - Python FastAPI Tesseract service)

> [!NOTE]
> **First-time startup notes:**
> - The **OCR Sidecar** needs to download Tesseract language packs during its first build. To verify or build it specifically, run `docker compose build ocr-sidecar`.
> - **ClamAV** will take 5-10 minutes on its first run to download its database of signature definitions. Until completed, virus scanning requests will fail/log warnings if enabled.

### 3. Pull the Ollama Model
The Ollama container starts empty; you must pull the default model manually (this is persistent):
```bash
docker exec -it pdf_ai_ollama ollama pull llama3.1:8b
```

### 4. Setup Backend (NPM & Prisma)
From the `backend` directory:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Database and Generate Client**:
   Apply existing migrations to the database and generate the Prisma Client:
   ```bash
   npx prisma db push
   # Or to run standard migration workflows:
   # npx prisma migrate dev
   ```

3. **Start Development Server**:
   ```bash
   npm run start:dev
   ```

---

## API & Documentation

- **Swagger UI**: Accessible at [http://localhost:3000/api](http://localhost:3000/api) when the backend is running.
- **Postman Collection**: A pre-configured collection is available in the root directory: `PDF-Renamer-API.postman_collection.json`.

---

## API Endpoint Examples

### `POST /documents/upload`
Upload one or more PDFs.
```bash
curl -F "files=@/path/to/invoice.pdf" http://localhost:3000/documents/upload
```

### `GET /documents`
List all documents with privacy metadata (`piiDetected`, `privacyMode`, etc.).
```bash
curl http://localhost:3000/documents
```

### `GET /documents/:id`
Get document details (sensitive fields like `redactedText` are excluded for privacy).
```bash
curl http://localhost:3000/documents/<uuid>
```

---

## Privacy Configuration

Phase 2 settings in `.env`:

- `PII_REDACTION_ENABLED`: Set to `true` to enable redaction (default).
- `PII_ENCRYPTION_KEY`: Base64 encoded 32-byte key for AES-256-GCM.
- `AI_INPUT_MAX_CHARS`: Maximum length of text sent to AI (default 12000).

To generate a new encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Supported PII Types
- EMAIL, PHONE, IBAN, CREDIT_CARD, VAT_ID, TAX_ID.
- PERSON_NAME_BASIC, ADDRESS_BASIC (when labeled).
- GENERIC_ID_NUMBER (Passport, ID, etc.).

---

## Phase 3: Cloud AI & Model Evaluation (New!)
Phase 3 introduces support for swappable cloud AI providers and a backend model-evaluation workflow to compare accuracy. **Privacy is strictly enforced**: cloud providers only receive the minimized, redacted text (no raw text, no original PII).

Supported Providers:
- **Ollama** (Local, default)
- **OpenAI** (json_schema mode)
- **Anthropic** (Tool-use mode)
- **Gemini** (generateContent schema mode)
- **Mistral** (json_object mode)
- **OpenAI-Compatible** (vLLM, LM Studio, OpenRouter)

### Model Evaluation Workflow
You can compare how different models perform on the same document:
1. `GET /ai/providers` — List available providers and configuration status.
2. `POST /ai/providers/:provider/health` — Check connectivity.
3. `POST /documents/:id/ai-evaluations` — Run a single model against a document.
4. `POST /documents/:id/ai-evaluations/batch` — Run multiple models sequentially.

---

---

## Phase 4: Production Readiness (New!)

Phase 4 adds enterprise-grade reliability and observability features.

### OCR Support (Scanned PDFs)
- **OCR sidecar**: A Python FastAPI microservice (`ocr-sidecar/`) running `pytesseract` + `pdf2image` + poppler-utils.
- **Automatic fallback**: OCR only triggers when pdf-parse extracts fewer than `OCR_MIN_TEXT_LENGTH` characters.
- **Language support**: English, German, French, Spanish, Dutch — add more via the Dockerfile.
- **Enable**: Set `OCR_ENABLED=true` and `OCR_SIDECAR_URL=http://localhost:8080`.

### Virus Scanning (ClamAV)
- **ClamAV daemon (clamd)** scans every uploaded PDF before text extraction.
- **Enable**: Set `VIRUS_SCAN_ENABLED=true` and start the `clamav` Docker service.
- **Graceful degradation**: If clamd is unreachable, processing continues with a warning log.
- **Infected documents** are permanently rejected (status `INFECTED`) and never sent to AI.
- **Note**: First `clamav` container startup downloads ~300 MB of virus definitions.

### Real-Time SSE Events
Stream document lifecycle events without polling:
```
GET /documents/events         # all documents
GET /documents/:id/events     # single document
```
Events: `DOCUMENT_QUEUED`, `DOCUMENT_PROCESSING_STARTED`, `DOCUMENT_VIRUS_SCAN_STARTED/PASSED`, `DOCUMENT_TEXT_EXTRACTED`, `DOCUMENT_OCR_STARTED/COMPLETED`, `DOCUMENT_PII_DETECTED`, `DOCUMENT_AI_STARTED/COMPLETED`, `DOCUMENT_COMPLETED`, `DOCUMENT_FAILED`.

### Prometheus Metrics
```
GET /metrics                  # Prometheus text format
```
Counters: `documents_processed_total`, `documents_failed_total`, `ocr_runs_total`, `ocr_success_total`, `virus_scan_total`, `virus_scan_failed_total`, `provider_requests_total{provider}`, `provider_failures_total{provider}`.
Histograms: `document_processing_duration_seconds`, `ai_latency_seconds{provider}`.
Disable with `METRICS_ENABLED=false`.

### Health Checks
```
GET /health                   # fast liveness: DB + Redis
GET /health/detailed          # all deps: DB, Redis, MinIO, AI provider, Queue
```

### Reliability Improvements
- **Custom retry backoff**: Failed jobs retry at 1 min → 5 min → 15 min (3 retries max).
- **Non-retryable classification**: Infected files, invalid PDFs, and user cancellations are never retried (`UnrecoverableError`).
- **Processing timeout**: `DOCUMENT_PROCESSING_TIMEOUT_MS=900000` (15 min default). Documents exceeding this are marked `FAILED` and not retried.

### Document Quality Score
Every processed document receives a quality score (0–100) stored in `qualityScore`:
- **25 pts** — Extraction quality (chars/page, OCR penalty -10)
- **35 pts** — AI confidence
- **40 pts** — Metadata completeness (title, category, date, issuer, summary, recipient, ref)

### Large Document Handling
`DocumentChunkingService` selects the most information-dense sections for documents exceeding `AI_MAX_INPUT_CHARS`, prioritising headings (40pts), keyword-rich lines (30pts), and first-page content (10pts). Stores `chunkCount` and `inputTextLength` for audit.

---

## Docker Compose (Phase 4)

All services (including OCR sidecar and ClamAV) are available by default:
```bash
docker compose up -d
```

Enable OCR and virus scanning in `.env`:
```bash
OCR_ENABLED=true
OCR_SIDECAR_URL=http://localhost:8080
VIRUS_SCAN_ENABLED=true
CLAMAV_HOST=localhost
```

Build the OCR sidecar image (only needed once or after changes):
```bash
docker compose build ocr-sidecar
```

---

## Phase 5: SaaS Foundation, Frontend UI & Multi-Tenancy (New!)

Phase 5 introduces a full SaaS foundation and a React/Next.js Frontend:
- **Authentication**: JWT-based auth (Register, Login, Refresh, Logout) using `HttpOnly` cookies.
- **Organization Management**: Users can create organizations, invite members, and seamlessly switch active contexts.
- **Tenant Isolation**: Documents, AI evaluation runs, and audit logs are strictly scoped to organizations.
- **Frontend Dashboard**: A responsive Next.js frontend with drag-and-drop document uploads, real-time status updates via SSE, and detailed document views.
- **API Hardening**: JWT guards on all sensitive endpoints, payload validation pipes, and robust rate limiting.
- **Data Retention**: Background cron jobs automatically clean up orphaned objects in MinIO and delete failed documents older than a configured threshold.
- **Multi-Instance SSE**: Support for Redis as a transport layer (`EVENT_TRANSPORT=redis`) to broadcast SSE events across multiple backend instances.

---

## Known Limitations
- **OCR sidecar first-build time**: The Docker image downloads Tesseract language packs on first build (~200 MB).
- **ClamAV cold start**: First startup downloads virus definitions (~300 MB). Subsequent restarts are fast.

## Future Roadmap
- Semantic search with vector embeddings
- Batch processing API
- Webhook callbacks for document events
- Stripe billing integration
