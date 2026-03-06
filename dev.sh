#!/bin/bash
# LanShare Dev Mode - Runs backend + frontend dev server simultaneously

cd "$(dirname "$0")"

echo "🛠️  Starting LanShare in DEV mode..."
echo ""

# Start backend
start_backend() {
    echo "🐍 Starting Python backend..."
    cd backend
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    python3 main.py
}

# Start frontend dev server
start_frontend() {
    echo "⚛️  Starting Vite dev server..."
    sleep 2
    cd frontend
    npm install --silent
    npm run dev
}

# Run both in parallel
start_backend &
BACKEND_PID=$!

start_frontend &
FRONTEND_PID=$!

echo ""
echo "✅ Backend: http://localhost:7734"
echo "✅ Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
