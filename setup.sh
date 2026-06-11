#!/bin/bash
set -e

echo "🚀 Setting up PDF AI Renaming SaaS..."

echo "1️⃣ Copying environment variables..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "✅ backend/.env created"
else
  echo "ℹ️ backend/.env already exists"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  echo "✅ frontend/.env.local created"
else
  echo "ℹ️ frontend/.env.local already exists"
fi

if [ ! -f docker-compose.override.yml ]; then
  cp docker-compose.override.example.yml docker-compose.override.yml
  echo "✅ docker-compose.override.yml created"
else
  echo "ℹ️ docker-compose.override.yml already exists"
fi

echo "2️⃣ Starting Docker containers (this might take a few minutes for the first build)..."
docker compose up -d

echo "3️⃣ Waiting for backend database connection..."
# Wait for postgres to be ready (a simple sleep, but can be improved with a healthcheck)
sleep 10

echo "4️⃣ Applying database migrations..."
docker compose exec backend npx prisma migrate deploy
echo "✅ Database migrations applied"

echo "5️⃣ Pulling Ollama Llama 3.1 model..."
docker exec pdf_ai_ollama ollama pull llama3.1:8b
echo "✅ Model pulled"

echo "🎉 Setup complete! The application should be running."
echo "👉 Frontend Dashboard: http://localhost:3001"
echo "👉 Backend API Docs: http://localhost:3000/api"
