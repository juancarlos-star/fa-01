// Actualizaciones automaticas (electron-updater) contra el repositorio dedicado
// "movisync-releases" en GitHub. Ese repositorio es PRIVADO y contiene UNICAMENTE los
// instaladores publicados (no el codigo fuente de la app), asi que la app instalada en la PC
// del cliente necesita un token de GitHub para poder leerlo -ese token es de SOLO LECTURA
// (permiso "Contents: Read-only") sobre movisync-releases unicamente. Se genera como token
// "fine-grained" en GitHub y se guarda en el secreto UPDATER_TOKEN del repositorio de codigo
// (fa-01). El archivo config-updater-privado.js con ese token se genera automaticamente
// durante la compilacion en GitHub Actions (ver .github/workflows/build.yml) y NUNCA se sube
// al repositorio -sin ese archivo (por ejemplo, corriendo "npm run dev" en tu PC), la revision
// de actualizaciones simplemente queda desactivada, sin romper nada.
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

let yaConfigurado = false;

function configurarAutoActualizacion(mainWindow) {
  if (yaConfigurado) return; // evita configurarlo 2 veces si createWindow() se llama de nuevo (app.on('activate'))
  yaConfigurado = true;

  let tokenPrivado = null;
  try {
    tokenPrivado = require('./config-updater-privado').token;
  } catch (err) {
    console.log('No hay electron/config-updater-privado.js (normal si corres "npm run dev" en tu PC): revision de actualizaciones desactivada.');
    return;
  }
  if (!tokenPrivado) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'juancarlos-star',
    repo: 'movisync-releases',
    private: true,
    token: tokenPrivado
  });

  autoUpdater.on('update-downloaded', (info) => {
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
    console.error('Error revisando actualizaciones:', err == null ? 'desconocido' : (err.stack || err.message));
  });

  // Revisa al abrir el programa, y despues cada 4 horas mientras quede encendido (la tienda
  // suele dejar la PC prendida todo el dia).
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

module.exports = { configurarAutoActualizacion };
