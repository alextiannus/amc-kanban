"""Compatibility command: rebuild archives from the unified canonical package."""
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / "packages/amc-skills/scripts/manage.py"), "build", "--archive-dir", str(root / "public/skills")], check=True)
