; Este archivo lo usa electron-builder (ver "build.nsis.include" en package.json) para agregarle
; comportamiento extra al instalador de Windows generado con NSIS.
;
; Objetivo: que el .exe del instalador se borre solo despues de terminar la instalacion, para
; que no quede regado en la carpeta de Descargas invitando a que alguien lo reenvie. IMPORTANTE:
; esto es solo prolijidad, NO una proteccion real contra la reventa -alguien podria copiar el
; .exe a otra carpeta ANTES de correrlo. La proteccion real es el sistema de activacion por
; licencia (ver electron/licencia.js).
;
; Como funciona el truco: mientras el instalador esta corriendo, Windows NO deja borrar su
; propio archivo .exe (esta "bloqueado" por el propio proceso). La solucion estandar es que el
; instalador, justo antes de cerrarse, lance un archivo .bat aparte que:
;   1. Espera en un bucle a que el .exe del instalador realmente termine de cerrarse (recien ahi
;      Windows libera el archivo y se puede borrar).
;   2. Borra el .exe del instalador.
;   3. Se borra a si mismo al final, para no dejar ni el .bat temporal.
!macro customInstall
  FileOpen $0 "$TEMP\movisync_borrar_instalador.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 ':intentar$\r$\n'
  FileWrite $0 'del /f /q "$EXEPATH" >nul 2>&1$\r$\n'
  FileWrite $0 'if exist "$EXEPATH" ($\r$\n'
  FileWrite $0 '  timeout /t 1 /nobreak >nul$\r$\n'
  FileWrite $0 '  goto intentar$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'del /f /q "%~f0"$\r$\n'
  FileClose $0
  Exec '"$SYSDIR\cmd.exe" /c start "" /min "$TEMP\movisync_borrar_instalador.bat"'
!macroend
