// Actualizaciones automaticas (electron-updater) contra el repositorio dedicado
// "movisync-releases" en GitHub. Ese repositorio es PRIVADO y contiene UNICAMENTE los
// instaladores publicados (no el codigo fuente de la app), asi que la app instalada en la PC
// del cliente necesita un token de GitHub para poder leerlo -ese token es de SOLO LECTURA
// (permiso "Contents: Read-only") sobre movisync-releases unicamente. Se genera como token
// "fine-grained" en GitHub y se guarda en el secreto UPDATER_TOKEN del repositorio de codigo
// (fa-01).
//
// El token se entrega a la app empaquetada como un "recurso extra" (extraResources en
// package.json), NO como un archivo .js normal dentro de electron/ -esto ultimo se probo
// primero pero electron-builder no lo estaba incluyendo dentro del instalador final (por eso
// el registro decia "no existe" aunque el archivo si se generaba bien en GitHub Actions).
// Con extraResources, el archivo queda garantizado junto al .exe, en la carpeta "resources",
// sin pasar por el empaquetado normal del codigo. Se genera durante la compilacion en GitHub
// Actions (ver .github/workflows/build.yml) y NUNCA se sube al repositorio -sin el (por
// ejemplo corriendo "npm run dev" en tu PC), la revision de actualizaciones simplemente queda
// desactivada, sin romper nada.
const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');

// Registro en disco de todo lo que hace el auto-actualizador (que casi nunca se ve en pantalla,
// porque la app empaquetada no tiene consola visible), para poder diagnosticar desde afuera por
// que no detecto/descargo una version sin tener que adivinar. Vive junto a la base de datos, en
// la carpeta de datos del programa (algo como C:\Users\<usuario>\AppData\Roaming\MoviSync\).
function rutaLog() {
  return path.join(app.getPath('userData'), 'actualizaciones.log');
}

function log(mensaje) {
  const linea = `[${new Date().toLocaleString('es-VE')}] ${mensaje}\n`;
  try {
    fs.appendFileSync(rutaLog(), linea);
  } catch (err) {
    // Si ni siquiera se puede escribir el log, no hay nada mas que hacer aqui -no debe romper
    // el resto de la app por esto.
  }
}

// process.resourcesPath apunta a la carpeta "resources" al lado del .exe cuando la app esta
// instalada/empaquetada, y a una carpeta temporal de Electron cuando corres "npm run dev" (por
// eso el try/catch: en desarrollo simplemente no existe el archivo, y eso esta bien).
function leerTokenActualizador() {
  const ruta = path.join(process.resourcesPath, 'updater-token.json');
  try {
    const contenido = fs.readFileSync(ruta, 'utf8');
    const datos = JSON.parse(contenido);
    return (datos.token || '').trim() || null;
  } catch (err) {
    log(`No se pudo leer ${ruta} (normal si corres "npm run dev" en tu PC): ${err.message}`);
    return null;
  }
}

let yaConfigurado = false;

function configurarAutoActualizacion(mainWindow) {
  if (yaConfigurado) return; // evita configurarlo 2 veces si createWindow() se llama de nuevo (app.on('activate'))
  yaConfigurado = true;

  log(`Iniciando MoviSync version ${app.getVersion()}`);

  const tokenPrivado = leerTokenActualizador();
  if (!tokenPrivado) {
    log('Revision de actualizaciones desactivada: no hay token valido.');
    return;
  }
  log(`Token de actualizaciones cargado (termina en ...${tokenPrivado.slice(-6)}).`);

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'juancarlos-star',
    repo: 'movisync-releases',
    private: true,
    token: tokenPrivado
  });

  autoUpdater.on('checking-for-update', () => {
    log('Revisando si hay una version nueva en movisync-releases...');
  });

  autoUpdater.on('update-available', (info) => {
    log(`Version nueva encontrada: ${info.version}. Empezando descarga en segundo plano...`);
  });

  autoUpdater.on('update-not-available', (info) => {
    log(`No hay version nueva. La mas reciente publicada es ${info.version}, y esta PC ya tiene ${app.getVersion()}.`);
  });

  autoUpdater.on('download-progress', (p) => {
    log(`Descargando actualizacion: ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(`Descarga completa de la version ${info.version}. Mostrando aviso para instalar.`);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualizacion lista',
      message: `Hay una nueva version de MoviSync (${info.version}) descargada y lista para instalar.`,
      detail: 'El programa se va a cerrar para instalarla. Guarda cualquier trabajo pendiente antes de continuar.',
      buttons: ['Instalar ahora', 'Instalar al cerrar el programa'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    log(`ERROR revisando actualizaciones: ${err == null ? 'desconocido' : (err.stack || err.message)}`);
  });

  // Revisa al abrir el programa, y despues cada 4 horas mientras quede encendido (la tienda
  // suele dejar la PC prendida todo el dia).
  autoUpdater.checkForUpdates().catch((err) => log(`ERROR al llamar checkForUpdates(): ${err && err.message}`));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => log(`ERROR al llamar checkForUpdates(): ${err && err.message}`));
  }, 4 * 60 * 60 * 1000);
}

module.exports = { configurarAutoActualizacion };
