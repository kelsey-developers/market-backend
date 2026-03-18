FROM node:20-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Copy package metadata and Prisma schema first for better Docker layer caching.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Keep full node_modules (including prisma CLI) so schema migration can run on startup.
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./
COPY --from=build /app/scripts/docker-start.sh ./scripts/docker-start.sh

RUN chmod +x ./scripts/docker-start.sh && mkdir -p /app/uploads

EXPOSE 4000
CMD ["sh", "./scripts/docker-start.sh"]
