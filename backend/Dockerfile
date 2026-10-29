# Build from repository root: docker build -f backend/Dockerfile .
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/public ./public
COPY frontend/src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/app.js backend/db.js ./
COPY backend/routes ./routes
COPY backend/services ./services
COPY backend/middleware ./middleware
COPY backend/utils ./utils
COPY backend/config ./config
COPY backend/assets ./assets
COPY backend/scripts ./scripts
COPY sql/05_term_report_core_schema.sql /app/sql/05_term_report_core_schema.sql
COPY docs/database/term-report-core-v1.schema.json /app/docs/database/term-report-core-v1.schema.json
COPY --from=frontend /build/frontend/dist /app/frontend/dist
EXPOSE 3000
CMD ["node", "app.js"]
