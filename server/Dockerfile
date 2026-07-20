# UNDRAL API server — build once, run migrations on boot, then serve.
#   docker build -t undral-server ./server
#   docker run --env-file server/.env -p 8787:8787 undral-server
# (or via the repo root's docker-compose.yml `api` service)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx --no-install prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx --no-install prisma generate
COPY --from=build /app/dist ./dist

EXPOSE 8787
# migrate deploy is idempotent — safe on every boot, and means a fresh
# database needs zero manual steps before the first start
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/index.js"]
