.PHONY: dev install seed

dev:
	@echo "Starting all services..."
	(cd backend && uvicorn main:app --reload --port 8000) &
	(cd frontend && npm run dev -- --port 5173) &
	(cd admin && npm run dev -- --port 5174) &
	(cd advertiser && npm run dev -- --port 5175) &
	wait

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install
	cd admin && npm install
	cd advertiser && npm install

seed:
	cd backend && python db/seed.py
