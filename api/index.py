import os
import sys

# Allow importing from project root inside Vercel serverless runtime
ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Expose Flask app as "app" for Vercel
from app import app  # noqa: E402

