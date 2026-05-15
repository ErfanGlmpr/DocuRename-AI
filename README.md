# PDF AI Renaming SaaS - Phase 1

This is the backend for Phase 1 of the PDF AI renaming application. It extracts text from uploaded PDFs, sends it to a local LLM (Ollama) to extract metadata (like title, category, date), and generates a safe, clean filename.

## Architecture

- **NestJS**: Backend framework.
- **Prisma + PostgreSQL**: Database for storing Document records.
- **MinIO**: S3-compatible local storage for original and final PDFs.
- **BullMQ + Redis**: Background job queue for processing documents.
- **Ollama**: Local AI provider running `llama3.1:8b` (or similar).

## Local Setup Instructions

### 1. Start Infrastructure (Docker Compose)
Make sure Docker is running. From the root of the project, run:
\`\`\`bash
docker-compose up -d
\`\`\`
This will start PostgreSQL, Redis, MinIO, and Ollama. Note: The MinIO initialization container will automatically create the \`documents\` bucket and make it public.

### 2. Pull the Ollama Model
Since the Ollama container starts empty, you need to pull the AI model.
\`\`\`bash
docker exec -it pdf_ai_ollama ollama pull llama3.1:8b
\`\`\`

### 3. Setup Backend
Navigate to the \`backend\` directory:
\`\`\`bash
cd backend
\`\`\`

Ensure you have your environment variables set up (the \`.env\` should already be copied from \`.env.example\`):
\`\`\`bash
npm install
npx prisma migrate dev --name init
npm run build
\`\`\`

### 4. Run the API and Worker
In Phase 1, the API and the BullMQ worker run in the same NestJS process. Start it in dev mode:
\`\`\`bash
npm run start:dev
\`\`\`

## API Endpoint Summary

### \`POST /documents/upload\`
Upload one or more PDFs.
\`\`\`bash
curl -F "files=@/path/to/invoice.pdf" http://localhost:3000/documents/upload
\`\`\`

### \`GET /documents\`
List all documents and their processing status.
\`\`\`bash
curl http://localhost:3000/documents
\`\`\`

### \`GET /documents/:id\`
Get full metadata for a specific document.
\`\`\`bash
curl http://localhost:3000/documents/<uuid>
\`\`\`

### \`GET /documents/:id/download\`
Get a presigned S3 download URL for the final renamed PDF (if processing is complete).
\`\`\`bash
curl http://localhost:3000/documents/<uuid>/download
\`\`\`

### \`POST /documents/:id/retry\`
Requeue a failed document for processing.
\`\`\`bash
curl -X POST http://localhost:3000/documents/<uuid>/retry
\`\`\`

### \`PATCH /documents/:id/filename\`
Manually rename the final document.
\`\`\`bash
curl -X PATCH -H "Content-Type: application/json" -d '{"filename": "new-name.pdf"}' http://localhost:3000/documents/<uuid>/filename
\`\`\`

## Known Phase 1 Limitations
- **No OCR**: If a PDF is composed of images rather than text, `pdf-parse` will not extract anything, and the process will fail gracefully.
- **No Authentication**: The API is open.
- **No PII Redaction**: Text is sent directly to the AI provider.
- **No Cloud AI Providers**: Only Ollama is implemented (though the `AiProvider` interface supports adding others like OpenAI).

## Next Phases
- Implement OCR for scanned documents.
- Add PII redaction before sending text to the AI.
- Add cloud AI provider support (OpenAI, Anthropic) or vLLM.
- Implement user authentication and multi-tenancy.
