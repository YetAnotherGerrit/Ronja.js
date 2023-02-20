@echo off

if "%1"=="postinstall" (
    mkdir _SECRET
    copy _SECRET.example\config.js _SECRET\config.js
    echo Please open _SECRET\config.js in your favourite editor and add your
    echo clientId, guildId and token at least.
    echo.
    echo After that run: %0 postupdate
    echo.
) else if "%1"=="postupdate" (
    npm install
    node deploy-commands.js
    echo If there was no error message you are ready to run: %0 start
    echo.
) else if "%1"=="start" (
    node index.js
) else (
    echo Please run %0 with one of the following commands:
    echo - %0 postinstall          ^| after installation
    echo - %0 postupdate           ^| after update
    echo - %0 start                ^| to run the bot
    echo.
)
