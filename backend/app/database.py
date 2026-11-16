import os
import shutil
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Database location resolution with persistent Docker volume support:
# 1. Explicit DATABASE_PATH env var
# 2. Persistent DATA_DIR env var (e.g. /app/data in Docker)
# 3. Local directory fallback (BASE_DIR)
DATA_DIR = os.getenv("DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)

if os.getenv("DATABASE_PATH"):
    DB_PATH = os.getenv("DATABASE_PATH")
else:
    target_edunet = os.path.join(DATA_DIR, "edunet.db")
    target_campusnet = os.path.join(DATA_DIR, "campusnet.db")
    source_edunet = os.path.join(BASE_DIR, "edunet.db")

    if os.path.exists(target_campusnet):
        DB_PATH = target_campusnet
    elif os.path.exists(target_edunet):
        DB_PATH = target_edunet
    elif DATA_DIR != BASE_DIR and os.path.exists(source_edunet):
        # Seed persistent volume with existing database on first container creation
        try:
            shutil.copy2(source_edunet, target_edunet)
            DB_PATH = target_edunet
        except Exception:
            DB_PATH = target_edunet
    else:
        DB_PATH = target_edunet

# CampusNet Analyzer uses SQLite exclusively
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
if not DATABASE_URL.startswith("sqlite"):
    # Enforce SQLite only
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Ensure directory exists for sqlite file
sqlite_file = DATABASE_URL.replace("sqlite:///", "")
if sqlite_file and not sqlite_file.startswith(":memory:"):
    os.makedirs(os.path.dirname(os.path.abspath(sqlite_file)), exist_ok=True)

connect_args = {
    "check_same_thread": False,
    "timeout": 30.0  # Wait up to 30s during concurrent transactions
}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

# Enable WAL mode and busy timeout for SQLite to support concurrent simulation readers and writers
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    """Initializes tables and performs lightweight migrations for SQLite if needed."""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        # Check existing columns on experiments table using PRAGMA table_info
        try:
            res = conn.exec_driver_sql("PRAGMA table_info(experiments)").fetchall()
            col_names = [row[1] for row in res] if res else []
            if col_names:
                if "delay" not in col_names:
                    conn.exec_driver_sql("ALTER TABLE experiments ADD COLUMN delay VARCHAR(32) DEFAULT '20ms'")
                if "output_dir" not in col_names:
                    conn.exec_driver_sql("ALTER TABLE experiments ADD COLUMN output_dir VARCHAR(256)")
                if "error_message" not in col_names:
                    conn.exec_driver_sql("ALTER TABLE experiments ADD COLUMN error_message TEXT")
                conn.commit()
        except Exception:
            pass

def get_db():
    try:
        db = SessionLocal()
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Database service unavailable: {str(e)}"
        )
    try:
        yield db
    finally:
        db.close()
