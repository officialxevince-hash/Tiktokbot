#!/bin/zsh

# Backend startup script that kills existing instances on port 3000

PORT=${PORT:-3000}

echo "Checking for processes using port $PORT..."

# Find and kill processes using the port
PID=$(lsof -ti:$PORT)

if [ -n "$PID" ]; then
  echo "Found process(es) using port $PORT: $PID"
  echo "Killing process(es)..."
  kill -9 $PID
  sleep 1
  echo "Process(es) killed."
else
  echo "No processes found using port $PORT."
fi

# Start the server
echo "Starting backend server on port $PORT..."
bun run dev

