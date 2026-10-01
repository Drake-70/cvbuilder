# Node version is kept in lockstep with .nvmrc, render.yaml (NODE_VERSION)
# and the CI workflow so the image is built on the runtime it is tested against.
FROM node:22-alpine AS base
WORKDIR /app

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Production image
FROM node:22-alpine AS production
WORKDIR /app

COPY --from=base /app/backend ./backend
COPY --from=base /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# ${PORT} is expanded by /bin/sh at container start, so the probe keeps working
# if the host overrides PORT (Render injects 10000, for example). Note this is
# a plain $ and not $$: the double-dollar escape is a docker-compose.yml
# convention and would make the shell interpolate the PID here.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-5000}/api/health" || exit 1

CMD ["node", "backend/server.js"]
