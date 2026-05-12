# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# build tools needed only for better-sqlite3 native addon compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install app dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Install harness dependencies (docx, puppeteer, mammoth)
COPY harness/package.json harness/package-lock.json* ./harness/
RUN cd harness && npm ci

# Copy source and build Next.js (produces .next/standalone)
COPY . .
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Install system Chromium for Puppeteer (harness PDF generation)
RUN apk add --no-cache chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Next.js standalone includes pre-compiled node_modules (incl. better-sqlite3 .node)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Harness scripts needed at runtime for resume generation
COPY --from=builder /app/harness ./harness

# Pipeline bootstrap data files
COPY --from=builder /app/pipeline ./pipeline

# Resume/cover-letter DOCX templates
COPY --from=builder /app/templates ./templates

EXPOSE 3000
CMD ["node", "server.js"]
