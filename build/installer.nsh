; Este archivo lo usa electron-builder (ver "build.nsis.include" en package.json) para agregarle
; comportamiento extra al instalador de Windows generado con NSIS.
;
; DESACTIVADO (ver historial de este archivo para el codigo original): el macro de aqui abajo
; intentaba autoborrar el .exe del instalador al terminar, para que no quedara regado en
; Descargas. Era solo prolijidad estetica -la proteccion real contra reventa siempre fue el
; sistema de activacion por licencia (electron/licencia.js), esto no la afectaba para nada.
;
; Se desactivo porque el truco (escribir un .bat temporal en %TEMP% que se autoborra y borra el
; .exe) hacia que, en algunas instalaciones, Windows Defender u otro antivirus borrara ese .bat
; por su cuenta -apenas creado y antes de que llegara a ejecutarse- al confundir el patron
; "script que se autodestruye y borra un .exe" con el de un malware limpiando su rastro. El
; resultado visible era una ventana negra de cmd con el error "No se ha encontrado el archivo
; por lotes." en cada instalacion. Como el beneficio era puramente cosmetico, no vale la pena el
; riesgo de que un antivirus la marque o bloquee la instalacion.
;
; Si en el futuro se quiere recuperar el autoborrado con menos riesgo de falso positivo, conviene
; explorar otra tecnica (por ejemplo moveFileEx con MOVEFILE_DELAY_UNTIL_REBOOT via NSIS, en vez
; de un .bat que hace su propio "delete-self") en lugar de simplemente reactivar este mismo macro.
!macro customInstall
!macroend
