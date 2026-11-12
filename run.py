"""
CampusNet Analyzer - Root Application Launcher
Provides standardized startup command: python run.py
"""
import os
import sys

# Ensure backend and root directories are in sys.path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(root_dir, "backend")

for p in (backend_dir, root_dir):
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    import uvicorn
    from app.main import app

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    print(f"==================================================")
    print(f"  CampusNet Analyzer - Network Simulation Engine")
    print(f"  Listening on: http://{host}:{port}")
    print(f"==================================================")
    uvicorn.run(app, host=host, port=port)

