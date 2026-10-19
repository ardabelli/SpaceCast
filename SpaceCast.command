#!/bin/zsh
# SpaceCast'i başlatır (macOS): gerekirse kurar, derler ve tarayıcıda açar.
# Bu pencere açık kaldıkça sunucu çalışır; kapatınca durur.
cd "$(dirname "$0")"
PORT=${PORT:-5199}
if ! command -v node >/dev/null; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden 24 LTS sürümünü kurup tekrar dene."
  read; exit 1
fi
if curl -sf "localhost:$PORT/health" >/dev/null; then open "http://localhost:$PORT"; exit 0; fi
[ -d node_modules ] || npm install || { read; exit 1; }
(for i in {1..60}; do curl -sf "localhost:$PORT/health" >/dev/null && { open "http://localhost:$PORT"; break; }; sleep 1; done) &
SPACECAST_NO_OPEN=1 npm start
