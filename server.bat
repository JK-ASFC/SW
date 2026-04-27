@echo off
setlocal enabledelayedexpansion

:: Vérification des droits administrateur
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Ce script nécessite des droits administrateur.
    echo Relance en cours avec élévation de privilèges...

    :: Création d'un script VBS pour demander les droits admin
    set "vbscript=%temp%\getadmin.vbs"
    (
        echo Set UAC = CreateObject^("Shell.Application"^)
        echo UAC.ShellExecute "%~s0", "", "", "runas", 1
    ) > "%vbscript%"

    :: Exécution du script VBS
    "%temp%\getadmin.vbs"
    del "%temp%\getadmin.vbs" >nul 2>&1
    exit /b
)

:: Vérification de la présence de Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python n'est pas installé. Installation en cours...

    :: Chemin de destination pour l'installateur
    set "installer=%temp%\python_installer.exe"

    :: Téléchargement de l'installateur de Python (version 3.11 pour Windows)
    echo Téléchargement de l'installateur de Python...
    powershell -Command "(New-Object Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.11.0/python-3.11.0-amd64.exe', '%installer%')"

    :: Vérification du téléchargement
    if not exist "%installer%" (
        echo Échec du téléchargement de l'installateur.
        pause
        exit /b 1
    )

    :: Installation silencieuse de Python (si l'installateur le permet)
    echo Installation silencieuse de Python...
    "%installer%" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0

    :: Suppression de l'installateur après installation
    del "%installer%" >nul 2>&1

    :: Redémarrage du script après installation
    echo Installation terminée. Redémarrage du script...
    timeout /t 3 >nul
    start "" "%~0"
    exit /b
)

:: Recherche du dossier "burger" dans les Téléchargements
set "downloads=%userprofile%\Downloads"
if exist "%downloads%\burger\" (
    set "dossier=%downloads%\burger"
    echo Dossier "burger" trouvé dans Téléchargements : "%dossier%"
) else (
    :: Sinon, sélection manuelle via une boîte de dialogue
    set "vbscript=%temp%\select_folder_%random%.vbs"
    (
        echo Set objShell = CreateObject^("Shell.Application"^)
        echo Set objFolder = objShell.BrowseForFolder^(0, "Sélectionnez le dossier pour le serveur web", 0, ""^)
        echo If Not objFolder Is Nothing Then
        echo     WScript.Echo objFolder.Self.Path
        echo End If
    ) > "%vbscript%"

    for /f "delims=" %%a in ('cscript //nologo "%vbscript%"') do (
        set "dossier=%%a"
    )
    del "%vbscript%" >nul 2>&1

    if "%dossier%"=="" (
        echo Aucun dossier sélectionné.
        pause
        exit /b 1
    )
)

:: Vérification si le dossier existe
if not exist "%dossier%" (
    echo Le dossier "%dossier%" n'existe pas.
    pause
    exit /b 1
)

:: Changement de répertoire
cd /d "%dossier%"

:: Vérification de la présence de index.html
if not exist "index.html" (
    echo Attention : Le fichier index.html n'existe pas dans ce dossier.
)

:: Lancement du serveur web
echo Démarrage du serveur web dans le dossier : "%dossier%"
echo.
echo Pour arrêter le serveur, appuie sur CTRL+C dans cette fenêtre.

:: Démarrage du serveur en arrière-plan
start "" cmd /c python -m http.server 8000 --bind 0.0.0.0

:: Attente de 2 secondes pour laisser le temps au serveur de démarrer
timeout /t 2 >nul

:: Ouverture du navigateur par défaut
start "" "http://localhost:8000"