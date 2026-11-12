# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN DATABASE_URL="postgresql://user:password@localhost:5432/os_db" npm run prisma:generate
RUN npm run build

# Stage 2 — runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
# Instala sem executar scripts de terceiros; só o @prisma/engines (pacote confiável) roda o
# seu script para baixar o schema engine usado pelo initContainer (prisma db push).
RUN npm ci --ignore-scripts && npm rebuild @prisma/engines
COPY --from=builder /app/dist ./dist
# Logs estruturados em JSON (pino) e sem dependências de desenvolvimento no runtime
ENV NODE_ENV=production
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
USER node
EXPOSE 3000
CMD ["/bin/sh", "-c", "[ -f dist/src/main.js ] && node dist/src/main.js || node dist/main.js"]
