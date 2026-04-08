@echo off
echo Starting SmartBot...

:: Start Server
start "SmartBot Server" cmd /k "cd server && npm start"

:: Start Client
start "SmartBot Client" cmd /k "cd client && npm run dev"

echo Application starting...
echo Server running on http://localhost:5000
echo Client running on http://localhost:5173
