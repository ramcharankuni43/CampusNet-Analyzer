import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "edunet.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Fix postgres:// URL prefix for modern SQLAlchemy if deployed on Render/Railway/Supabase
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    # Ensure directory exists for sqlite file
    sqlite_file = DATABASE_URL.replace("sqlite:///", "")
    if sqlite_file and not sqlite_file.startswith(":memory:"):
        os.makedirs(os.path.dirname(os.path.abspath(sqlite_file)), exist_ok=True)
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

# Enable WAL mode for SQLite to support concurrent simulation readers and writers
if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db():
    """Initializes tables and performs lightweight migrations for SQLite if needed."""
    Base.metadata.create_all(bind=engine)
    if is_sqlite:
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
                    conn.commit()
            except Exception:
                pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
