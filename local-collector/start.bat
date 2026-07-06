@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Python이 설치되어 있지 않습니다.
    echo  https://python.org 에서 설치할 때 "Add Python to PATH" 체크 필수!
    echo.
    pause
    exit /b
)

echo 필요한 패키지 확인 중... (처음 한 번만 시간이 걸립니다)
python -m pip install -q -r requirements.txt

start "" http://127.0.0.1:8747
python app.py
pause
