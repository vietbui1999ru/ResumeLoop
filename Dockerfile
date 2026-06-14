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
# APP_MODE must be set at build time so NEXT_PUBLIC_APP_MODE is baked into the JS bundle.
# Runtime secrets (ECS Secrets Manager) arrive too late for NEXT_PUBLIC_ vars.
ARG APP_MODE=cloud
ENV APP_MODE=${APP_MODE}
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# node:22-slim (Debian) — Chromium for Playwright HTML→PDF needs glibc + system libs.
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Chromium for the Playwright HTML→PDF engine (ADR 0001 §5). We install the distro
# Chromium (which pulls its runtime libs) and point Playwright at it, avoiding a
# separate ~150 MB Playwright browser download. LibreOffice is gone — PDFs are
# rendered from resume data, not converted from the DOCX.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# lib/pdf-render.ts launches this system Chromium instead of a bundled browser.
ENV PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium

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
