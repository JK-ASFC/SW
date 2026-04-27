@echo off
title Burger Quiz — Serveur local
echo.
echo  ============================================
echo    BURGER QUIZ — Demarrage du serveur local
echo  ============================================
echo.
echo  Le serveur demarre sur http://localhost:8000
echo  Fermez cette fenetre pour arreter le serveur.
echo.

:: Ouvrir le navigateur apres 1 seconde
ping 127.0.0.1 -n 2 >nul
start "" "http://localhost:8000"

:: Lancer le serveur Python dans le dossier courant
python -m http.server 8000

pause