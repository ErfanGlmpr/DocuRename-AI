FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies needed for node-gyp and Prisma
RUN apk add --no-cache openssl python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3000

# We use a shell script to run prisma db push before starting the app.
# If the database isn't ready immediately, this might fail, so in production
# you'd use a more robust wait-for-it script or init container.
CMD ["npm", "run", "start:prod"]
