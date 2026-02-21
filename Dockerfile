# ── Stage 1: build frontend ──────────────────────────────────────────────────
FROM node:20.19-bullseye AS build
WORKDIR /app

# Accept build arguments for MSAL / Azure AD config baked into the frontend
ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_TENANT_ID
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:20.19-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY package*.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy built frontend and backend
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.js"]