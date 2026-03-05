# =============================================================
# Frontend Dockerfile — T-038
# Multi-stage build: node:20-alpine build + runtime
# NEXT_PUBLIC_API_URL build arg (defaults to http://backend:8000)
# Port 3000 exposed
# =============================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Accept the API URL as a build argument so Next.js can inline it at build time
ARG NEXT_PUBLIC_API_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Install dependencies first (cached layer — only re-runs when package*.json changes)
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Build the Next.js application (produces .next/)
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only the artefacts needed to run the server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# public/ is optional in Next.js — create it if absent to avoid COPY errors
RUN mkdir -p ./public
COPY --from=builder /app/public* ./public/

EXPOSE 3000

CMD ["npm", "start"]
