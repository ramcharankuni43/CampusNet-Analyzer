"""
EduNet Analyzer - Clean State Reset Utility
Resets the SQLite database, cleans temporary simulation runs, 
and re-seeds baseline experiments (EXP-001 through EXP-008).
"""
import os
import sys
import shutil

# Ensure backend in sys.path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(root_dir, "backend")
for p in (backend_dir, root_dir):
    if p not in sys.path:
        sys.path.insert(0, p)

from app.database import init_db, SessionLocal
from app.services.seed_data import seed_database

def reset_clean_state():
    print("==================================================")
    print("  EduNet Analyzer - Resetting to Clean State")
    print("==================================================")

    # 1. Clean simulation runs directory
    runs_dir = os.path.join(root_dir, "simulation", "runs")
    if os.path.exists(runs_dir):
        print(f"-> Cleaning temporary simulation runs in: {runs_dir}")
        for item in os.listdir(runs_dir):
            item_path = os.path.join(runs_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                else:
                    os.remove(item_path)
            except Exception as e:
                print(f"   Warning: could not remove {item_path}: {e}")
    os.makedirs(runs_dir, exist_ok=True)

    # 2. Re-initialize database schema
    print("-> Initializing database schema and WAL mode...")
    init_db()

    # 3. Seed baseline experiments
    print("-> Seeding baseline experiments (EXP-001 through EXP-008)...")
    db = SessionLocal()
    try:
        count = seed_database(db, force=True)
        print(f"-> Successfully seeded {count} baseline experiments.")
    finally:
        db.close()

    print("==================================================")
    print("  Application is in clean, presentation-ready state!")
    print("==================================================")

if __name__ == "__main__":
    reset_clean_state()

