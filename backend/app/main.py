import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, status, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

# Ensure module can be run directly as a script or imported from workspace root or backend
_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_current_dir)
_root_dir = os.path.dirname(_backend_dir)
for _p in (_backend_dir, _root_dir, _current_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from .database import engine, Base, SessionLocal, init_db, get_db
    from .models import Experiment
    from .services.seed_data import seed_database
    from .services.simulation_service import check_ns2_installation
    from .api import dashboard, experiments, simulations, reports, system
except (ImportError, ValueError):
    from app.database import engine, Base, SessionLocal, init_db, get_db
    from app.models import Experiment
    from app.services.seed_data import seed_database
    from app.services.simulation_service import check_ns2_installation
    from app.api import dashboard, experiments, simulations, reports, system

logger = logging.getLogger("edunet.api")

# Application lifespan for DB init and initial seeding
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and migrations
    init_db()
    
    # Check and automatically seed calibrated academic benchmarks if DB is fresh
    db = SessionLocal()
    try:
        if db.query(Experiment).count() == 0:
            print("[EduNet Analyzer] First run detected: Seeding academic laboratory baseline experiments...")
            seed_database(db, force=False)
            print("[EduNet Analyzer] Database seeded successfully.")
    except Exception as e:
        print(f"[EduNet Analyzer] Warning during database seeding: {e}")
    finally:
        db.close()
    
    yield

app = FastAPI(
    title="CampusNet-Analyzer API",
    description="University Campus & E-Learning Network Performance Simulation & Analysis Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        errors.append(f"{loc}: {err.get('msg', 'Invalid value')}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "detail": "; ".join(errors) if errors else "Invalid request parameters",
            "validation_errors": jsonable_encoder(exc.errors())
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTP Error",
            "detail": exc.detail,
            "status_code": exc.status_code
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": "An internal server error occurred while processing the request. Details logged safely.",
            "status_code": 500
        }
    )

# Enable CORS with localhost regex support
cors_env = os.getenv("CORS_ORIGINS", "*")
if cors_env.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    origins = [orig.strip() for orig in cors_env.split(",") if orig.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Register API Routers under /api
app.include_router(dashboard.router, prefix="/api")
app.include_router(experiments.router, prefix="/api")
app.include_router(simulations.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(system.router, prefix="/api")

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    ns_info = check_ns2_installation()
    return {
        "status": "online" if db_ok else "degraded",
        "service": "CampusNet-Analyzer API",
        "version": "1.0.0",
        "database": {
            "connected": db_ok,
            "engine": "sqlite"
        },
        "simulator": {
            "ns2_installed": ns_info.get("installed", False),
            "execution_mode": ns_info.get("execution_mode", "DEMO MODE — Sample Data"),
            "diagnostic": ns_info.get("diagnostic", "")
        }
    }

# Static file serving & SPA Fallback for production deployment
STATIC_DIR = os.getenv("STATIC_DIR")
if not STATIC_DIR:
    possible_paths = [
        # In unified container or standard repo layout where frontend dist is compiled
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend", "dist"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"),
        "/app/frontend/dist"
    ]
    for p in possible_paths:
        if os.path.exists(p) and os.path.isdir(p):
            STATIC_DIR = p
            break

if STATIC_DIR and os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API routes to be handled by routers
        if full_path.startswith("api/"):
            return {"error": "API route not found", "path": full_path}
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"error": "Frontend build not found", "path": full_path}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"[EduNet Analyzer] Starting server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
