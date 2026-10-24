# Builds both services from the repository root:
#   docker build --target api -t tod-api .
#   docker build --target web -t tod-web .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w apps/api
# The web app forwards /api to this address; inside Docker Compose the API is "api".
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web

# API: keeps the full dependency set so migrations, the seed and the admin and
# demo commands (Prisma CLI, ts-node) can run inside the container.
FROM node:22-bookworm-slim AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000 FILE_STORAGE_DIR=/data/storage PATH=/app/node_modules/.bin:$PATH
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY deploy/api-start.sh /usr/local/bin/api-start
RUN chmod +x /usr/local/bin/api-start && mkdir -p /data/storage && chown -R node:node /data
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["api-start"]

# Web: Next.js standalone server only.
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
