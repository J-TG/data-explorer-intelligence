#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and update Neo4j credentials." >&2
  exit 1
fi

pip3 install -r requirements.txt
PYTHONPATH=. python3 graph/seed.py
PYTHONPATH=. python3 -m uvicorn app.web_app:app --reload --port 8000
