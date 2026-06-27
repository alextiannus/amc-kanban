FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root workspace files (needed for npm workspaces resolution)
COPY package.json package-lock.json ./

# Copy brand-owner package
COPY packages/brand-owner ./packages/brand-owner

# Copy prisma schema (needed for @prisma/client generation)
COPY prisma ./prisma

# Install only the brand-owner workspace deps
RUN npm ci --workspace=packages/brand-owner

# Build the brand-owner Next.js app
WORKDIR /app/packages/brand-owner
RUN npm run build

EXPOSE 3001
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "-p", "3001"]
