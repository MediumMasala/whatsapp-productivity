FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/mastra/package.json ./packages/mastra/

# Install dependencies
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/mastra/node_modules ./packages/mastra/node_modules

COPY . .

# Generate Prisma client
RUN pnpm --filter api db:generate

# Build packages and API
RUN pnpm --filter @whatsapp-productivity/shared build
RUN pnpm --filter @whatsapp-productivity/mastra build
RUN pnpm --filter api build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/mastra/dist ./packages/mastra/dist
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json for workspace resolution
COPY --from=builder /app/package.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/mastra/package.json ./packages/mastra/

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]
