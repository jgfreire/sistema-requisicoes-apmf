@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em nodejs.org e tente de novo. & pause & exit /b 1)
if not exist node_modules (
  echo Primeira execucao: instalando, aguarde...
  call npm install
)
rem Se o sistema ja estiver aberto em outra janela, apenas abre o navegador.
netstat -ano | findstr /R /C:":4200 .*LISTENING" >nul && (
  echo O sistema ja esta aberto. Abrindo o navegador...
  start "" http://localhost:4200
  timeout /t 3 >nul
  exit /b 0
)
start "" http://localhost:4200
node src\server.js
echo.
echo O sistema parou. Se apareceu uma mensagem de erro acima, anote-a.
pause
