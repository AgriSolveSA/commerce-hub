#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/public"
echo "Starting local server at http://localhost:8080"
python3 -m http.server 8080
