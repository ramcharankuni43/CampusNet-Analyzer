# ==============================================================================
# CampusNet Analyzer - Production Unified Dockerfile
# Full-Stack: React 18 (Vite) + FastAPI + SimPy Discrete-Event Simulation Engine
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime with SimPy & Python Backend
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS runner

# Environment settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/frontend/dist \
    SIMULATION_DIR=/app/simulation

WORKDIR /app

# Install system utilities (curl for container healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend/ /app/backend

# Copy compiled frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Prepare data, simulation and report storage directories
RUN mkdir -p /app/data /app/simulation/generated /app/simulation/traces /app/reports

# Default HTTP/WebSocket port
EXPOSE 8000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Start FastAPI application with dynamic PORT assignment (compatible with Voroa, Render, Railway, Cloud Run)
CMD ["sh", "-c", "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
