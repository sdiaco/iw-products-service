FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]
