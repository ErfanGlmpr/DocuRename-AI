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

### 1. Start Infrastructure (Docker Compose)
Make sure Docker is running. From the root of the project, run:
```bash
docker-compose up -d
```
This starts PostgreSQL, Redis, MinIO, and Ollama.

### 2. Pull the Ollama Model
The Ollama container starts empty; you must pull the model manually. **This only needs to be done once**, as the model is stored in a persistent Docker volume:
```bash
docker exec -it pdf_ai_ollama ollama pull llama3.1:8b
```

### 3. Setup Backend (NPM)
Navigate to the `backend` directory:
```bash
cd backend
```

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy the example environment file and ensure `PII_ENCRYPTION_KEY` is set:
   ```bash
   cp .env.example .env
   ```
   *(Note: .env.example already contains a sample key for local development)*

3. **Initialize Database**:
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Build the project**:
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

## Limitations & Next Steps
- **No OCR**: Scanned image PDFs are not supported yet.
- **No Frontend**: The model-comparison UI is backend-only for now.
- **Next Phase**: OCR for scanned PDFs, Frontend UI, and Auth/Multi-tenancy.

