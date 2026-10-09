@echo off
chcp 65001 > nul
title HE THONG QUAN LY VA DOI CHIEU DANH SACH THI SINH - 162 DON VI
echo =========================================================================
echo    HE THONG QUAN LY, DOI CHIEU & TONG HOP DANH SACH THI SINH (162 DON VI)
echo =========================================================================
echo.
echo [1/3] Kiem tra Database & Du lieu khoi tao...
node scripts/init_database.js
node scripts/seed_database.js
echo.
echo [2/3] Kiem tra Test Suite Validation Engine 2 Chieu...
node scripts/test_validation_engine.js
echo.
echo [3/3] Khoi dong Web Server tren http://localhost:3000 ...
echo       - Tai khoan Super Admin: admin / Admin@123456
echo       - Tai khoan Don vi mau:  unit_8802 / Unit@123456 (Chi nhanh Lao Cai II)
echo                                unit_3160 / Unit@123456 (Chi nhanh Soc Son)
echo.
start http://localhost:3000
npm run start
pause
