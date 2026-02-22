@echo off
echo Starting local server at http://localhost:8080
cd public
python -m http.server 8080
pause
