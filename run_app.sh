#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and update Neo4j credentials." >&2
  exit 1
fi

pip install -r requirements.txt
python graph/seed.py
uvicorn app.web_app:app --reload --port 8000
