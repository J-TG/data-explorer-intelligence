.PHONY: help install seed run setup run-dev check-env stop kill-port

PORT ?= 8000

help:
	@echo "Targets:"
	@echo "  install  Install Python dependencies (pip3)"
	@echo "  seed     Seed Neo4j with lineage data"
	@echo "  run      Run the FastAPI app with Uvicorn"
	@echo "  setup    Install dependencies and seed the database"
	@echo "  run-dev  Check env, install deps, seed, and run the app"

check-env:
	@if [ ! -f .env ]; then \
		echo "Missing .env. Copy .env.example to .env and update Neo4j credentials." >&2; \
		exit 1; \
	fi

install:
	pip3 install -r requirements.txt

seed:
	PYTHONPATH=. python3 graph/seed_wave2.py --path dependency_data/wave2_dependencies.txt

run:
	@$(MAKE) kill-port
	@echo "🚀 Starting FastAPI on port $(PORT)..."
	PYTHONPATH=. python3 -m uvicorn app.web_app:app --reload --port $(PORT)

setup: install seed

run-dev: check-env setup run

kill-port:
	@echo "🔍 Checking for processes on port $(PORT)..."
	@if command -v lsof >/dev/null 2>&1; then \
		lsof -ti tcp:$(PORT) | xargs kill -9 2>/dev/null || true; \
	else \
		echo "lsof not found; skipping port $(PORT) shutdown check"; \
	fi
	@echo "✅ Port $(PORT) is free"

stop: kill-port
