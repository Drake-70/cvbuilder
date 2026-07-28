FROM node:20-alpine AS base
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
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=base /app/backend ./backend
COPY --from=base /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "backend/server.js"]
