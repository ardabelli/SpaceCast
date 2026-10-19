@echo off
rem SpaceCasti baslatir (Windows): gerekirse kurar, derler ve tarayicida acar.
rem Bu pencere acik kaldikca sunucu calisir; kapatinca durur.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js bulunamadi. https://nodejs.org adresinden 24 LTS surumunu kurup tekrar dene. & pause & exit /b 1)
curl -sf http://localhost:5199/health >nul 2>nul && (start "" http://localhost:5199 & exit /b 0)
if not exist node_modules (call npm install || (pause & exit /b 1))
set SPACECAST_NO_OPEN=1
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:5199/health | Out-Null; Start-Process http://localhost:5199; break}catch{Start-Sleep 1}}"
call npm start
pause
