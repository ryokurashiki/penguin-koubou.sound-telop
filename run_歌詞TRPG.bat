@echo off
cd /d "%~dp0"
echo ==========================================
echo TRPGツール 開発サーバー起動スクリプト
echo ==========================================
echo.
echo 開発サーバーを起動しています...
echo 自動的にブラウザで http://localhost:3000 が開きます。
echo 終了するには、このウィンドウで Ctrl + C を押してください。
echo.
start "" "http://localhost:3000"
npm run dev
