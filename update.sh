#!/bin/bash
set -e

echo "🔄 Updating PDF AI Renaming SaaS..."

echo "1️⃣ Pulling latest changes from git..."
git pull

echo "2️⃣ Installing local NPM dependencies..."
if [ -d "backend" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

if [ -d "frontend" ]; then
  echo "📦 Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

echo "3️⃣ Rebuilding and starting Docker containers..."
# Using --build ensures any dependency changes in Dockerfiles are applied
docker compose up --build -d

echo "4️⃣ Applying any pending database migrations..."
# Wait for postgres to be ready if it was restarted
sleep 5
docker compose exec backend npx prisma migrate deploy
echo "✅ Database migrations applied"

echo "🎉 Update complete! You're ready to code on this machine."
