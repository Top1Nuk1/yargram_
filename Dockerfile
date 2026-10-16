FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests
COPY package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/landing/package.json ./apps/landing/
COPY scripts ./scripts

# Install all dependencies
RUN npm install

# Copy all source files
COPY . .

# Build landing, web, and server
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data
ENV JWT_SECRET=yargram_hf_space_default_jwt_secret_change_if_needed_32chars
ENV DB_ENCRYPTION_KEY=yargram_hf_space_default_db_encryption_key_32chars

# Hugging Face Spaces runs as user 1000 (node).
# Prepare writable directory for YarGram data and uploads.
RUN mkdir -p /app/data && chown -R node:node /app

COPY --chown=node:node package.json ./
COPY --chown=node:node apps/server/package.json ./apps/server/
COPY --chown=node:node apps/web/package.json ./apps/web/
COPY --chown=node:node apps/landing/package.json ./apps/landing/
COPY --chown=node:node scripts/install-workspaces.mjs ./scripts/

USER node

RUN npm install --omit=dev

COPY --chown=node:node --from=builder /app/apps/server/dist ./apps/server/dist
COPY --chown=node:node --from=builder /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node --from=builder /app/apps/landing/dist ./apps/landing/dist

EXPOSE 7860

CMD ["node", "apps/server/dist/index.js"]
