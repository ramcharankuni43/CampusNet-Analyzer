# 🚀 CampusNet Analyzer — Production Deployment Guide

This guide covers verified deployment workflows for **CampusNet Analyzer**, including **Windows Localhost Development**, **Docker Compose** with persistent SQLite volume storage, **Voroa (`https://app.getvoroa.com`)**, and major cloud platforms (**Render, Railway, Fly.io, AWS/GCP**).

---

## 💻 0. Windows Localhost Development (One-Click Launch)

For local development and laboratory evaluation on Windows 10/11:
1. Double-click or run:
   ```powershell
   .\start.bat
   ```
2. `start.bat` automatically:
   - Verifies the Python virtual environment in `backend\venv`
   - Installs/updates dependencies from `backend\requirements.txt`
   - Checks and installs dependencies in `frontend/`
   - Launches the FastAPI backend on `http://127.0.0.1:8000`
   - Launches the Vite React frontend on `http://localhost:5173`
   - Opens your default web browser to CampusNet Analyzer
3. **Discrete-Event Simulation**: Normal simulations run via the native **SimPy discrete-event simulation engine** (`SimPySimulationEngine`) without requiring WSL2, Linux, or external NS-2 binaries.
4. *(Optional)* If legacy NS-2 is installed in WSL2 Ubuntu (`sudo apt install ns2`), CampusNet Analyzer can optionally detect it, but NS-2 is strictly optional.

---

## 🐳 1. Local & VPS Deployment with Docker Compose

CampusNet Analyzer provides an automated multi-container Docker Compose setup with persistent SQLite data storage, discrete-event SimPy simulation, and an Nginx reverse proxy for the frontend.

```bash
# Clone the verified repository
git clone https://github.com/ramcharankuni43/CampusNet-Analyzer.git
cd CampusNet-Analyzer

# Build and start services in detached mode
docker-compose up -d --build
```

### Container Architecture:
- **`campusnet_backend`**: FastAPI application running Python 3.11 with the SimPy discrete-event simulation engine.
- **`campusnet_frontend`**: Production Nginx container serving compiled React 18 + TypeScript + Recharts assets.
- **`campusnet_backend_data`**: Persistent Docker volume mounted at `/app/data` to ensure SQLite database records survive container recreation.

### Verified Endpoints:
- **Frontend SPA**: `http://localhost` (or `http://localhost:5173`)
- **Backend API & Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`
- **Simulator Readiness**: `http://localhost:8000/api/system/status`

To stop:
```bash
docker-compose down
```

---

## 🇮🇳 2. Deploying on Voroa (`https://app.getvoroa.com/new/choose`)

Voroa is an India-first developer cloud hosting platform that connects directly to GitHub.

CampusNet Analyzer provides two deployment options on Voroa:

### ⭐ Option A: Docker Service (Recommended — All-in-One Full-Stack)
> **Why Recommended:** Builds and serves the compiled React Frontend, FastAPI Backend, and native SimPy discrete-event simulation engine inside a single container with zero external binary dependencies.

1. Go to [https://app.getvoroa.com/new/choose](https://app.getvoroa.com/new/choose)
2. Select **Docker Service** (or **Deploy from Dockerfile**).
3. Connect your GitHub repository: `ramcharankuni43/CampusNet-Analyzer`.
4. Configure service settings:
   - **Service Name**: `campusnet-analyzer`
   - **Branch**: `master`
   - **Dockerfile Path**: `./Dockerfile` (or leave default `Dockerfile`)
   - **Port**: `8000`
5. Environment Variables:
   ```env
   PORT=8000
   CORS_ORIGINS=*
   DATA_DIR=/app/data
   ```
6. Add a Persistent Disk / Volume mounted at `/app/data` to preserve experiment history across deploys.
7. Click **Deploy**.
8. Once deployment finishes, Voroa provides your live URL: `https://campusnet-analyzer.getvoroa.com` (or your chosen subdomain).

---

### Option B: Separate Web Service (Backend) + Static Site (Frontend)

If you prefer deploying the frontend and backend as two independent cloud services:

#### Step 1: Deploy Backend (Web Service)
1. At [https://app.getvoroa.com/new/choose](https://app.getvoroa.com/new/choose), choose **Web Service**.
2. Connect `ramcharankuni43/CampusNet-Analyzer`.
3. Configure:
   - **Branch**: `master`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3.11+`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add Persistent Volume at `/app/data` and set `DATA_DIR=/app/data`.
5. Deploy and note your backend URL (e.g. `https://campusnet-api.getvoroa.com`).

#### Step 2: Deploy Frontend (Static Site)
1. At [https://app.getvoroa.com/new/choose](https://app.getvoroa.com/new/choose), choose **Static Site**.
2. Connect `ramcharankuni43/CampusNet-Analyzer`.
3. Configure:
   - **Branch**: `master`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Environment Variables**:
     ```env
     VITE_API_BASE=https://campusnet-api.getvoroa.com/api
     VITE_WS_URL=wss://campusnet-api.getvoroa.com/api/simulations
     ```
4. Click **Deploy**.

---

## ☁️ 3. Other Cloud Hosting Platforms

### Render (Blueprint / Docker)
1. Create a New Web Service on [Render](https://render.com).
2. Connect repository `ramcharankuni43/CampusNet-Analyzer` (branch: `master`).
3. Select **Docker** environment. Render automatically picks up `Dockerfile`.
4. Set health check path: `/api/health`.
5. Add a Persistent Disk mounted at `/app/data` (1 GB is sufficient).

### Railway / Fly.io
- **Railway**: Connect GitHub repo `ramcharankuni43/CampusNet-Analyzer`. Railway auto-detects `Dockerfile`, binds `$PORT`, and mounts persistent volumes via the dashboard.
- **Fly.io**: Run `fly launch` in project root. Set persistent volume mount to `/app/data`.

---

## ⚙️ Environment Variables Reference

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `8000` | HTTP port for backend / container |
| `HOST` | `0.0.0.0` | Host bind address |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated or `*`) |
| `DATA_DIR` | `.` | Persistent storage directory for SQLite database |
| `DATABASE_PATH` | `None` | Optional explicit path to SQLite database file |
| `DATABASE_URL` | `sqlite:///<DATA_DIR>/edunet.db` | SQLite or PostgreSQL connection string |
| `SIMULATION_DIR` | `./simulation` | Directory where simulation artifacts are generated |
| `STATIC_DIR` | `./frontend/dist` | Directory containing compiled React SPA files |
| `VITE_API_BASE` | `/api` | Base path for frontend API calls |
| `VITE_WS_URL` | *(Derived from host)* | WebSocket endpoint for real-time telemetry |

---

## 🛡️ Production Verification Checklist

- [x] Backend automated tests passing (`pytest` covering SimPy engine, metrics, API, persistence)
- [x] Frontend TypeScript type check (`npx tsc --noEmit`) passing with 0 errors
- [x] Frontend production build (`npm run build`) passing with compiled `dist/`
- [x] One-click Windows startup script (`start.bat`) with automatic virtual environment verification
- [x] Persistent Docker volume `campusnet_backend_data` mapped to `/app/data`
- [x] Native SimPy simulation engine operational out-of-the-box on Windows/Linux/macOS
- [x] Separate Demo Mode for instant offline demonstration with calibrated reference records
- [x] Healthcheck endpoint `/api/health` decoupled from simulation load
- [x] SQLite WAL mode enabled for high-concurrency simulation persistence
