const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb, initDb, cerrarDb, getDbPath } = require('./db');

// ---------- Helpers de STOCK POR DEPOSITO (accesorios) ----------
// Los accesorios no tienen unidad individual (IMEI/codigo), asi que su stock por deposito se
// lleva como una cantidad en la tabla product_stock_deposito. products.stock_cantidad se sigue
// manteniendo como el TOTAL sumado de todos los depositos (por eso siempre se ajusta junto con
// el stock del deposito puntual), para no romper ninguna pantalla que todavia use el total.
function obtenerStockDeposito(db, productId, depositoId) {
  if (!depositoId) return null;
  const row = db.prepare('SELECT cantidad FROM product_stock_deposito WHERE product_id = ? AND deposito_id = ?').get(productId, depositoId);
  return row ? row.cantidad : 0;
}

function ajustarStockDeposito(db, productId, depositoId, delta) {
  db.prepare(
    `INSERT INTO product_stock_deposito (product_id, deposito_id, cantidad) VALUES (?, ?, ?)
     ON CONFLICT(product_id, deposito_id) DO UPDATE SET cantidad = cantidad + excluded.cantidad`
  ).run(productId, depositoId, delta);
  db.prepare('UPDATE products SET stock_cantidad = stock_cantidad + ? WHERE id = ?').run(delta, productId);
}

function depositoValido(db, depositoId) {
  if (!depositoId) return null;
  return db.prepare('SELECT * FROM depositos WHERE id = ? AND activo = 1').get(depositoId);
}

// Envoltorio de seguridad para TODOS los canales IPC: si un handler lanza una excepcion no
// controlada (por ejemplo, por un desajuste de esquema en la base de datos), electron rechaza
// la promesa en el renderer. Cuando esa promesa no tiene un .catch(), el error se pierde en
// silencio: el usuario ve que "no pasa nada" al presionar un boton (sin mensaje de error), que
// es exactamente lo que se reporto con "Crear usuario". Con este envoltorio, cualquier error
// inesperado se registra en consola y se devuelve como { ok:false, message } para que la
// pantalla pueda mostrarlo.
const _ipcHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (canal, listener) => {
  _ipcHandle(canal, async (event, ...args) => {
    try {
      return await listener(event, ...args);
    } catch (err) {
      console.error(`Error inesperado en el canal IPC "${canal}":`, err);
      return { ok: false, message: 'Error inesperado: ' + (err && err.message ? err.message : String(err)) };
    }
  });
};

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    initDb();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// ---------- IPC: forzar el foco de la ventana a nivel de sistema operativo ----------
// Los dialogos nativos (confirm/alert) le quitan la activacion de la ventana al SO.
// window.focus() desde el renderer no siempre la recupera; mainWindow.focus() del
// proceso principal si lo hace de forma confiable.
ipcMain.handle('window:focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  return { ok: true };
});

// ---------- Utilidad: guardar un PDF en disco sin fallar si el archivo ya esta abierto ----------
// Si el mismo archivo ya esta abierto en un visor de PDF (Windows lo deja bloqueado, error
// EBUSY/EPERM/EACCES), en vez de mostrar un error se guarda con un sufijo " (1)", " (2)", etc.
// para no perder el documento ni interrumpir al usuario.
function guardarPdfEvitandoBloqueo(carpetaBase, nombreFinal, buffer) {
  const ext = path.extname(nombreFinal);
  const base = nombreFinal.slice(0, nombreFinal.length - ext.length);
  let nombreActual = nombreFinal;
  let intento = 0;
  while (true) {
    const filePath = path.join(carpetaBase, nombreActual);
    try {
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (err) {
      const archivoBloqueado = err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES');
      if (!archivoBloqueado || intento >= 20) throw err;
      intento += 1;
      nombreActual = `${base} (${intento})${ext}`;
    }
  }
}

function prepararGuardadoPDF(nombreArchivo, base64, subcarpeta) {
  const carpetaBase = path.join(app.getPath('documents'), 'Facturacion Movistar', subcarpeta || 'PDFs');
  if (!fs.existsSync(carpetaBase)) fs.mkdirSync(carpetaBase, { recursive: true });
  const nombreSeguro = String(nombreArchivo || 'documento').replace(/[\\/:*?"<>|]/g, '-');
  const nombreFinal = nombreSeguro.toLowerCase().endsWith('.pdf') ? nombreSeguro : `${nombreSeguro}.pdf`;
  const buffer = Buffer.from(base64, 'base64');
  return guardarPdfEvitandoBloqueo(carpetaBase, nombreFinal, buffer);
}

// ---------- Utilidad: mostrar un PDF en una ventana propia de la app (no delegar al visor
// externo por defecto de Windows) ----------
// Antes se usaba shell.openPath(), que abre el PDF con el programa que el usuario tenga
// configurado por defecto (ej. Adobe Acrobat). El problema: Acrobat es un programa APARTE que
// sigue corriendo en segundo plano aunque se reinstale esta app entre pruebas, y cuando se
// vuelve a generar un archivo con el MISMO nombre (ej. "Factura-000002.pdf", tras reiniciar la
// base de datos), Acrobat podia mostrar una pestaña vieja con contenido cacheado/desactualizado
// (se veia en negro) junto a la nueva. Mostrando el PDF en una ventana propia de Electron, cada
// factura se lee siempre fresca desde el disco, sin ningun cache externo que se desincronice.
function abrirPdfEnVentanaPropia(filePath, titulo) {
  const ventana = new BrowserWindow({
    width: 950,
    height: 1000,
    title: titulo || path.basename(filePath),
    webPreferences: { plugins: true }
  });
  ventana.setMenuBarVisibility(false);
  ventana.loadFile(filePath);
  return ventana;
}

// ---------- Utilidad: imprimir un PDF automaticamente en segundo plano ----------
// Abre el PDF en una ventana oculta (usando el visor de PDF integrado de Chromium) y lo manda
// directo a la impresora predeterminada del sistema apenas termina de cargar, SIN mostrar el
// dialogo de impresion de Windows (impresion 100% silenciosa, sin que el usuario tenga que
// confirmar nada).
function imprimirPdfEnSegundoPlano(filePath) {
  return new Promise((resolve) => {
    const ventanaImpresion = new BrowserWindow({
      show: false,
      webPreferences: { plugins: true }
    });

    const finalizar = () => {
      if (!ventanaImpresion.isDestroyed()) ventanaImpresion.close();
      resolve();
    };

    ventanaImpresion.webContents.on('did-finish-load', () => {
      ventanaImpresion.webContents.print({ silent: true, printBackground: true }, () => finalizar());
    });
    ventanaImpresion.webContents.on('did-fail-load', () => finalizar());

    ventanaImpresion.loadFile(filePath).catch(() => finalizar());
  });
}

// ---------- IPC: Guardar y abrir automaticamente un PDF (facturas y reportes) ----------
ipcMain.handle('pdf:guardarYAbrir', async (event, { nombreArchivo, base64, subcarpeta }) => {
  try {
    const filePath = prepararGuardadoPDF(nombreArchivo, base64, subcarpeta);
    abrirPdfEnVentanaPropia(filePath, nombreArchivo);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('Error guardando PDF', err);
    return { ok: false, message: 'Error guardando el PDF: ' + (err?.message || String(err)) };
  }
});

// ---------- IPC: Guardar, abrir e imprimir automaticamente un PDF (compras y facturas) ----------
ipcMain.handle('pdf:guardarAbrirEImprimir', async (event, { nombreArchivo, base64, subcarpeta }) => {
  try {
    const filePath = prepararGuardadoPDF(nombreArchivo, base64, subcarpeta);
    abrirPdfEnVentanaPropia(filePath, nombreArchivo);
    await imprimirPdfEnSegundoPlano(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('Error guardando/imprimiendo PDF', err);
    return { ok: false, message: 'Error guardando el PDF: ' + (err?.message || String(err)) };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: Autenticacion ----------
ipcMain.handle('auth:login', (event, { username, password }) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) return { ok: false, message: 'Usuario no encontrado o inactivo' };
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return { ok: false, message: 'Contrasena incorrecta' };
  return {
    ok: true,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
  };
});

// ---------- IPC: Gestion de usuarios ----------
ipcMain.handle('users:list', () => {
  const db = getDb();
  return db.prepare('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id').all();
});

ipcMain.handle('users:create', (event, { username, password, full_name, role }) => {
  const db = getDb();
  const usuarioLimpio = (username || '').trim();
  const nombreLimpio = (full_name || '').trim();
  if (!usuarioLimpio || !nombreLimpio || !password) return { ok: false, message: 'Completa todos los campos' };
  if (!['administrador', 'vendedor'].includes(role)) return { ok: false, message: 'Rol invalido' };
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(usuarioLimpio);
  if (exists) return { ok: false, message: 'Ese nombre de usuario ya existe' };
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, datetime('now','localtime'))"
  ).run(usuarioLimpio, hash, nombreLimpio, role);
  return { ok: true };
});

// Permite editar nombre completo, usuario, rol y (opcionalmente) la contrasena de un usuario
// ya existente. Si newPassword viene vacio o no se envia, la contrasena actual no se toca.
ipcMain.handle('users:update', (event, { id, username, full_name, role, newPassword }) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, message: 'Usuario no encontrado' };

  const usuarioLimpio = (username || '').trim();
  const nombreLimpio = (full_name || '').trim();
  if (!usuarioLimpio || !nombreLimpio) return { ok: false, message: 'El nombre y el usuario no pueden estar vacios' };
  if (!['administrador', 'vendedor'].includes(role)) return { ok: false, message: 'Rol invalido' };

  const duplicado = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(usuarioLimpio, id);
  if (duplicado) return { ok: false, message: 'Ese nombre de usuario ya esta en uso por otro usuario' };

  if (newPassword && newPassword.trim()) {
    const hash = bcrypt.hashSync(newPassword.trim(), 10);
    db.prepare('UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ? WHERE id = ?')
      .run(usuarioLimpio, nombreLimpio, role, hash, id);
  } else {
    db.prepare('UPDATE users SET username = ?, full_name = ?, role = ? WHERE id = ?')
      .run(usuarioLimpio, nombreLimpio, role, id);
  }
  return { ok: true };
});

ipcMain.handle('users:toggleActive', (event, { id }) => {
  const db = getDb();
  const user = db.prepare('SELECT active FROM users WHERE id = ?').get(id);
  if (!user) return { ok: false, message: 'Usuario no encontrado' };
  const newValue = user.active ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newValue, id);
  return { ok: true, active: newValue };
});

ipcMain.handle('users:changePassword', (event, { id, newPassword }) => {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  return { ok: true };
});

// ---------- IPC: Categorias ----------
ipcMain.handle('categories:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM categorias ORDER BY tipo, nombre').all();
});

ipcMain.handle('categories:create', (event, { nombre }) => {
  const db = getDb();
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, message: 'El nombre de la categoria no puede estar vacio' };
  // Toda categoria creada desde Gestion de categorias se comporta igual que "Accesorios":
  // aparece automaticamente como una pestaña nueva en Inventario (Nombre, Precio de venta,
  // Stock minimo, Codigo de barras, Costo unitario de compra; sin stock inicial). Los tipos
  // especiales (equipo/simcard/usim, con IMEI/codigo) son fijos y no se crean desde aqui.
  const tipo = 'accesorio';
  const exists = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)').get(limpio);
  if (exists) return { ok: false, message: 'Esa categoria ya existe' };
  db.prepare("INSERT INTO categorias (nombre, tipo, created_at) VALUES (?, ?, datetime('now','localtime'))").run(limpio, tipo);
  return { ok: true };
});

ipcMain.handle('categories:impacto', (event, { id }) => {
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!cat) return { ok: false, message: 'Categoria no encontrada' };
  const productos = db.prepare('SELECT * FROM products WHERE categoria = ? AND tipo = ?').all(cat.nombre, cat.tipo);
  let unidades = 0;
  productos.forEach((p) => {
    if (p.tipo === 'accesorio') {
      unidades += p.stock_cantidad;
    } else {
      unidades += db.prepare('SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ?').get(p.id).c;
    }
  });
  return { ok: true, categoria: cat, productos: productos.length, unidades };
});

// ---------- IPC: Categorias - impacto, editar, eliminar ----------
ipcMain.handle('categories:impact', (event, { id }) => {
  const db = getDb();
  try {
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    if (!categoria) return { ok: false, message: 'Categoria no encontrada' };

    const productos = db.prepare('SELECT * FROM products WHERE categoria = ?').all(categoria.nombre);

    let unidades = 0;
    if (categoria.tipo === 'accesorio') {
      unidades = productos.reduce((acc, p) => acc + (p.stock_cantidad || 0), 0);
    } else {
      const productIds = productos.map((p) => p.id);
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const row = db.prepare(
          `SELECT COUNT(*) AS c FROM inventory_units WHERE product_id IN (${placeholders})`
        ).get(...productIds);
        unidades = row.c;
      }
    }

    return { ok: true, productos: productos.length, unidades };
  } catch (err) {
    console.error('Error en categories:impact', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});

ipcMain.handle('categories:update', (event, { id, nombre }) => {
  const db = getDb();
  try {
    if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre no puede estar vacio' };
    const nuevoNombre = nombre.trim();

    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    if (!categoria) return { ok: false, message: 'Categoria no encontrada' };

    const duplicada = db.prepare('SELECT id FROM categorias WHERE nombre = ? AND id != ?').get(nuevoNombre, id);
    if (duplicada) return { ok: false, message: `Ya existe una categoria llamada "${nuevoNombre}"` };

    const transaccion = db.transaction(() => {
      db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(nuevoNombre, id);
      // Los productos guardan el nombre de categoria como texto, no el id: hay que sincronizarlos
      db.prepare('UPDATE products SET categoria = ? WHERE categoria = ?').run(nuevoNombre, categoria.nombre);
    });
    transaccion();

    return { ok: true };
  } catch (err) {
    console.error('Error en categories:update', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});

ipcMain.handle('categories:delete', (event, { id }) => {
  const db = getDb();
  try {
    const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    if (!categoria) return { ok: false, message: 'Categoria no encontrada' };

    const productos = db.prepare('SELECT * FROM products WHERE categoria = ?').all(categoria.nombre);

    const transaccion = db.transaction(() => {
      for (const p of productos) {
        db.prepare('DELETE FROM inventory_units WHERE product_id = ?').run(p.id);
        db.prepare('DELETE FROM descargos WHERE product_id = ?').run(p.id);
        db.prepare('DELETE FROM compras WHERE product_id = ?').run(p.id);
        db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
      }
      db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
    });
    transaccion();

    return { ok: true };
  } catch (err) {
    console.error('Error en categories:delete', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});

// ---------- IPC: Inventario - productos ----------
// depositoId es OPCIONAL: si se indica, "stock_disponible" se calcula SOLO con lo que hay en
// ese deposito puntual (usado en Facturacion, Compras y Cargos/Descargos, donde cada operacion
// ocurre en un deposito especifico). Si no se indica, se sigue devolviendo el total general
// (usado en Inventario y Reportes, donde se quiere ver todo el stock junto).
ipcMain.handle('products:list', (event, { tipo, categoria, depositoId } = {}) => {
  const db = getDb();
  let rows;
  if (tipo && categoria) {
    // Filtrado por categoria: usado en Inventario, donde cada categoria (tipo 'accesorio')
    // es su propia pestaña y solo debe mostrar sus propios productos.
    rows = db.prepare('SELECT * FROM products WHERE tipo = ? AND categoria = ? ORDER BY nombre').all(tipo, categoria);
  } else if (tipo) {
    rows = db.prepare('SELECT * FROM products WHERE tipo = ? ORDER BY nombre').all(tipo);
  } else {
    rows = db.prepare('SELECT * FROM products ORDER BY tipo, nombre').all();
  }
  const countStmt = db.prepare(
    "SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ? AND estado = 'disponible'"
  );
  const countStmtDeposito = db.prepare(
    "SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ? AND estado = 'disponible' AND deposito_id = ?"
  );
  return rows.map((p) => {
    if (p.tipo === 'accesorio') {
      const stock = depositoId ? (obtenerStockDeposito(db, p.id, depositoId) || 0) : p.stock_cantidad;
      return { ...p, stock_disponible: stock };
    }
    const c = depositoId ? countStmtDeposito.get(p.id, depositoId).c : countStmt.get(p.id).c;
    return { ...p, stock_disponible: c };
  });
});

// Busqueda por el renglon "Codigo" de Facturacion. Reconoce, en este orden:
//  1) Codigo corto del producto (ej. "ss24") - coincidencia exacta.
//  2) Codigo individual de una unidad (IMEI/ICCID) - por si se lee con la pistola. En ese caso
//     ya se sabe la pieza fisica exacta, asi que se devuelve tambien "unidad_encontrada" para que
//     el frontend la agregue directo sin pedir cantidad ni abrir el selector de unidades.
//  3) Nombre/descripcion del producto - exacto primero, y si no, coincidencia parcial (solo si
//     es unica; si hay varias con ese texto se avisa para que sea mas especifico).
ipcMain.handle('products:buscarPorCodigo', (event, { codigo, depositoId }) => {
  const db = getDb();
  const c = (codigo || '').trim();
  if (!c) return null;

  const calcularStock = (p) => {
    if (p.tipo === 'accesorio') {
      return depositoId ? (obtenerStockDeposito(db, p.id, depositoId) || 0) : p.stock_cantidad;
    }
    if (depositoId) {
      return db.prepare(
        "SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ? AND estado = 'disponible' AND deposito_id = ?"
      ).get(p.id, depositoId).c;
    }
    return db.prepare(
      "SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ? AND estado = 'disponible'"
    ).get(p.id).c;
  };

  // 1) Codigo corto del producto
  let p = db.prepare('SELECT * FROM products WHERE codigo_producto = ? COLLATE NOCASE').get(c);
  if (p) return { ...p, stock_disponible: calcularStock(p) };

  // 2) Codigo individual (IMEI/ICCID) leido con pistola
  const unidad = db.prepare('SELECT * FROM inventory_units WHERE codigo = ? COLLATE NOCASE').get(c);
  if (unidad) {
    p = db.prepare('SELECT * FROM products WHERE id = ?').get(unidad.product_id);
    if (p) {
      if (unidad.estado !== 'disponible') {
        return { noDisponible: true, nombre: p.nombre, codigo: unidad.codigo };
      }
      if (depositoId && unidad.deposito_id && Number(unidad.deposito_id) !== Number(depositoId)) {
        return { otroDeposito: true, nombre: p.nombre, codigo: unidad.codigo };
      }
      return { ...p, stock_disponible: calcularStock(p), unidad_encontrada: { id: unidad.id, codigo: unidad.codigo } };
    }
  }

  // 3) Nombre / descripcion del producto
  p = db.prepare('SELECT * FROM products WHERE nombre = ? COLLATE NOCASE').get(c);
  if (p) return { ...p, stock_disponible: calcularStock(p) };

  const coincidencias = db.prepare('SELECT * FROM products WHERE nombre LIKE ? COLLATE NOCASE').all(`%${c}%`);
  if (coincidencias.length === 1) {
    return { ...coincidencias[0], stock_disponible: calcularStock(coincidencias[0]) };
  }
  if (coincidencias.length > 1) {
    return { multiplesCoincidencias: true, cantidad: coincidencias.length };
  }

  return null;
});

ipcMain.handle('products:names', (event, { tipo, categoria } = {}) => {
  const db = getDb();
  let rows;
  if (tipo && categoria) {
    rows = db.prepare('SELECT DISTINCT nombre FROM products WHERE tipo = ? AND categoria = ? ORDER BY nombre').all(tipo, categoria);
  } else if (tipo) {
    rows = db.prepare('SELECT DISTINCT nombre FROM products WHERE tipo = ? ORDER BY nombre').all(tipo);
  } else {
    rows = db.prepare('SELECT DISTINCT nombre FROM products ORDER BY nombre').all();
  }
  return rows.map((r) => r.nombre);
});

ipcMain.handle('products:create', (event, data) => {
  const db = getDb();
  const { tipo, nombre, categoria, precio, precio2, stock_minimo, codigo_barras, costo_inicial, codigo_producto } = data;
  if (!tipo || !nombre) return { ok: false, message: 'Tipo y nombre son obligatorios' };

  if (categoria && categoria.trim()) {
    const cat = db.prepare('SELECT tipo FROM categorias WHERE nombre = ?').get(categoria.trim());
    if (!cat || cat.tipo !== tipo) {
      return { ok: false, message: `La categoria "${categoria}" no corresponde a este tipo de producto` };
    }
  }

  // El codigo de producto (filtro usado en Facturacion) es OBLIGATORIO para equipos, SIM y
  // USIM, ya que sin el no hay forma de ubicarlos rapido en el renglon "Codigo" de Facturacion.
  // Para accesorios sigue siendo opcional (para eso ya existe el codigo de barras).
  const codigoProductoLimpio = (codigo_producto || '').trim();
  if (tipo !== 'accesorio' && !codigoProductoLimpio) {
    return { ok: false, message: 'El codigo de producto es obligatorio para equipos, SIM y USIM' };
  }
  if (codigoProductoLimpio) {
    const existenteCodigo = db.prepare('SELECT id FROM products WHERE codigo_producto = ? COLLATE NOCASE').get(codigoProductoLimpio);
    if (existenteCodigo) return { ok: false, message: 'Ese codigo de producto ya esta en uso' };
  }

  // Ya no se admite "stock inicial" al crear el producto: todo el stock debe entrar por el
  // modulo de Compras o por Cargos y Descargos, para que quede su registro correspondiente.
  // El costo indicado aqui solo se guarda como costo promedio de referencia inicial (en 0 stock).
  const costo = parseFloat(costo_inicial) || 0;

  const info = db
    .prepare(
      `INSERT INTO products (tipo, nombre, categoria, precio, precio2, stock_minimo, stock_cantidad, costo_promedio_usd, codigo_barras, codigo_producto, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now','localtime'))`
    )
    .run(
      tipo, nombre, categoria || '', precio || 0, precio2 || 0, stock_minimo || 0,
      costo,
      tipo === 'accesorio' ? (codigo_barras || '') : null,
      codigoProductoLimpio || null
    );

  const productId = info.lastInsertRowid;

  return { ok: true, id: productId };
});

// Permite editar nombre, categoria, precio, stock minimo y (para accesorios) el codigo de
// barras de un producto ya existente, desde la propia pantalla de Inventario.
ipcMain.handle('products:update', (event, { id, nombre, categoria, precio, precio2, stock_minimo, codigo_barras, codigo_producto }) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return { ok: false, message: 'Producto no encontrado' };

  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio) return { ok: false, message: 'El nombre es obligatorio' };

  const categoriaLimpia = (categoria || '').trim();
  if (categoriaLimpia) {
    const cat = db.prepare('SELECT tipo FROM categorias WHERE nombre = ?').get(categoriaLimpia);
    if (!cat || cat.tipo !== product.tipo) {
      return { ok: false, message: `La categoria "${categoriaLimpia}" no corresponde a este tipo de producto` };
    }
  }

  const precioNum = parseFloat(precio);
  if (isNaN(precioNum) || precioNum < 0) return { ok: false, message: 'Precio invalido' };

  // precio2 es opcional: si no se indica, se conserva el valor que ya tenia el producto.
  let precio2Num = product.precio2 || 0;
  if (precio2 !== undefined && precio2 !== null && precio2 !== '') {
    precio2Num = parseFloat(precio2);
    if (isNaN(precio2Num) || precio2Num < 0) return { ok: false, message: 'Precio 2 invalido' };
  }

  const stockMinNum = parseInt(stock_minimo, 10);
  if (isNaN(stockMinNum) || stockMinNum < 0) return { ok: false, message: 'Stock minimo invalido' };

  let codigoBarras = product.codigo_barras;
  if (product.tipo === 'accesorio') {
    codigoBarras = (codigo_barras || '').trim();
    if (codigoBarras) {
      const existente = db.prepare('SELECT id FROM products WHERE codigo_barras = ? AND id != ?').get(codigoBarras, id);
      if (existente) return { ok: false, message: 'Ese codigo de barras ya esta asignado a otro producto' };
    }
  }

  // codigo_producto: si el campo viene en el payload (aunque sea vacio) se actualiza; si no
  // viene (undefined), se conserva el que ya tenia el producto. Obligatorio para equipos, SIM
  // y USIM (para accesorios sigue siendo opcional, ya que tienen codigo de barras).
  let codigoProducto = product.codigo_producto;
  if (codigo_producto !== undefined) {
    const codigoProductoLimpio = (codigo_producto || '').trim();
    if (product.tipo !== 'accesorio' && !codigoProductoLimpio) {
      return { ok: false, message: 'El codigo de producto es obligatorio para equipos, SIM y USIM' };
    }
    if (codigoProductoLimpio) {
      const existenteCodigo = db.prepare('SELECT id FROM products WHERE codigo_producto = ? COLLATE NOCASE AND id != ?').get(codigoProductoLimpio, id);
      if (existenteCodigo) return { ok: false, message: 'Ese codigo de producto ya esta en uso' };
    }
    codigoProducto = codigoProductoLimpio || null;
  } else if (product.tipo !== 'accesorio' && !codigoProducto) {
    return { ok: false, message: 'El codigo de producto es obligatorio para equipos, SIM y USIM' };
  }

  db.prepare(
    'UPDATE products SET nombre = ?, categoria = ?, precio = ?, precio2 = ?, stock_minimo = ?, codigo_barras = ?, codigo_producto = ? WHERE id = ?'
  ).run(nombreLimpio, categoriaLimpia, precioNum, precio2Num, stockMinNum, codigoBarras, codigoProducto, id);

  return { ok: true };
});

ipcMain.handle('products:delete', (event, { id }) => {
  const db = getDb();
  const unitsCount = db.prepare('SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ?').get(id).c;
  if (unitsCount > 0) return { ok: false, message: 'No se puede eliminar: tiene unidades (IMEI/SIM) registradas' };
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { ok: true };
});

ipcMain.handle('products:addStock', (event, { id, cantidad, costoUnitario, usuario }) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return { ok: false, message: 'Producto no encontrado' };
  if (product.tipo !== 'accesorio') return { ok: false, message: 'Solo aplica a accesorios' };
  const n = parseInt(cantidad, 10);
  if (!n || n <= 0) return { ok: false, message: 'Cantidad invalida' };
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Debes indicar el costo unitario de la compra' };

  const stockActual = product.stock_cantidad;
  const costoActual = product.costo_promedio_usd || 0;
  const nuevoStock = stockActual + n;
  const nuevoPromedio = nuevoStock > 0 ? ((stockActual * costoActual) + (n * costo)) / nuevoStock : costo;

  let compraId;
  const transaccion = db.transaction(() => {
    db.prepare('UPDATE products SET stock_cantidad = ?, costo_promedio_usd = ? WHERE id = ?').run(nuevoStock, nuevoPromedio, id);
    compraId = db.prepare(
      `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    ).run(id, product.tipo, product.nombre, costo, n, costo * n, usuario || '').lastInsertRowid;
  });
  transaccion();
  const registro = db.prepare(
    `SELECT c.*, p.nombre AS producto_nombre FROM compras c LEFT JOIN products p ON p.id = c.product_id WHERE c.id = ?`
  ).get(compraId);
  return { ok: true, stock: nuevoStock, costoPromedio: nuevoPromedio, registro };
});

ipcMain.handle('products:updateCosto', (event, { id, costoPromedio }) => {
  const db = getDb();
  const costo = parseFloat(costoPromedio);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Costo invalido' };
  db.prepare('UPDATE products SET costo_promedio_usd = ? WHERE id = ?').run(costo, id);
  return { ok: true };
});

// El codigo de barras de un accesorio nunca es obligatorio (a diferencia del IMEI/codigo de
// equipos, simcards y usim). Este handler permite fijarlo/actualizarlo opcionalmente desde el
// cargo o descargo de accesorio, sin bloquear la operacion si se deja vacio.
ipcMain.handle('products:updateCodigoBarras', (event, { id, codigo_barras }) => {
  const db = getDb();
  const codigo = (codigo_barras || '').trim();
  if (!codigo) return { ok: true, updated: false };
  const existente = db.prepare('SELECT id FROM products WHERE codigo_barras = ? AND id != ?').get(codigo, id);
  if (existente) return { ok: false, message: 'Ese codigo de barras ya esta asignado a otro producto' };
  db.prepare('UPDATE products SET codigo_barras = ? WHERE id = ?').run(codigo, id);
  return { ok: true, updated: true };
});

ipcMain.handle('products:writeOffStock', (event, { id, cantidad, motivo, usuario }) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return { ok: false, message: 'Producto no encontrado' };
  if (product.tipo !== 'accesorio') return { ok: false, message: 'Solo aplica a accesorios' };
  const n = parseInt(cantidad, 10);
  if (!n || n <= 0) return { ok: false, message: 'Cantidad invalida' };
  if (!motivo || !motivo.trim()) return { ok: false, message: 'Debes indicar un motivo para el descargo' };
  if (n > product.stock_cantidad) return { ok: false, message: 'No puedes descargar mas de lo que hay en stock' };
  const nuevoStock = product.stock_cantidad - n;
  let descargoId;
  const transaccion = db.transaction(() => {
    db.prepare('UPDATE products SET stock_cantidad = ? WHERE id = ?').run(nuevoStock, id);
    descargoId = db.prepare(
      `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
       VALUES (?, NULL, ?, ?, ?, datetime('now','localtime'))`
    ).run(id, n, motivo.trim(), usuario || '').lastInsertRowid;
  });
  transaccion();
  const registro = db.prepare(
    `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
     FROM descargos d
     LEFT JOIN products p ON p.id = d.product_id
     LEFT JOIN inventory_units u ON u.id = d.unit_id
     WHERE d.id = ?`
  ).get(descargoId);
  return { ok: true, stock: nuevoStock, registro };
});

// ---------- IPC: Inventario - unidades (IMEI / SIM / USIM) ----------
// depositoId es OPCIONAL: si se indica, solo devuelve las unidades de ese deposito puntual
// (usado en Facturacion y en Cargos/Descargos, para no vender ni descargar unidades que en
// realidad estan fisicamente en otro almacen). Sin depositoId se devuelven todas (Inventario).
ipcMain.handle('units:list', (event, { product_id, depositoId }) => {
  const db = getDb();
  if (depositoId) {
    return db.prepare('SELECT * FROM inventory_units WHERE product_id = ? AND deposito_id = ? ORDER BY created_at DESC').all(product_id, depositoId);
  }
  return db.prepare('SELECT * FROM inventory_units WHERE product_id = ? ORDER BY created_at DESC').all(product_id);
});

ipcMain.handle('units:add', (event, { product_id, codigo, costoUnitario, usuario }) => {
  const db = getDb();
  if (!codigo || !codigo.trim()) return { ok: false, message: 'El codigo no puede estar vacio' };
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Debes indicar el costo de compra' };
  const exists = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?').get(codigo.trim());
  if (exists) return { ok: false, message: 'Ese codigo ya esta registrado' };
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

  let compraId;
  const transaccion = db.transaction(() => {
    const unitInfo = db.prepare(
      `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, created_at)
       VALUES (?, ?, 'disponible', ?, datetime('now','localtime'))`
    ).run(product_id, codigo.trim(), costo);
    compraId = db.prepare(
      `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, unit_id)
       VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now','localtime'), ?)`
    ).run(product_id, product.tipo, product.nombre, costo, costo, usuario || '', unitInfo.lastInsertRowid).lastInsertRowid;
  });
  transaccion();
  const registro = db.prepare(
    `SELECT c.*, p.nombre AS producto_nombre, u.codigo AS unidad_codigo
     FROM compras c
     LEFT JOIN products p ON p.id = c.product_id
     LEFT JOIN inventory_units u ON u.id = c.unit_id
     WHERE c.id = ?`
  ).get(compraId);
  return { ok: true, registro };
});

function calcularRango(codigoInicio, codigoFin) {
  const a = codigoInicio.trim();
  const b = codigoFin.trim();
  if (!a || !b) return { ok: false, message: 'Debes indicar el primer y el ultimo codigo' };

  // Se toma la corrida de digitos al FINAL de cada codigo como la parte que varia (en vez de
  // buscar un prefijo comun caracter a caracter). Esto es lo correcto para codigos numericos
  // de distinta longitud: con "1" y "10" el prefijo-comun-por-caracter deja la parte que
  // cambia vacia en el primero (porque "1" tambien es el primer caracter de "10"), y por eso
  // antes fallaba con "La parte que cambia... debe ser numerica" en rangos como 1 a 10, pero
  // no en rangos como 300 a 309 donde ambos tienen la misma cantidad de digitos.
  const partirDigitosFinales = (s) => {
    let i = s.length;
    while (i > 0 && /\d/.test(s[i - 1])) i--;
    return { prefijo: s.slice(0, i), digitos: s.slice(i) };
  };

  const pa = partirDigitosFinales(a);
  const pb = partirDigitosFinales(b);

  if (pa.prefijo !== pb.prefijo) {
    return { ok: false, message: 'El primer y el ultimo codigo deben compartir la misma parte fija (el prefijo antes de los numeros)' };
  }
  if (!pa.digitos || !pb.digitos) {
    return { ok: false, message: 'La parte que cambia entre los dos codigos debe ser numerica' };
  }

  const prefijo = pa.prefijo;
  const ancho = Math.max(pa.digitos.length, pb.digitos.length);
  const numA = parseInt(pa.digitos, 10);
  const numB = parseInt(pb.digitos, 10);
  if (numA > numB) return { ok: false, message: 'El primer codigo debe ser menor o igual al ultimo' };
  if (numB - numA + 1 > 5000) return { ok: false, message: 'El rango es demasiado grande (mas de 5000 codigos). Verifica los codigos escaneados' };
  const codigos = [];
  for (let n = numA; n <= numB; n++) codigos.push(prefijo + String(n).padStart(ancho, '0'));
  return { ok: true, codigos };
}

ipcMain.handle('units:addRange', (event, { product_id, codigoInicio, codigoFin, costoUnitario, usuario }) => {
  const db = getDb();
  if (!codigoInicio || !codigoFin) return { ok: false, message: 'Debes escanear o escribir el primer y el ultimo codigo' };
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Debes indicar el costo de compra' };
  const rango = calcularRango(codigoInicio, codigoFin);
  if (!rango.ok) return rango;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

  const insertStmt = db.prepare(
    `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, created_at) VALUES (?, ?, 'disponible', ?, datetime('now','localtime'))`
  );
  const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');
  const insertCompra = db.prepare(
    `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, unit_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now','localtime'), ?)`
  );
  let agregados = 0;
  let saltados = 0;
  const compraIds = [];
  const transaccion = db.transaction((codigos) => {
    for (const codigo of codigos) {
      if (existsStmt.get(codigo)) { saltados++; continue; }
      const unitInfo = insertStmt.run(product_id, codigo, costo);
      const compraInfo = insertCompra.run(product_id, product.tipo, product.nombre, costo, costo, usuario || '', unitInfo.lastInsertRowid);
      compraIds.push(compraInfo.lastInsertRowid);
      agregados++;
    }
  });
  transaccion(rango.codigos);

  // Un comprobante por cada codigo agregado, para que el usuario pueda ver/imprimir
  // cualquiera de ellos justo despues de la operacion, sin tener que ir a Reportes.
  const registros = compraIds.length
    ? db.prepare(
        `SELECT c.*, p.nombre AS producto_nombre, u.codigo AS unidad_codigo
         FROM compras c
         LEFT JOIN products p ON p.id = c.product_id
         LEFT JOIN inventory_units u ON u.id = c.unit_id
         WHERE c.id IN (${compraIds.map(() => '?').join(',')})
         ORDER BY c.id ASC`
      ).all(...compraIds)
    : [];

  return { ok: true, total: rango.codigos.length, agregados, saltados, registros };
});

// Cargo manual de un LOTE de codigos (equipo/simcard/usim): a diferencia de units:addRange
// (que calcula un rango consecutivo), aqui el usuario declara de antemano cuantos items va a
// cargar y debe completar exactamente esa cantidad de codigos, uno por uno o con la pistola.
// Si algun codigo ya existe, se bloquea todo el lote (a diferencia del rango, que los salta en
// silencio) porque aqui cada codigo fue tecleado/escaneado a proposito y un duplicado suele ser
// senal de error del operador.
ipcMain.handle('units:addBatch', (event, { product_id, codigos, costoUnitario, usuario }) => {
  const db = getDb();
  if (!Array.isArray(codigos) || codigos.length === 0) {
    return { ok: false, message: 'Debes indicar la cantidad de items y completar sus codigos' };
  }
  const limpios = codigos.map((c) => (c || '').trim());
  if (limpios.some((c) => !c)) {
    return { ok: false, message: 'Todos los codigos deben estar completos: la cantidad declarada debe coincidir con la cantidad de codigos escaneados' };
  }
  const duplicadosEnLote = [...new Set(limpios.filter((c, i) => limpios.indexOf(c) !== i))];
  if (duplicadosEnLote.length > 0) {
    return { ok: false, message: `Codigo repetido en la lista que estas cargando: ${duplicadosEnLote.join(', ')}` };
  }
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Debes indicar el costo de compra' };
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return { ok: false, message: 'Producto no encontrado' };

  const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');
  const yaExisten = limpios.filter((c) => existsStmt.get(c));
  if (yaExisten.length > 0) {
    return { ok: false, message: `Estos codigos ya estan registrados en el inventario: ${yaExisten.join(', ')}` };
  }

  const insertStmt = db.prepare(
    `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, created_at) VALUES (?, ?, 'disponible', ?, datetime('now','localtime'))`
  );
  const insertCompra = db.prepare(
    `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, unit_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now','localtime'), ?)`
  );
  const compraIds = [];
  const transaccion = db.transaction((codigosLote) => {
    for (const codigo of codigosLote) {
      const unitInfo = insertStmt.run(product_id, codigo, costo);
      const compraInfo = insertCompra.run(product_id, product.tipo, product.nombre, costo, costo, usuario || '', unitInfo.lastInsertRowid);
      compraIds.push(compraInfo.lastInsertRowid);
    }
  });
  transaccion(limpios);

  const registros = compraIds.length
    ? db.prepare(
        `SELECT c.*, p.nombre AS producto_nombre, u.codigo AS unidad_codigo
         FROM compras c
         LEFT JOIN products p ON p.id = c.product_id
         LEFT JOIN inventory_units u ON u.id = c.unit_id
         WHERE c.id IN (${compraIds.map(() => '?').join(',')})
         ORDER BY c.id ASC`
      ).all(...compraIds)
    : [];

  return { ok: true, total: limpios.length, agregados: compraIds.length, registros };
});

ipcMain.handle('units:updateCosto', (event, { id, costoUnitario }) => {
  const db = getDb();
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Costo invalido' };
  db.prepare('UPDATE inventory_units SET costo_unitario_usd = ? WHERE id = ?').run(costo, id);
  return { ok: true };
});

// Permite editar el codigo (IMEI / ICCID / codigo USIM) de una unidad ya registrada, desde
// Inventario. No se permite si la unidad ya fue vendida (para no romper la trazabilidad de la
// factura, que guarda su propia copia del codigo en el momento de la venta).
ipcMain.handle('units:updateCodigo', (event, { id, codigo }) => {
  const db = getDb();
  const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
  if (!unit) return { ok: false, message: 'No encontrado' };
  if (unit.estado === 'vendido') return { ok: false, message: 'No se puede editar el codigo de una unidad ya vendida' };
  const nuevoCodigo = (codigo || '').trim();
  if (!nuevoCodigo) return { ok: false, message: 'El codigo no puede estar vacio' };
  const duplicado = db.prepare('SELECT id FROM inventory_units WHERE codigo = ? AND id != ?').get(nuevoCodigo, id);
  if (duplicado) return { ok: false, message: 'Ese codigo ya esta registrado en otra unidad' };
  db.prepare('UPDATE inventory_units SET codigo = ? WHERE id = ?').run(nuevoCodigo, id);
  return { ok: true };
});

ipcMain.handle('units:delete', (event, { id }) => {
  const db = getDb();
  const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
  if (!unit) return { ok: false, message: 'No encontrado' };
  if (unit.estado === 'vendido') return { ok: false, message: 'No se puede eliminar una unidad ya vendida' };
  db.prepare('DELETE FROM inventory_units WHERE id = ?').run(id);
  return { ok: true };
});

ipcMain.handle('units:writeOff', (event, { id, motivo, usuario }) => {
  const db = getDb();
  const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
  if (!unit) return { ok: false, message: 'No encontrado' };
  if (unit.estado !== 'disponible') return { ok: false, message: 'Solo se pueden dar de baja unidades disponibles' };
  if (!motivo || !motivo.trim()) return { ok: false, message: 'Debes indicar un motivo para el descargo' };
  let descargoId;
  const transaccion = db.transaction(() => {
    db.prepare("UPDATE inventory_units SET estado = 'de_baja' WHERE id = ?").run(id);
    descargoId = db.prepare(
      `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
       VALUES (?, ?, 1, ?, ?, datetime('now','localtime'))`
    ).run(unit.product_id, id, motivo.trim(), usuario || '').lastInsertRowid;
  });
  transaccion();
  const registro = db.prepare(
    `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
     FROM descargos d
     LEFT JOIN products p ON p.id = d.product_id
     LEFT JOIN inventory_units u ON u.id = d.unit_id
     WHERE d.id = ?`
  ).get(descargoId);
  return { ok: true, registro };
});

// Descargo manual de un LOTE de unidades (equipo/simcard/usim): el usuario declara de antemano
// cuantos items va a descargar y debe seleccionar/escanear exactamente esa cantidad de unidades
// disponibles antes de poder confirmar; un solo motivo aplica a todo el lote.
ipcMain.handle('units:writeOffBatch', (event, { ids, motivo, usuario }) => {
  const db = getDb();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, message: 'Debes indicar la cantidad y seleccionar esa cantidad de unidades' };
  }
  if (!motivo || !motivo.trim()) return { ok: false, message: 'Debes indicar un motivo para el descargo' };

  const getUnit = db.prepare('SELECT * FROM inventory_units WHERE id = ?');
  const validos = [];
  const invalidos = [];
  for (const id of ids) {
    const unit = getUnit.get(id);
    if (unit && unit.estado === 'disponible') {
      validos.push(unit);
    } else {
      invalidos.push({ codigo: unit ? unit.codigo : `#${id}`, razon: !unit ? 'no existe en el inventario' : `estado actual: ${unit.estado}` });
    }
  }

  if (invalidos.length > 0) {
    return {
      ok: false,
      bloqueado: true,
      message: `${invalidos.length} de ${ids.length} unidad(es) seleccionadas ya no estan disponibles (puede que alguien mas las haya movido)`,
      invalidos,
      validosCount: validos.length,
      total: ids.length
    };
  }

  const descargoIds = [];
  const transaccion = db.transaction(() => {
    for (const unit of validos) {
      db.prepare("UPDATE inventory_units SET estado = 'de_baja' WHERE id = ?").run(unit.id);
      const descargoId = db.prepare(
        `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
         VALUES (?, ?, 1, ?, ?, datetime('now','localtime'))`
      ).run(unit.product_id, unit.id, motivo.trim(), usuario || '').lastInsertRowid;
      descargoIds.push(descargoId);
    }
  });
  transaccion();

  const registros = descargoIds.length
    ? db.prepare(
        `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
         FROM descargos d
         LEFT JOIN products p ON p.id = d.product_id
         LEFT JOIN inventory_units u ON u.id = d.unit_id
         WHERE d.id IN (${descargoIds.map(() => '?').join(',')})
         ORDER BY d.id ASC`
      ).all(...descargoIds)
    : [];

  return { ok: true, dadosDeBaja: validos.length, registros };
});

// ---------- IPC: Documento de Cargo/Descargo con VARIOS items (incluso de productos y
// tipos distintos: equipos, simcards, usim y accesorios mezclados en un mismo procedimiento) ----------
// A diferencia de los handlers de arriba (que solo permiten trabajar un producto a la vez),
// este agrupa cualquier combinacion de renglones bajo un mismo "encabezado" y los aplica todos
// en una sola transaccion: o se registra el documento completo, o no se registra nada.
//
// Forma esperada de cada item en "items":
//   Para un accesorio (cantidad, no unidad individual):
//     { productId, esAccesorio: true, cantidad, costoUnitario (solo cargo) }
//   Para equipo/simcard/usim en un CARGO (codigo nuevo que aun no existe en el inventario):
//     { productId, esAccesorio: false, codigo, costoUnitario }
//   Para equipo/simcard/usim en un DESCARGO (unidad ya existente que se va a dar de baja):
//     { productId, esAccesorio: false, unitId, codigo (solo para mensajes de error) }
ipcMain.handle('cargosDescargos:crearDocumento', (event, { tipoDocumento, motivo, usuario, items, depositoId }) => {
  const db = getDb();
  if (!['cargo', 'descargo'].includes(tipoDocumento)) return { ok: false, message: 'Tipo de documento invalido' };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, message: 'El documento no tiene ningun item agregado' };
  if (tipoDocumento === 'descargo' && !(motivo || '').trim()) return { ok: false, message: 'Indica el motivo del descargo' };
  if (!depositoId) return { ok: false, message: 'Selecciona el deposito de esta operacion' };
  const deposito = depositoValido(db, depositoId);
  if (!deposito) return { ok: false, message: 'El deposito seleccionado no es valido o esta inactivo' };

  // ---- Validaciones previas (antes de tocar la base de datos) ----
  const productosCache = new Map();
  const getProducto = (id) => {
    if (!productosCache.has(id)) productosCache.set(id, db.prepare('SELECT * FROM products WHERE id = ?').get(id));
    return productosCache.get(id);
  };

  for (const it of items) {
    const product = getProducto(it.productId);
    if (!product) return { ok: false, message: 'Uno de los productos del documento ya no existe' };
    if (tipoDocumento === 'cargo') {
      if (product.tipo === 'accesorio') {
        const n = parseInt(it.cantidad, 10);
        if (!n || n <= 0) return { ok: false, message: `Cantidad invalida para "${product.nombre}"` };
        const costo = parseFloat(it.costoUnitario);
        if (isNaN(costo) || costo < 0) return { ok: false, message: `Costo invalido para "${product.nombre}"` };
      } else {
        const codigo = (it.codigo || '').trim();
        if (!codigo) return { ok: false, message: `Falta el codigo de un item de "${product.nombre}"` };
        const costo = parseFloat(it.costoUnitario);
        if (isNaN(costo) || costo < 0) return { ok: false, message: `Costo invalido para el codigo "${codigo}"` };
      }
    } else {
      if (product.tipo === 'accesorio') {
        const n = parseInt(it.cantidad, 10);
        if (!n || n <= 0) return { ok: false, message: `Cantidad invalida para "${product.nombre}"` };
        const stockEnDeposito = obtenerStockDeposito(db, product.id, depositoId) || 0;
        if (n > stockEnDeposito) return { ok: false, message: `No hay suficiente stock de "${product.nombre}" en el deposito "${deposito.nombre}" (disponible: ${stockEnDeposito})` };
      } else if (!it.unitId) {
        return { ok: false, message: `Falta la unidad a descargar de "${product.nombre}"` };
      } else {
        const u = db.prepare('SELECT deposito_id FROM inventory_units WHERE id = ?').get(it.unitId);
        if (u && u.deposito_id !== depositoId) {
          return { ok: false, message: `El codigo "${it.codigo || ''}" no pertenece al deposito "${deposito.nombre}"` };
        }
      }
    }
  }

  // Validaciones cruzadas dentro del propio documento (codigos/unidades repetidos entre
  // renglones), y contra lo que ya existe en la base de datos.
  if (tipoDocumento === 'cargo') {
    const codigosNuevos = items.filter((it) => it.codigo).map((it) => it.codigo.trim());
    const repetidosEnDocumento = [...new Set(codigosNuevos.filter((c, i) => codigosNuevos.indexOf(c) !== i))];
    if (repetidosEnDocumento.length > 0) {
      return { ok: false, message: `Codigo repetido dentro del mismo documento: ${repetidosEnDocumento.join(', ')}` };
    }
    const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');
    const yaExisten = codigosNuevos.filter((c) => existsStmt.get(c));
    if (yaExisten.length > 0) {
      return { ok: false, message: `Estos codigos ya estan registrados en el inventario: ${yaExisten.join(', ')}` };
    }
  } else {
    const unitIds = items.filter((it) => it.unitId).map((it) => it.unitId);
    const repetidos = unitIds.filter((id, i) => unitIds.indexOf(id) !== i);
    if (repetidos.length > 0) return { ok: false, message: 'Hay una unidad repetida dentro del mismo documento' };
    for (const id of unitIds) {
      const u = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
      if (!u) return { ok: false, message: 'Una de las unidades del documento ya no existe' };
      if (u.estado !== 'disponible') return { ok: false, message: `La unidad "${u.codigo}" ya no esta disponible (puede que alguien mas la haya movido)` };
    }
  }

  let encabezadoId;
  const registros = [];
  const transaccion = db.transaction(() => {
    encabezadoId = db.prepare(
      `INSERT INTO cargos_descargos_encabezado (tipo_documento, motivo, usuario, created_at) VALUES (?, ?, ?, datetime('now','localtime'))`
    ).run(tipoDocumento, (motivo || '').trim() || null, usuario || '').lastInsertRowid;

    for (const it of items) {
      const product = getProducto(it.productId);

      if (tipoDocumento === 'cargo') {
        if (product.tipo === 'accesorio') {
          const n = parseInt(it.cantidad, 10);
          const costo = parseFloat(it.costoUnitario);
          const stockActual = product.stock_cantidad;
          const costoActual = product.costo_promedio_usd || 0;
          const nuevoStock = stockActual + n;
          const nuevoPromedio = nuevoStock > 0 ? ((stockActual * costoActual) + (n * costo)) / nuevoStock : costo;
          db.prepare('UPDATE products SET costo_promedio_usd = ? WHERE id = ?').run(nuevoPromedio, product.id);
          ajustarStockDeposito(db, product.id, depositoId, n);
          product.costo_promedio_usd = nuevoPromedio;
          const compraId = db.prepare(
            `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, encabezado_id, deposito_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?)`
          ).run(product.id, product.tipo, product.nombre, costo, n, costo * n, usuario || '', encabezadoId, depositoId).lastInsertRowid;
          registros.push(
            db.prepare(`SELECT c.*, p.nombre AS producto_nombre FROM compras c LEFT JOIN products p ON p.id = c.product_id WHERE c.id = ?`).get(compraId)
          );
        } else {
          const codigo = it.codigo.trim();
          const costo = parseFloat(it.costoUnitario);
          const unitInfo = db.prepare(
            `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, deposito_id, created_at) VALUES (?, ?, 'disponible', ?, ?, datetime('now','localtime'))`
          ).run(product.id, codigo, costo, depositoId);
          const compraId = db.prepare(
            `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, unit_id, encabezado_id, deposito_id)
             VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now','localtime'), ?, ?, ?)`
          ).run(product.id, product.tipo, product.nombre, costo, costo, usuario || '', unitInfo.lastInsertRowid, encabezadoId, depositoId).lastInsertRowid;
          registros.push(
            db.prepare(
              `SELECT c.*, p.nombre AS producto_nombre, u.codigo AS unidad_codigo
               FROM compras c LEFT JOIN products p ON p.id = c.product_id LEFT JOIN inventory_units u ON u.id = c.unit_id
               WHERE c.id = ?`
            ).get(compraId)
          );
        }
      } else {
        if (product.tipo === 'accesorio') {
          const n = parseInt(it.cantidad, 10);
          ajustarStockDeposito(db, product.id, depositoId, -n);
          const descargoId = db.prepare(
            `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at, encabezado_id, deposito_id)
             VALUES (?, NULL, ?, ?, ?, datetime('now','localtime'), ?, ?)`
          ).run(product.id, n, (motivo || '').trim(), usuario || '', encabezadoId, depositoId).lastInsertRowid;
          registros.push(
            db.prepare(
              `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo FROM descargos d LEFT JOIN products p ON p.id = d.product_id WHERE d.id = ?`
            ).get(descargoId)
          );
        } else {
          const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(it.unitId);
          db.prepare("UPDATE inventory_units SET estado = 'de_baja' WHERE id = ?").run(unit.id);
          const descargoId = db.prepare(
            `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at, encabezado_id, deposito_id)
             VALUES (?, ?, 1, ?, ?, datetime('now','localtime'), ?, ?)`
          ).run(product.id, unit.id, (motivo || '').trim(), usuario || '', encabezadoId, depositoId).lastInsertRowid;
          registros.push(
            db.prepare(
              `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
               FROM descargos d LEFT JOIN products p ON p.id = d.product_id LEFT JOIN inventory_units u ON u.id = d.unit_id
               WHERE d.id = ?`
            ).get(descargoId)
          );
        }
      }
    }
  });
  transaccion();

  return { ok: true, encabezadoId, registros };
});

// ---------- IPC: Historial de descargos ----------
ipcMain.handle('descargos:list', () => {
  const db = getDb();
  return db.prepare(
    `SELECT d.id, d.cantidad, d.motivo, d.usuario, d.created_at,
            p.nombre AS producto_nombre, p.tipo AS producto_tipo,
            u.codigo AS unidad_codigo
     FROM descargos d
     LEFT JOIN products p ON p.id = d.product_id
     LEFT JOIN inventory_units u ON u.id = d.unit_id
     ORDER BY d.id DESC`
  ).all();
});

// ---------- IPC: Configuracion (settings) ----------
ipcMain.handle('settings:get', () => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach((r) => { obj[r.key] = r.value; });
  return obj;
});

ipcMain.handle('settings:update', (event, values) => {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const transaccion = db.transaction((vals) => {
    Object.keys(vals).forEach((k) => stmt.run(k, String(vals[k])));
  });
  transaccion(values);
  return { ok: true };
});

// ---------- IPC: Clientes ----------
// ---------- IPC: Depositos (almacenes) ----------
ipcMain.handle('depositos:list', (event, { soloActivos } = {}) => {
  const db = getDb();
  if (soloActivos) return db.prepare('SELECT * FROM depositos WHERE activo = 1 ORDER BY nombre').all();
  return db.prepare('SELECT * FROM depositos ORDER BY nombre').all();
});

ipcMain.handle('depositos:create', (event, { codigo, nombre }) => {
  const db = getDb();
  const codigoLimpio = (codigo || '').trim();
  const nombreLimpio = (nombre || '').trim();
  if (!codigoLimpio || !nombreLimpio) return { ok: false, message: 'Codigo y nombre son obligatorios' };
  const existente = db.prepare('SELECT id FROM depositos WHERE codigo = ? COLLATE NOCASE').get(codigoLimpio);
  if (existente) return { ok: false, message: 'Ya existe un deposito con ese codigo' };
  const info = db.prepare(
    `INSERT INTO depositos (codigo, nombre, activo, created_at) VALUES (?, ?, 1, datetime('now','localtime'))`
  ).run(codigoLimpio, nombreLimpio);
  return { ok: true, id: info.lastInsertRowid };
});

ipcMain.handle('depositos:update', (event, { id, codigo, nombre }) => {
  const db = getDb();
  const codigoLimpio = (codigo || '').trim();
  const nombreLimpio = (nombre || '').trim();
  if (!codigoLimpio || !nombreLimpio) return { ok: false, message: 'Codigo y nombre son obligatorios' };
  const existente = db.prepare('SELECT id FROM depositos WHERE codigo = ? COLLATE NOCASE AND id != ?').get(codigoLimpio, id);
  if (existente) return { ok: false, message: 'Ya existe un deposito con ese codigo' };
  db.prepare('UPDATE depositos SET codigo = ?, nombre = ? WHERE id = ?').run(codigoLimpio, nombreLimpio, id);
  return { ok: true };
});

// No se permite desactivar el ultimo deposito activo: siempre debe quedar al menos uno
// disponible para poder facturar, comprar y hacer cargos/descargos.
ipcMain.handle('depositos:toggleActive', (event, { id }) => {
  const db = getDb();
  const deposito = db.prepare('SELECT * FROM depositos WHERE id = ?').get(id);
  if (!deposito) return { ok: false, message: 'Deposito no encontrado' };
  if (deposito.activo) {
    const activos = db.prepare('SELECT COUNT(*) AS c FROM depositos WHERE activo = 1').get().c;
    if (activos <= 1) return { ok: false, message: 'Debe quedar al menos un deposito activo' };
  }
  db.prepare('UPDATE depositos SET activo = ? WHERE id = ?').run(deposito.activo ? 0 : 1, id);
  return { ok: true };
});

ipcMain.handle('clientes:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
});

ipcMain.handle('clientes:search', (event, { query }) => {
  const db = getDb();
  // El filtrado de clientes se hace unicamente por cedula/RIF
  const q = `%${(query || '').trim()}%`;
  return db
    .prepare('SELECT * FROM clientes WHERE rif_cedula LIKE ? ORDER BY nombre LIMIT 20')
    .all(q);
});

// Busqueda EXACTA (no parcial) por cedula/RIF: usada en el renglon "Cliente" de Facturacion,
// donde al escribir la cedula completa y presionar Enter se debe traer ese cliente puntual (o
// indicar que no existe, para ofrecer crearlo), a diferencia de clientes:search que es un
// filtro parcial usado en otras pantallas.
ipcMain.handle('clientes:buscarPorCedula', (event, { cedula }) => {
  const db = getDb();
  const c = (cedula || '').trim();
  if (!c) return null;
  return db.prepare('SELECT * FROM clientes WHERE rif_cedula = ? COLLATE NOCASE').get(c) || null;
});

ipcMain.handle('clientes:create', (event, data) => {
  const db = getDb();
  const { nombre, rif_cedula, telefono, direccion, email, tipo_cliente, movil, red_social1, red_social2, red_social3, notas } = data;
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del cliente es obligatorio' };
  const cedulaLimpia = (rif_cedula || '').trim();
  if (!cedulaLimpia) return { ok: false, message: 'La cedula o RIF del cliente es obligatoria' };
  if (!direccion || !direccion.trim()) return { ok: false, message: 'La direccion del cliente es obligatoria' };
  const existente = db.prepare('SELECT id FROM clientes WHERE rif_cedula = ? COLLATE NOCASE').get(cedulaLimpia);
  if (existente) return { ok: false, message: 'Ya existe un cliente registrado con esa cedula o RIF' };
  const info = db
    .prepare(
      `INSERT INTO clientes (nombre, rif_cedula, telefono, direccion, email, tipo_cliente, movil, red_social1, red_social2, red_social3, notas, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    )
    .run(
      nombre.trim(), cedulaLimpia, (telefono || '').trim(), direccion.trim(), email || '',
      tipo_cliente || 'Natural', movil || '', red_social1 || '', red_social2 || '', red_social3 || '', notas || ''
    );
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  return { ok: true, id: info.lastInsertRowid, cliente };
});

ipcMain.handle('clientes:update', (event, { id, nombre, rif_cedula, telefono, direccion, email, tipo_cliente, movil, red_social1, red_social2, red_social3, notas }) => {
  const db = getDb();
  if (!id) return { ok: false, message: 'Cliente invalido' };
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del cliente es obligatorio' };
  if (!rif_cedula || !rif_cedula.trim()) return { ok: false, message: 'La cedula o RIF del cliente es obligatoria' };
  if (!direccion || !direccion.trim()) return { ok: false, message: 'La direccion del cliente es obligatoria' };
  db.prepare(
    `UPDATE clientes SET nombre = ?, rif_cedula = ?, telefono = ?, direccion = ?, email = ?,
       tipo_cliente = ?, movil = ?, red_social1 = ?, red_social2 = ?, red_social3 = ?, notas = ?
     WHERE id = ?`
  ).run(
    nombre.trim(), rif_cedula.trim(), (telefono || '').trim(), direccion.trim(), email || '',
    tipo_cliente || 'Natural', movil || '', red_social1 || '', red_social2 || '', red_social3 || '', notas || '',
    id
  );
  const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  return { ok: true, cliente: actualizado };
});

// ---------- IPC: Proveedores (modulo de Compras) ----------
// Mismo patron que Clientes: busqueda EXACTA por RIF (usada en el renglon "Proveedor" de
// Compras), crear y actualizar. RIF, nombre, telefono y direccion son los unicos campos que se
// piden, tal como se definio para el modulo de Compras.
ipcMain.handle('proveedores:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM proveedores ORDER BY nombre').all();
});

ipcMain.handle('proveedores:buscarPorRif', (event, { rif }) => {
  const db = getDb();
  const r = (rif || '').trim();
  if (!r) return null;
  return db.prepare('SELECT * FROM proveedores WHERE rif = ? COLLATE NOCASE').get(r) || null;
});

ipcMain.handle('proveedores:create', (event, data) => {
  const db = getDb();
  const { nombre, rif, telefono, direccion } = data;
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del proveedor es obligatorio' };
  const rifLimpio = (rif || '').trim();
  if (!rifLimpio) return { ok: false, message: 'El RIF del proveedor es obligatorio' };
  if (!direccion || !direccion.trim()) return { ok: false, message: 'La direccion del proveedor es obligatoria' };
  const existente = db.prepare('SELECT id FROM proveedores WHERE rif = ? COLLATE NOCASE').get(rifLimpio);
  if (existente) return { ok: false, message: 'Ya existe un proveedor registrado con ese RIF' };
  const info = db
    .prepare(
      `INSERT INTO proveedores (nombre, rif, telefono, direccion, created_at)
       VALUES (?, ?, ?, ?, datetime('now','localtime'))`
    )
    .run(nombre.trim(), rifLimpio, (telefono || '').trim(), direccion.trim());
  const proveedor = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(info.lastInsertRowid);
  return { ok: true, id: info.lastInsertRowid, proveedor };
});

ipcMain.handle('proveedores:update', (event, { id, nombre, rif, telefono, direccion }) => {
  const db = getDb();
  if (!id) return { ok: false, message: 'Proveedor invalido' };
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del proveedor es obligatorio' };
  if (!rif || !rif.trim()) return { ok: false, message: 'El RIF del proveedor es obligatorio' };
  if (!direccion || !direccion.trim()) return { ok: false, message: 'La direccion del proveedor es obligatoria' };
  db.prepare(
    `UPDATE proveedores SET nombre = ?, rif = ?, telefono = ?, direccion = ? WHERE id = ?`
  ).run(nombre.trim(), rif.trim(), (telefono || '').trim(), direccion.trim(), id);
  const actualizado = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id);
  return { ok: true, proveedor: actualizado };
});

// ---------- IPC: Facturacion ----------
ipcMain.handle('facturas:crear', (event, payload) => {
  const db = getDb();
  const { cliente, items, usuario, sinCliente, depositoId } = payload;

  if (!items || items.length === 0) {
    return { ok: false, message: 'La factura debe tener al menos un producto' };
  }
  if (!sinCliente && !(cliente && (cliente.id || (cliente.nombre && cliente.nombre.trim())))) {
    return { ok: false, message: 'Selecciona un cliente registrado, crea uno nuevo, o marca "Consumidor final"' };
  }
  if (!depositoId) return { ok: false, message: 'Selecciona el deposito del cual se factura' };
  const deposito = depositoValido(db, depositoId);
  if (!deposito) return { ok: false, message: 'El deposito seleccionado no es valido o esta inactivo' };

  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingsRows.forEach((r) => { settings[r.key] = r.value; });
  const tasaCambio = parseFloat(settings.tasa_cambio) || 1;
  const ivaPorcentaje = parseFloat(settings.iva_porcentaje) || 0;
  let siguienteNumero = parseInt(settings.numero_factura_siguiente, 10);
  if (!siguienteNumero || siguienteNumero < 1) siguienteNumero = 1;
  const numeroFacturaStr = String(siguienteNumero).padStart(6, '0');

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (!product) return { ok: false, message: `Producto no encontrado (id ${item.product_id})` };
    if (product.tipo === 'accesorio') {
      const stockEnDeposito = obtenerStockDeposito(db, product.id, depositoId) || 0;
      if ((parseInt(item.cantidad, 10) || 0) > stockEnDeposito) {
        return { ok: false, message: `Stock insuficiente de "${product.nombre}" en el deposito "${deposito.nombre}" (disponible: ${stockEnDeposito})` };
      }
    } else {
      if (!item.unit_id) return { ok: false, message: `Falta seleccionar el codigo (IMEI/SIM/USIM) de "${product.nombre}"` };
      const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(item.unit_id);
      if (!unit || unit.estado !== 'disponible') {
        return { ok: false, message: `El codigo seleccionado de "${product.nombre}" ya no esta disponible` };
      }
      if (unit.deposito_id !== depositoId) {
        return { ok: false, message: `El codigo "${unit.codigo}" no pertenece al deposito "${deposito.nombre}"` };
      }
    }
  }

  let subtotalUsd = 0;
  items.forEach((item) => {
    subtotalUsd += (parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad, 10) || 1);
  });
  const ivaUsd = subtotalUsd * (ivaPorcentaje / 100);
  const totalUsd = subtotalUsd + ivaUsd;
  const subtotalBs = subtotalUsd * tasaCambio;
  const ivaBs = ivaUsd * tasaCambio;
  const totalBs = totalUsd * tasaCambio;

  let clienteId = null;
  let clienteNombre = 'Consumidor final';
  let clienteRif = '';
  let clienteDireccion = '';

  const transaccion = db.transaction(() => {
    if (!sinCliente) {
      if (cliente.id) {
        const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente.id);
        if (c) {
          clienteId = c.id;
          clienteNombre = c.nombre;
          clienteRif = c.rif_cedula || '';
          clienteDireccion = c.direccion || '';
        }
      } else if (cliente.nombre && cliente.nombre.trim()) {
        const info = db
          .prepare(
            `INSERT INTO clientes (nombre, rif_cedula, telefono, direccion, email, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))`
          )
          .run(cliente.nombre.trim(), cliente.rif_cedula || '', cliente.telefono || '', cliente.direccion || '', cliente.email || '');
        clienteId = info.lastInsertRowid;
        clienteNombre = cliente.nombre.trim();
        clienteRif = cliente.rif_cedula || '';
        clienteDireccion = cliente.direccion || '';
      }
    }

    const facturaInfo = db
      .prepare(
        `INSERT INTO facturas
         (cliente_id, cliente_nombre, cliente_rif, cliente_direccion, numero_factura, subtotal_usd, iva_usd, total_usd, tasa_cambio, subtotal_bs, iva_bs, total_bs, iva_porcentaje, usuario, deposito_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
      )
      .run(clienteId, clienteNombre, clienteRif, clienteDireccion, numeroFacturaStr, subtotalUsd, ivaUsd, totalUsd, tasaCambio, subtotalBs, ivaBs, totalBs, ivaPorcentaje, usuario || '', depositoId);

    const facturaId = facturaInfo.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO factura_items (factura_id, product_id, unit_id, tipo, descripcion, codigo, cantidad, precio_unitario_usd, subtotal_usd, costo_unitario_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      const cantidad = parseInt(item.cantidad, 10) || 1;
      const precioUnit = parseFloat(item.precio_unitario) || 0;
      const subtotalItem = precioUnit * cantidad;
      let codigo = null;
      let costoUnitario = 0;

      if (product.tipo === 'accesorio') {
        ajustarStockDeposito(db, product.id, depositoId, -cantidad);
        costoUnitario = product.costo_promedio_usd || 0;
      } else {
        db.prepare("UPDATE inventory_units SET estado = 'vendido' WHERE id = ?").run(item.unit_id);
        const unit = db.prepare('SELECT codigo, costo_unitario_usd FROM inventory_units WHERE id = ?').get(item.unit_id);
        codigo = unit ? unit.codigo : null;
        costoUnitario = unit ? (unit.costo_unitario_usd || 0) : 0;
      }

      insertItem.run(facturaId, product.id, item.unit_id || null, product.tipo, product.nombre, codigo, cantidad, precioUnit, subtotalItem, costoUnitario);
    }

    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('numero_factura_siguiente', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(String(siguienteNumero + 1));

    return facturaId;
  });

  const facturaId = transaccion();

  return {
    ok: true,
    facturaId,
    numero: numeroFacturaStr,
    totalUsd,
    totalBs
  };
});

ipcMain.handle('facturas:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM facturas ORDER BY id DESC').all();
});

ipcMain.handle('facturas:detalle', (event, { id }) => {
  const db = getDb();
  const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(id);
  if (!factura) return { ok: false, message: 'Factura no encontrada' };
  const items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ?').all(id);
  return { ok: true, factura, items };
});

ipcMain.handle('facturas:eliminar', (event, { id }) => {
  const db = getDb();
  const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(id);
  if (!factura) return { ok: false, message: 'Factura no encontrada' };
  const items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ?').all(id);

  const transaccion = db.transaction(() => {
    items.forEach((item) => {
      if (item.unit_id) {
        db.prepare("UPDATE inventory_units SET estado = 'disponible' WHERE id = ?").run(item.unit_id);
      } else if (item.product_id) {
        db.prepare('UPDATE products SET stock_cantidad = stock_cantidad + ? WHERE id = ?').run(item.cantidad, item.product_id);
      }
    });
    db.prepare('DELETE FROM factura_items WHERE factura_id = ?').run(id);
    db.prepare('DELETE FROM facturas WHERE id = ?').run(id);
  });
  transaccion();
  return { ok: true };
});

// ---------- IPC: Devolucion de Facturas (ventas) ----------

// Busca una factura de VENTA (no una devolucion) por su numero correlativo, para el modulo de
// Devolucion de Facturas. Trae los datos del cliente y, por cada producto de la factura, cuanto
// queda disponible para devolver: para accesorios, la cantidad original menos lo ya devuelto en
// devoluciones previas; para equipos/SIM/USIM, el estado actual de cada codigo/IMEI (solo se
// puede devolver lo que sigue "vendido" a esta misma factura; si ya se devolvio antes, no).
ipcMain.handle('facturas:buscarPorNumero', (event, { numero }) => {
  const db = getDb();
  const texto = (numero || '').trim();
  if (!texto) return { ok: false, message: 'Escribe el numero de factura de venta' };

  // Misma normalizacion robusta que se uso para Devolucion de Compras: se quita todo lo que no
  // sea letra o numero antes de comparar, para que no falle por espacios o caracteres invisibles
  // que a veces trae el copiar y pegar.
  const normalizar = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const objetivo = normalizar(texto);

  const candidatas = db.prepare('SELECT * FROM facturas ORDER BY id DESC').all();
  const factura = candidatas.find((f) => normalizar(f.numero_factura) === objetivo);
  if (!factura) return { ok: false, message: `No se encontro ninguna factura de venta con el numero "${texto}"` };
  if (factura.es_devolucion) {
    return {
      ok: false,
      message: `El numero "${texto}" corresponde a una devolucion (N° ${String(factura.numero_devolucion || '').padStart(6, '0')}), no a una factura de venta original`
    };
  }

  // Si la venta tiene un cliente registrado (no fue "Consumidor final"), se trae tambien el
  // telefono y el email desde la tabla clientes (la factura solo guarda nombre/rif/direccion
  // "congelados" al momento de vender, para que la factura no cambie si el cliente se edita
  // despues).
  let clienteInfo = null;
  if (factura.cliente_id) {
    clienteInfo = db.prepare('SELECT telefono, email FROM clientes WHERE id = ?').get(factura.cliente_id);
  }

  const items = db.prepare('SELECT * FROM factura_items WHERE factura_id = ? AND es_devolucion = 0').all(factura.id);
  const devolucionesPrevias = db.prepare('SELECT id FROM facturas WHERE devuelve_a_factura_id = ?').all(factura.id).map((r) => r.id);

  const itemsConDetalle = items.map((item) => {
    const producto = item.product_id ? db.prepare('SELECT codigo_producto FROM products WHERE id = ?').get(item.product_id) : null;
    const codigoProducto = producto ? producto.codigo_producto : null;
    if (item.tipo === 'accesorio') {
      let cantidadYaDevuelta = 0;
      if (devolucionesPrevias.length > 0) {
        const placeholders = devolucionesPrevias.map(() => '?').join(',');
        const fila = db.prepare(
          `SELECT COALESCE(SUM(cantidad),0) AS c FROM factura_items WHERE factura_id IN (${placeholders}) AND product_id = ? AND es_devolucion = 1`
        ).get(...devolucionesPrevias, item.product_id);
        cantidadYaDevuelta = fila.c || 0;
      }
      return {
        ...item,
        producto_codigo: codigoProducto,
        codigos: [],
        unidades: [],
        cantidad_ya_devuelta: cantidadYaDevuelta,
        cantidad_disponible_devolver: Math.max(0, item.cantidad - cantidadYaDevuelta)
      };
    }
    // Para equipos/SIM/USIM cada renglon de la factura es UNA unidad puntual (un solo unit_id).
    // Esta disponible para devolver si su estado sigue 'vendido' (si ya se devolvio antes,
    // pasaria a 'disponible' y ya no aplicaria para una nueva devolucion de esta misma venta).
    const unidad = item.unit_id ? db.prepare('SELECT id, codigo, estado FROM inventory_units WHERE id = ?').get(item.unit_id) : null;
    const disponibleParaDevolver = !!unidad && unidad.estado === 'vendido';
    return {
      ...item,
      producto_codigo: codigoProducto,
      codigos: unidad ? [unidad.codigo] : [],
      unidades: unidad ? [{ ...unidad, estado: disponibleParaDevolver ? 'disponible' : 'no_disponible' }] : [],
      cantidad_ya_devuelta: disponibleParaDevolver ? 0 : 1,
      cantidad_disponible_devolver: disponibleParaDevolver ? 1 : 0
    };
  });

  return {
    ok: true,
    encabezado: { ...factura, cliente_telefono: clienteInfo?.telefono || '', cliente_email: clienteInfo?.email || '' },
    items: itemsConDetalle
  };
});

// ---------- IPC: numero de devolucion de FACTURA consecutivo (independiente del numero de
// factura y tambien independiente del numero_devolucion de compras) ----------
ipcMain.handle('facturas:proximoNumeroDevolucion', () => {
  const db = getDb();
  const fila = db.prepare(
    'SELECT COALESCE(MAX(numero_devolucion), 0) + 1 AS proximo FROM facturas WHERE es_devolucion = 1'
  ).get();
  return { proximoNumero: fila.proximo };
});

// Registra la devolucion (total o parcial) de una factura de venta. Por cada producto
// devuelto:
//  - Se SUMA de vuelta al inventario (a diferencia de la devolucion de compra, aqui el
//    producto SI vuelve a estar disponible para venderse otra vez): para accesorios, se
//    incrementa el stock del deposito de la venta; para equipos/SIM/USIM, la unidad puntual
//    vuelve a estado 'disponible'.
//  - Se genera la "contraparte negativa": una NUEVA fila en facturas (es_devolucion=1, totales
//    NEGATIVOS) enlazada a la factura original via devuelve_a_factura_id, fechada el dia de hoy.
//    Como los reportes de ventas ya suman facturas.total_usd por rango de fechas, esto reduce
//    automaticamente las ventas/ganancias del mes en que se hace la devolucion, sin alterar el
//    registro historico de la venta original.
ipcMain.handle('facturas:crearDevolucion', (event, payload) => {
  const db = getDb();
  try {
    const { facturaId, items, usuario } = payload;
    if (!facturaId) return { ok: false, message: 'Factura invalida' };
    const original = db.prepare('SELECT * FROM facturas WHERE id = ? AND es_devolucion = 0').get(facturaId);
    if (!original) return { ok: false, message: 'La factura original no fue encontrada' };
    if (!items || items.length === 0) return { ok: false, message: 'Selecciona al menos un producto para devolver' };
    if (!original.deposito_id) return { ok: false, message: 'La factura original no tiene deposito asociado' };

    const devolucionesPrevias = db.prepare('SELECT id FROM facturas WHERE devuelve_a_factura_id = ?').all(facturaId).map((r) => r.id);

    for (const item of items) {
      const lineaOriginal = db.prepare(
        'SELECT * FROM factura_items WHERE factura_id = ? AND product_id = ? AND tipo = ? AND es_devolucion = 0'
        + (item.unit_id ? ' AND unit_id = ?' : '')
      ).get(...(item.unit_id ? [facturaId, item.product_id, item.tipo, item.unit_id] : [facturaId, item.product_id, item.tipo]));
      if (!lineaOriginal) return { ok: false, message: `El producto (id ${item.product_id}) no pertenece a esta factura` };

      if (item.tipo === 'accesorio') {
        const cantidad = parseInt(item.cantidad, 10);
        if (!cantidad || cantidad <= 0) return { ok: false, message: `Cantidad invalida a devolver para "${lineaOriginal.descripcion}"` };
        let yaDevuelta = 0;
        if (devolucionesPrevias.length > 0) {
          const placeholders = devolucionesPrevias.map(() => '?').join(',');
          const fila = db.prepare(
            `SELECT COALESCE(SUM(cantidad),0) AS c FROM factura_items WHERE factura_id IN (${placeholders}) AND product_id = ? AND es_devolucion = 1`
          ).get(...devolucionesPrevias, item.product_id);
          yaDevuelta = fila.c || 0;
        }
        const disponible = lineaOriginal.cantidad - yaDevuelta;
        if (cantidad > disponible) return { ok: false, message: `Solo puedes devolver ${disponible} unidad(es) de "${lineaOriginal.descripcion}"` };
      } else {
        const unidad = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(item.unit_id);
        if (!unidad) return { ok: false, message: `La unidad de "${lineaOriginal.descripcion}" no fue encontrada` };
        if (unidad.estado !== 'vendido') return { ok: false, message: `El codigo "${unidad.codigo}" ya fue devuelto anteriormente, no se puede devolver de nuevo` };
      }
    }

    let totalDevueltoUsd = 0;

    const transaccion = db.transaction(() => {
      const filaNumero = db.prepare(
        'SELECT COALESCE(MAX(numero_devolucion), 0) + 1 AS proximo FROM facturas WHERE es_devolucion = 1'
      ).get();
      const numeroDevolucion = filaNumero.proximo;
      const tasaCambio = original.tasa_cambio || 1;

      const devInfo = db.prepare(
        `INSERT INTO facturas
           (cliente_id, cliente_nombre, cliente_rif, cliente_direccion, numero_factura, subtotal_usd, iva_usd, total_usd,
            tasa_cambio, subtotal_bs, iva_bs, total_bs, iva_porcentaje, usuario, deposito_id, created_at,
            es_devolucion, devuelve_a_factura_id, numero_devolucion)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 0, 0, 0, ?, ?, ?, datetime('now','localtime'), 1, ?, ?)`
      ).run(
        original.cliente_id, original.cliente_nombre, original.cliente_rif, original.cliente_direccion,
        `DEV-${original.numero_factura}`, tasaCambio, original.iva_porcentaje, usuario || '', original.deposito_id,
        original.id, numeroDevolucion
      );
      const devolucionId = devInfo.lastInsertRowid;

      const insertItem = db.prepare(
        `INSERT INTO factura_items
           (factura_id, product_id, unit_id, tipo, descripcion, codigo, cantidad, precio_unitario_usd, subtotal_usd, costo_unitario_usd, es_devolucion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      );

      for (const item of items) {
        const lineaOriginal = db.prepare(
          'SELECT * FROM factura_items WHERE factura_id = ? AND product_id = ? AND tipo = ? AND es_devolucion = 0'
          + (item.unit_id ? ' AND unit_id = ?' : '')
        ).get(...(item.unit_id ? [facturaId, item.product_id, item.tipo, item.unit_id] : [facturaId, item.product_id, item.tipo]));

        if (item.tipo === 'accesorio') {
          const cantidad = parseInt(item.cantidad, 10);
          const totalLinea = lineaOriginal.precio_unitario_usd * cantidad;
          ajustarStockDeposito(db, item.product_id, original.deposito_id, cantidad);
          insertItem.run(
            devolucionId, item.product_id, null, 'accesorio', lineaOriginal.descripcion, null,
            cantidad, lineaOriginal.precio_unitario_usd, -totalLinea, lineaOriginal.costo_unitario_usd
          );
          totalDevueltoUsd += totalLinea;
        } else {
          const unidad = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(item.unit_id);
          db.prepare(
            "UPDATE inventory_units SET estado = 'disponible', devolucion_factura_id = ? WHERE id = ?"
          ).run(devolucionId, unidad.id);
          const totalLinea = lineaOriginal.precio_unitario_usd;
          insertItem.run(
            devolucionId, item.product_id, unidad.id, item.tipo, lineaOriginal.descripcion, unidad.codigo,
            1, lineaOriginal.precio_unitario_usd, -totalLinea, lineaOriginal.costo_unitario_usd
          );
          totalDevueltoUsd += totalLinea;
        }
      }

      const ivaPorcentaje = original.iva_porcentaje || 0;
      // totalDevueltoUsd es la suma de precio_unitario_usd * cantidad de los renglones devueltos,
      // es decir ya es la BASE IMPONIBLE (sin IVA) -igual que "subtotalUsd" en facturas:crear-,
      // asi que el IVA se calcula a partir de ella, no al reves.
      const subtotalDevuelto = totalDevueltoUsd;
      const ivaDevuelto = subtotalDevuelto * (ivaPorcentaje / 100);
      const totalConIvaDevuelto = subtotalDevuelto + ivaDevuelto;

      db.prepare(
        `UPDATE facturas SET subtotal_usd = ?, iva_usd = ?, total_usd = ?, subtotal_bs = ?, iva_bs = ?, total_bs = ? WHERE id = ?`
      ).run(
        -subtotalDevuelto, -ivaDevuelto, -totalConIvaDevuelto,
        -subtotalDevuelto * tasaCambio, -ivaDevuelto * tasaCambio, -totalConIvaDevuelto * tasaCambio,
        devolucionId
      );

      return { devolucionId, numeroDevolucion, totalConIvaDevuelto };
    });

    const { devolucionId, numeroDevolucion, totalConIvaDevuelto } = transaccion();
    return { ok: true, devolucionId, numeroDevolucion, totalDevueltoUsd: totalConIvaDevuelto };
  } catch (err) {
    console.error('Error en facturas:crearDevolucion', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});
ipcMain.handle('gastos:create', (event, { concepto, categoria, monto_usd, usuario }) => {
  const db = getDb();
  if (!concepto || !concepto.trim()) return { ok: false, message: 'El concepto es obligatorio' };
  const monto = parseFloat(monto_usd);
  if (isNaN(monto) || monto <= 0) return { ok: false, message: 'Monto invalido' };
  db.prepare(
    `INSERT INTO gastos (concepto, categoria, monto_usd, usuario, created_at) VALUES (?, ?, ?, ?, datetime('now','localtime'))`
  ).run(concepto.trim(), categoria || '', monto, usuario || '');
  return { ok: true };
});

ipcMain.handle('gastos:list', (event, { desde, hasta } = {}) => {
  const db = getDb();
  if (desde && hasta) {
    return db.prepare(
      "SELECT * FROM gastos WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY id DESC"
    ).all(desde, hasta);
  }
  return db.prepare('SELECT * FROM gastos ORDER BY id DESC').all();
});

ipcMain.handle('gastos:delete', (event, { id }) => {
  const db = getDb();
  db.prepare('DELETE FROM gastos WHERE id = ?').run(id);
  return { ok: true };
});

// ---------- IPC: Compras (historial) ----------
ipcMain.handle('compras:list', (event, { desde, hasta } = {}) => {
  const db = getDb();
  if (desde && hasta) {
    return db.prepare(
      "SELECT * FROM compras WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY id DESC"
    ).all(desde, hasta);
  }
  return db.prepare('SELECT * FROM compras ORDER BY id DESC').all();
});

// ---------- IPC: Reportes ----------
ipcMain.handle('reportes:ganancias', (event, { desde, hasta }) => {
  const db = getDb();
  const facturas = db.prepare(
    "SELECT * FROM facturas WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at"
  ).all(desde, hasta);

  const ventasSubtotalUsd = facturas.reduce((acc, f) => acc + f.subtotal_usd, 0);
  const ivaCobradoUsd = facturas.reduce((acc, f) => acc + f.iva_usd, 0);
  const ventasTotalUsd = facturas.reduce((acc, f) => acc + f.total_usd, 0);

  const idsFacturas = facturas.map((f) => f.id);
  let costoVendidoUsd = 0;
  if (idsFacturas.length > 0) {
    const placeholders = idsFacturas.map(() => '?').join(',');
    const items = db.prepare(
      `SELECT cantidad, costo_unitario_usd, es_devolucion FROM factura_items WHERE factura_id IN (${placeholders})`
    ).all(...idsFacturas);
    // Los renglones de una devolucion (es_devolucion = 1) restan del costo vendido en vez de
    // sumar: ese producto ya no se quedo vendido, volvio al inventario. Sin este signo, una
    // devolucion inflaba el costo (se contaba como si se hubiera vendido dos veces) en vez de
    // anularlo, distorsionando la ganancia bruta/neta del periodo.
    costoVendidoUsd = items.reduce((acc, i) => acc + (i.costo_unitario_usd * i.cantidad) * (i.es_devolucion ? -1 : 1), 0);
  }

  const gastos = db.prepare(
    "SELECT * FROM gastos WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at"
  ).all(desde, hasta);
  const gastosTotalUsd = gastos.reduce((acc, g) => acc + g.monto_usd, 0);

  const gananciaBrutaUsd = ventasSubtotalUsd - costoVendidoUsd;
  const gananciaNetaUsd = gananciaBrutaUsd - gastosTotalUsd;

  return {
    ok: true,
    desde,
    hasta,
    cantidadFacturas: facturas.length,
    ventasSubtotalUsd,
    ivaCobradoUsd,
    ventasTotalUsd,
    costoVendidoUsd,
    gananciaBrutaUsd,
    gastosTotalUsd,
    gananciaNetaUsd,
    gastos
  };
});

// ---------- IPC: Respaldo de base de datos ----------
ipcMain.handle('backup:crear', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar respaldo de la base de datos',
    defaultPath: `respaldo-facturacion-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'Base de datos', extensions: ['db'] }]
  });
  if (canceled || !filePath) return { ok: false, message: 'Cancelado' };
  fs.copyFileSync(getDbPath(), filePath);
  return { ok: true, path: filePath };
});

ipcMain.handle('backup:restaurar', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona el archivo de respaldo (.db)',
    properties: ['openFile'],
    filters: [{ name: 'Base de datos', extensions: ['db'] }]
  });
  if (canceled || filePaths.length === 0) return { ok: false, message: 'Cancelado' };
  cerrarDb();
  fs.copyFileSync(filePaths[0], getDbPath());
  return { ok: true, mensaje: 'Respaldo restaurado. Cierra y vuelve a abrir el programa para ver los cambios.' };
});

// ---------- IPC: verificar si un codigo ya existe en el inventario ----------
ipcMain.handle('inventario:codigoExiste', (event, { codigo, excludeId }) => {
  const db = getDb();
  const c = (codigo || '').trim();
  const existe = excludeId
    ? db.prepare('SELECT id FROM inventory_units WHERE codigo = ? AND id != ?').get(c, excludeId)
    : db.prepare('SELECT id FROM inventory_units WHERE codigo = ?').get(c);
  return { existe: !!existe };
});

// Version "por lote" de la verificacion anterior: recibe varios codigos de una sola vez (por
// ejemplo, los que resultan de generar un rango de SIM/USIM) y devuelve cuales de ellos YA
// estan registrados en el inventario, en una sola consulta en vez de una por codigo.
ipcMain.handle('inventario:codigosExisten', (event, { codigos }) => {
  const db = getDb();
  const lista = Array.isArray(codigos) ? codigos.map((c) => (c || '').trim()).filter(Boolean) : [];
  if (lista.length === 0) return { existentes: [] };
  const placeholders = lista.map(() => '?').join(',');
  const filas = db
    .prepare(`SELECT codigo FROM inventory_units WHERE codigo IN (${placeholders}) COLLATE NOCASE`)
    .all(...lista);
  const existentesSet = new Set(filas.map((f) => f.codigo.toLowerCase()));
  const existentes = lista.filter((c) => existentesSet.has(c.toLowerCase()));
  return { existentes };
});

// Busca un IMEI/codigo de unidad (equipo, simcard, usim) o un codigo de barras de accesorio,
// para que el modulo de Cargos y Descargos pueda saltar directo al producto correspondiente
// sin que el usuario tenga que buscarlo a mano en una lista larga.
ipcMain.handle('inventario:buscarPorCodigo', (event, { codigo }) => {
  const db = getDb();
  const c = (codigo || '').trim();
  if (!c) return { ok: false, message: 'Escribe o escanea un codigo, IMEI o codigo de barras' };

  const unidad = db.prepare(
    `SELECT u.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo
     FROM inventory_units u
     JOIN products p ON p.id = u.product_id
     WHERE u.codigo = ?`
  ).get(c);
  if (unidad) {
    return {
      ok: true,
      tipoResultado: 'unidad',
      product_id: unidad.product_id,
      tipo: unidad.producto_tipo,
      producto_nombre: unidad.producto_nombre,
      unit: { id: unidad.id, codigo: unidad.codigo, estado: unidad.estado, deposito_id: unidad.deposito_id }
    };
  }

  const producto = db.prepare(
    `SELECT * FROM products WHERE tipo = 'accesorio' AND codigo_barras = ? AND codigo_barras IS NOT NULL AND codigo_barras != ''`
  ).get(c);
  if (producto) {
    return {
      ok: true,
      tipoResultado: 'accesorio',
      product_id: producto.id,
      tipo: 'accesorio',
      producto_nombre: producto.nombre
    };
  }

  return { ok: false, message: `No se encontro ningun producto ni unidad con el codigo "${c}"` };
});

// ---------- IPC: Compras por lote (factura de proveedor con varios items) ----------
ipcMain.handle('compras:crearLote', (event, payload) => {
  const db = getDb();
  try {
    const { proveedor, proveedorId, proveedorRif, proveedorTelefono, proveedorDireccion, moneda, numeroFacturaCompra, items, usuario, depositoId } = payload;

    if (!proveedor || !proveedor.trim()) return { ok: false, message: 'El nombre del proveedor es obligatorio' };
    if (!numeroFacturaCompra || !numeroFacturaCompra.trim()) return { ok: false, message: 'El numero de documento de compra es obligatorio' };
    if (!items || items.length === 0) return { ok: false, message: 'Agrega al menos un producto a la compra' };
    if (!depositoId) return { ok: false, message: 'Selecciona el deposito que recibe la mercancia' };
    if (!depositoValido(db, depositoId)) return { ok: false, message: 'El deposito seleccionado no es valido o esta inactivo' };

    const codigosVistosEnEsteLote = new Set();

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      if (!product) return { ok: false, message: `Producto no encontrado (id ${item.product_id})` };

      const costo = parseFloat(item.costoUnitario);
      if (isNaN(costo) || costo < 0) return { ok: false, message: `Costo invalido para "${product.nombre}"` };

      if (product.tipo === 'accesorio') {
        const cantidad = parseInt(item.cantidad, 10);
        if (!cantidad || cantidad <= 0) return { ok: false, message: `Cantidad invalida para "${product.nombre}"` };
      } else {
        const codigos = Array.isArray(item.codigos) ? item.codigos.map((c) => (c || '').trim()).filter(Boolean) : [];
        if (codigos.length === 0) return { ok: false, message: `No se ingreso ningun codigo/IMEI para "${product.nombre}"` };
        if (!item.cantidad || codigos.length !== Number(item.cantidad)) {
          return { ok: false, message: `"${product.nombre}": se ingresaron ${codigos.length} codigo(s) pero se pidio cantidad ${item.cantidad}` };
        }
        for (const codigo of codigos) {
          if (codigosVistosEnEsteLote.has(codigo.toLowerCase())) {
            return { ok: false, message: `El codigo "${codigo}" esta repetido dentro de esta misma compra` };
          }
          codigosVistosEnEsteLote.add(codigo.toLowerCase());
          const exists = db.prepare('SELECT id FROM inventory_units WHERE codigo = ? COLLATE NOCASE').get(codigo);
          if (exists) return { ok: false, message: `El codigo "${codigo}" ya esta registrado en el inventario` };
        }
      }
    }

    let totalUsd = 0;

    const transaccion = db.transaction(() => {
      const encabezadoInfo = db.prepare(
        `INSERT INTO compras_encabezado
           (proveedor, proveedor_id, proveedor_rif, proveedor_telefono, proveedor_direccion, moneda, numero_factura_compra, total_usd, usuario, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now','localtime'))`
      ).run(
        proveedor.trim(), proveedorId || null, proveedorRif || '', proveedorTelefono || '', proveedorDireccion || '',
        moneda || 'Bs', numeroFacturaCompra.trim(), usuario || ''
      );
      const encabezadoId = encabezadoInfo.lastInsertRowid;

      const insertCompra = db.prepare(
        `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at, compra_encabezado_id, deposito_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?)`
      );
      const insertUnit = db.prepare(
        `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, compra_encabezado_id, deposito_id, created_at) VALUES (?, ?, 'disponible', ?, ?, ?, datetime('now','localtime'))`
      );

      for (const item of items) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        const costo = parseFloat(item.costoUnitario);

        if (product.tipo === 'accesorio') {
          const cantidad = parseInt(item.cantidad, 10);
          const stockActual = product.stock_cantidad;
          const costoActual = product.costo_promedio_usd || 0;
          const nuevoStock = stockActual + cantidad;
          const nuevoPromedio = nuevoStock > 0 ? ((stockActual * costoActual) + (cantidad * costo)) / nuevoStock : costo;
          db.prepare('UPDATE products SET costo_promedio_usd = ? WHERE id = ?').run(nuevoPromedio, product.id);
          ajustarStockDeposito(db, product.id, depositoId, cantidad);
          insertCompra.run(product.id, product.tipo, product.nombre, costo, cantidad, costo * cantidad, usuario || '', encabezadoId, depositoId);
          totalUsd += costo * cantidad;
        } else {
          const codigos = item.codigos.map((c) => c.trim());
          codigos.forEach((codigo) => insertUnit.run(product.id, codigo, costo, encabezadoId, depositoId));
          insertCompra.run(product.id, product.tipo, product.nombre, costo, codigos.length, costo * codigos.length, usuario || '', encabezadoId, depositoId);
          totalUsd += costo * codigos.length;
        }
      }

      db.prepare('UPDATE compras_encabezado SET total_usd = ? WHERE id = ?').run(totalUsd, encabezadoId);
      return encabezadoId;
    });

    const encabezadoId = transaccion();
    return { ok: true, encabezadoId, totalUsd };
  } catch (err) {
    console.error('Error en compras:crearLote', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});

ipcMain.handle('compras:listEncabezados', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM compras_encabezado ORDER BY id DESC').all();
});

ipcMain.handle('compras:detalleEncabezado', (event, { id }) => {
  const db = getDb();
  const encabezado = db.prepare('SELECT * FROM compras_encabezado WHERE id = ?').get(id);
  if (!encabezado) return { ok: false, message: 'Compra no encontrada' };
  const items = db.prepare('SELECT * FROM compras WHERE compra_encabezado_id = ?').all(id);
  // Los codigos/IMEI de una unidad se buscan por columnas DISTINTAS segun si este encabezado
  // es una compra normal o una devolucion: al comprar, la unidad guarda compra_encabezado_id
  // (de donde entro); al devolverla, esa columna NO cambia (sigue apuntando a la compra
  // ORIGINAL para siempre), lo que cambia es devolucion_encabezado_id (que se llena en ese
  // momento). Por eso, al pedir el detalle de una DEVOLUCION, hay que buscar por
  // devolucion_encabezado_id en vez de compra_encabezado_id — si no, no aparecia ningun
  // codigo/IMEI en la devolucion (ni en su pantalla de confirmacion ni en su PDF), aunque la
  // devolucion se hubiera registrado bien.
  const getCodigos = encabezado.es_devolucion
    ? db.prepare('SELECT codigo FROM inventory_units WHERE devolucion_encabezado_id = ? AND product_id = ? ORDER BY id')
    : db.prepare('SELECT codigo FROM inventory_units WHERE compra_encabezado_id = ? AND product_id = ? ORDER BY id');
  const itemsConCodigos = items.map((item) => ({
    ...item,
    codigos: item.tipo === 'accesorio' ? [] : getCodigos.all(id, item.product_id).map((r) => r.codigo)
  }));

  // Si esta compra tiene devoluciones (parciales o totales), se arma un resumen para que el
  // Reporte de Compras pueda avisar: "esta compra fue devuelta" (total) o mostrar cuales
  // productos se devolvieron y en cuanto cambio el costo del producto desde entonces (parcial).
  // No aplica si el encabezado que se esta consultando ES, el mismo, una devolucion.
  let devoluciones = [];
  let resumenDevolucion = null;
  if (!encabezado.es_devolucion) {
    const devEncabezados = db.prepare('SELECT * FROM compras_encabezado WHERE devuelve_a_encabezado_id = ? ORDER BY id').all(id);
    if (devEncabezados.length > 0) {
      devoluciones = devEncabezados.map((dev) => {
        const devItems = db.prepare('SELECT * FROM compras WHERE compra_encabezado_id = ? AND es_devolucion = 1').all(dev.id);
        const devItemsConCodigos = devItems.map((di) => ({
          ...di,
          codigos: di.tipo === 'accesorio' ? [] : db.prepare(
            'SELECT codigo FROM inventory_units WHERE devolucion_encabezado_id = ? AND product_id = ? ORDER BY id'
          ).all(dev.id, di.product_id).map((r) => r.codigo)
        }));
        return { ...dev, items: devItemsConCodigos };
      });

      const resumenPorProducto = new Map();
      for (const item of itemsConCodigos) {
        resumenPorProducto.set(item.product_id, {
          product_id: item.product_id,
          descripcion: item.descripcion,
          cantidad_original: item.cantidad,
          cantidad_devuelta: 0,
          costo_original_usd: item.costo_unitario_usd,
          costo_actual_usd: null
        });
      }
      for (const dev of devoluciones) {
        for (const di of dev.items) {
          const r = resumenPorProducto.get(di.product_id);
          if (r) {
            r.cantidad_devuelta += di.cantidad;
            r.costo_actual_usd = di.costo_actual_producto_usd;
          }
        }
      }
      const resumenArray = Array.from(resumenPorProducto.values());
      const esTotal = resumenArray.length > 0 && resumenArray.every((r) => r.cantidad_devuelta >= r.cantidad_original);
      resumenDevolucion = { esTotal, productos: resumenArray.filter((r) => r.cantidad_devuelta > 0) };
    }
  }

  return { ok: true, encabezado, items: itemsConCodigos, devoluciones, resumenDevolucion };
});

// Busca una compra (NO una devolucion) por su numero de documento, para el modulo de
// Devolucion de Compras. Trae, para cada producto de la compra, cuanto queda disponible para
// devolver: para accesorios, la cantidad original menos lo ya devuelto en devoluciones previas;
// para equipos/SIM/USIM, el estado actual de cada codigo/IMEI individual (solo se puede
// devolver lo que sigue "disponible": lo que ya se vendio o ya se devolvio antes, no).
ipcMain.handle('compras:buscarPorDocumento', (event, { documento }) => {
  const db = getDb();
  const texto = (documento || '').trim();
  if (!texto) return { ok: false, message: 'Escribe el numero de documento de compra' };

  // La comparacion se hace en JS (no en el SQL con TRIM/COLLATE) porque TRIM() en SQLite solo
  // quita espacios normales, no tabulaciones ni saltos de linea. Si el documento se guardo con
  // algun caracter invisible de esos (por ejemplo, pegado desde otro programa), la comparacion
  // en SQL fallaba aunque en pantalla se viera identico (el navegador colapsa esos espacios al
  // mostrar texto, por eso "se veia igual" pero no coincidia). normalizar() quita CUALQUIER
  // espacio en blanco (espacios, tabs, saltos de linea) de ambos lados antes de comparar, para
  // que esto no vuelva a fallar sin importar como haya quedado guardado el texto.
  // La comparacion se hace en JS (no en el SQL) porque el problema no era solo espacios: al
  // ESCRIBIR el documento funcionaba, pero al PEGARLO (Ctrl+V) fallaba, lo que confirma que el
  // portapapeles trae algun caracter invisible que no es un espacio comun (puede ser un salto
  // de linea, tabulacion, o un caracter de formato invisible tipo BOM/zero-width). En vez de
  // tratar de adivinar cual caracter es, se quita TODO lo que no sea letra o numero de ambos
  // lados antes de comparar — asi no importa que caracter invisible se haya colado al copiar y
  // pegar, la comparacion sigue funcionando igual que si se hubiera escrito a mano.
  const normalizar = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const objetivo = normalizar(texto);

  const candidatos = db.prepare('SELECT * FROM compras_encabezado ORDER BY id DESC').all();
  const encabezado = candidatos.find((c) => normalizar(c.numero_factura_compra) === objetivo);
  if (!encabezado) return { ok: false, message: `No se encontro ninguna compra con el documento "${texto}"` };
  if (encabezado.es_devolucion) {
    return {
      ok: false,
      message: `El documento "${texto}" corresponde a una devolucion (N° ${String(encabezado.numero_devolucion || '').padStart(6, '0')}), no a una compra original`
    };
  }

  const items = db.prepare('SELECT * FROM compras WHERE compra_encabezado_id = ? AND es_devolucion = 0').all(encabezado.id);
  const devolucionesPrevias = db.prepare('SELECT id FROM compras_encabezado WHERE devuelve_a_encabezado_id = ?').all(encabezado.id).map((r) => r.id);

  const itemsConDetalle = items.map((item) => {
    const producto = db.prepare('SELECT codigo_producto FROM products WHERE id = ?').get(item.product_id);
    const codigoProducto = producto ? producto.codigo_producto : null;
    if (item.tipo === 'accesorio') {
      let cantidadYaDevuelta = 0;
      if (devolucionesPrevias.length > 0) {
        const placeholders = devolucionesPrevias.map(() => '?').join(',');
        const fila = db.prepare(
          `SELECT COALESCE(SUM(cantidad),0) AS c FROM compras WHERE compra_encabezado_id IN (${placeholders}) AND product_id = ? AND es_devolucion = 1`
        ).get(...devolucionesPrevias, item.product_id);
        cantidadYaDevuelta = fila.c || 0;
      }
      return {
        ...item,
        producto_codigo: codigoProducto,
        codigos: [],
        unidades: [],
        cantidad_ya_devuelta: cantidadYaDevuelta,
        cantidad_disponible_devolver: Math.max(0, item.cantidad - cantidadYaDevuelta)
      };
    }
    const unidades = db.prepare(
      'SELECT id, codigo, estado FROM inventory_units WHERE compra_encabezado_id = ? AND product_id = ? ORDER BY id'
    ).all(encabezado.id, item.product_id);
    return {
      ...item,
      producto_codigo: codigoProducto,
      codigos: unidades.map((u) => u.codigo),
      unidades,
      cantidad_ya_devuelta: unidades.filter((u) => u.estado !== 'disponible').length,
      cantidad_disponible_devolver: unidades.filter((u) => u.estado === 'disponible').length
    };
  });

  return { ok: true, encabezado, items: itemsConDetalle };
});

// Registra la devolucion (total o parcial) de una compra. Por cada producto devuelto:
//  - Se resta del inventario: para accesorios, se descuenta la cantidad del deposito donde
//    habia entrado esa compra; para equipos/SIM/USIM, cada codigo/IMEI puntual pasa a
//    'de_baja' (deja de estar disponible para vender).
//  - Se genera la "contraparte negativa": un NUEVO encabezado de compra (es_devolucion=1,
//    total_usd NEGATIVO) enlazado al original via devuelve_a_encabezado_id, con su propia
//    fecha (hoy). Como los reportes de compras ya suman compras_encabezado.total_usd por rango
//    de fechas, esto reduce automaticamente el total de "compras del mes" del mes en que se
//    hace la devolucion, sin alterar el registro historico de la compra original.
ipcMain.handle('compras:crearDevolucion', (event, payload) => {
  const db = getDb();
  try {
    const { compraEncabezadoId, items, usuario } = payload;
    if (!compraEncabezadoId) return { ok: false, message: 'Compra invalida' };
    const original = db.prepare('SELECT * FROM compras_encabezado WHERE id = ? AND es_devolucion = 0').get(compraEncabezadoId);
    if (!original) return { ok: false, message: 'La compra original no fue encontrada' };
    if (!items || items.length === 0) return { ok: false, message: 'Selecciona al menos un producto para devolver' };

    const devolucionesPrevias = db.prepare('SELECT id FROM compras_encabezado WHERE devuelve_a_encabezado_id = ?').all(compraEncabezadoId).map((r) => r.id);

    for (const item of items) {
      const lineaOriginal = db.prepare(
        'SELECT * FROM compras WHERE compra_encabezado_id = ? AND product_id = ? AND es_devolucion = 0'
      ).get(compraEncabezadoId, item.product_id);
      if (!lineaOriginal) return { ok: false, message: `El producto (id ${item.product_id}) no pertenece a esta compra` };

      if (lineaOriginal.tipo === 'accesorio') {
        const cantidad = parseInt(item.cantidad, 10);
        if (!cantidad || cantidad <= 0) return { ok: false, message: `Cantidad invalida a devolver para "${lineaOriginal.descripcion}"` };
        let yaDevuelta = 0;
        if (devolucionesPrevias.length > 0) {
          const placeholders = devolucionesPrevias.map(() => '?').join(',');
          const fila = db.prepare(
            `SELECT COALESCE(SUM(cantidad),0) AS c FROM compras WHERE compra_encabezado_id IN (${placeholders}) AND product_id = ? AND es_devolucion = 1`
          ).get(...devolucionesPrevias, item.product_id);
          yaDevuelta = fila.c || 0;
        }
        const disponible = lineaOriginal.cantidad - yaDevuelta;
        if (cantidad > disponible) return { ok: false, message: `Solo puedes devolver ${disponible} unidad(es) de "${lineaOriginal.descripcion}"` };
      } else {
        const codigos = Array.isArray(item.codigos) ? item.codigos.map((c) => (c || '').trim()).filter(Boolean) : [];
        if (codigos.length === 0) return { ok: false, message: `Selecciona los codigos/IMEI a devolver de "${lineaOriginal.descripcion}"` };
        for (const codigo of codigos) {
          const unidad = db.prepare(
            'SELECT * FROM inventory_units WHERE codigo = ? COLLATE NOCASE AND compra_encabezado_id = ? AND product_id = ?'
          ).get(codigo, compraEncabezadoId, item.product_id);
          if (!unidad) return { ok: false, message: `El codigo "${codigo}" no pertenece a esta compra` };
          if (unidad.estado !== 'disponible') return { ok: false, message: `El codigo "${codigo}" ya fue vendido o devuelto anteriormente, no se puede devolver de nuevo` };
        }
      }
    }

    let totalDevueltoUsd = 0;

    const transaccion = db.transaction(() => {
      // Numero consecutivo exclusivo de devoluciones (independiente del consecutivo de
      // compras), calculado dentro de la misma transaccion para evitar que dos devoluciones
      // registradas casi al mismo tiempo terminen con el mismo numero.
      const filaNumero = db.prepare(
        'SELECT COALESCE(MAX(numero_devolucion), 0) + 1 AS proximo FROM compras_encabezado WHERE es_devolucion = 1'
      ).get();
      const numeroDevolucion = filaNumero.proximo;

      const devInfo = db.prepare(
        `INSERT INTO compras_encabezado
           (proveedor, proveedor_id, proveedor_rif, proveedor_telefono, proveedor_direccion, moneda,
            numero_factura_compra, total_usd, usuario, created_at, es_devolucion, devuelve_a_encabezado_id, numero_devolucion)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now','localtime'), 1, ?, ?)`
      ).run(
        original.proveedor, original.proveedor_id, original.proveedor_rif, original.proveedor_telefono, original.proveedor_direccion,
        original.moneda, `DEV-${original.numero_factura_compra}`, usuario || '', original.id, numeroDevolucion
      );
      const devolucionId = devInfo.lastInsertRowid;

      const insertLinea = db.prepare(
        `INSERT INTO compras
           (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at,
            compra_encabezado_id, deposito_id, es_devolucion, costo_actual_producto_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?, ?, 1, ?)`
      );
      const marcarUnidadDevuelta = db.prepare(
        `UPDATE inventory_units SET estado = 'de_baja', devolucion_encabezado_id = ? WHERE id = ?`
      );

      for (const item of items) {
        const lineaOriginal = db.prepare(
          'SELECT * FROM compras WHERE compra_encabezado_id = ? AND product_id = ? AND es_devolucion = 0'
        ).get(compraEncabezadoId, item.product_id);
        const producto = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
        const costoUnit = lineaOriginal.costo_unitario_usd;
        const costoActualProducto = producto ? producto.costo_promedio_usd : null;

        if (lineaOriginal.tipo === 'accesorio') {
          const cantidad = parseInt(item.cantidad, 10);
          const totalLinea = costoUnit * cantidad;
          ajustarStockDeposito(db, item.product_id, lineaOriginal.deposito_id, -cantidad);
          insertLinea.run(
            item.product_id, lineaOriginal.tipo, lineaOriginal.descripcion, costoUnit, cantidad, -totalLinea,
            usuario || '', devolucionId, lineaOriginal.deposito_id, costoActualProducto
          );
          totalDevueltoUsd += totalLinea;
        } else {
          const codigos = item.codigos.map((c) => c.trim());
          const unidadesInfo = codigos.map((codigo) =>
            db.prepare(
              'SELECT * FROM inventory_units WHERE codigo = ? COLLATE NOCASE AND compra_encabezado_id = ? AND product_id = ?'
            ).get(codigo, compraEncabezadoId, item.product_id)
          );
          unidadesInfo.forEach((u) => marcarUnidadDevuelta.run(devolucionId, u.id));
          const totalLinea = costoUnit * codigos.length;
          insertLinea.run(
            item.product_id, lineaOriginal.tipo, lineaOriginal.descripcion, costoUnit, codigos.length, -totalLinea,
            usuario || '', devolucionId, lineaOriginal.deposito_id, costoActualProducto
          );
          totalDevueltoUsd += totalLinea;
        }
      }

      db.prepare('UPDATE compras_encabezado SET total_usd = ? WHERE id = ?').run(-totalDevueltoUsd, devolucionId);
      return { devolucionId, numeroDevolucion };
    });

    const { devolucionId, numeroDevolucion } = transaccion();
    return { ok: true, devolucionId, numeroDevolucion, totalDevueltoUsd };
  } catch (err) {
    console.error('Error en compras:crearDevolucion', err);
    return { ok: false, message: 'Error inesperado: ' + (err?.message || String(err)) };
  }
});

// ---------- IPC: numero de compra consecutivo (id de compras_encabezado, se muestra antes de registrar) ----------
ipcMain.handle('compras:proximoNumero', () => {
  const db = getDb();
  const fila = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM compras_encabezado').get();
  return { proximoNumero: fila.proximo };
});

// ---------- IPC: numero de devolucion consecutivo (independiente del numero de compra) ----------
ipcMain.handle('compras:proximoNumeroDevolucion', () => {
  const db = getDb();
  const fila = db.prepare(
    'SELECT COALESCE(MAX(numero_devolucion), 0) + 1 AS proximo FROM compras_encabezado WHERE es_devolucion = 1'
  ).get();
  return { proximoNumero: fila.proximo };
});

// ---------- IPC: Compras - calcular rango sin escribir en la BD (para escaneo por lote en Compras) ----------
ipcMain.handle('compras:calcularRango', (event, { codigoInicio, codigoFin }) => {
  if (!codigoInicio || !codigoFin) return { ok: false, message: 'Debes escanear o escribir el primer y el ultimo codigo' };
  const rango = calcularRango(codigoInicio, codigoFin);
  if (!rango.ok) return rango;
  const db = getDb();
  const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');
  const disponibles = [];
  const yaExisten = [];
  for (const codigo of rango.codigos) {
    if (existsStmt.get(codigo)) yaExisten.push(codigo);
    else disponibles.push(codigo);
  }
  return { ok: true, total: rango.codigos.length, disponibles, yaExisten };
});

// ---------- IPC: Descargo (baja) de SimCard/USIM por rango, con manejo de fallos parciales ----------
ipcMain.handle('units:writeOffRange', (event, { product_id, codigoInicio, codigoFin, motivo, usuario, soloValidos }) => {
  const db = getDb();
  if (!codigoInicio || !codigoFin) return { ok: false, message: 'Debes escanear o escribir el primer y el ultimo codigo' };
  if (!motivo || !motivo.trim()) return { ok: false, message: 'Debes indicar un motivo para el descargo' };
  const rango = calcularRango(codigoInicio, codigoFin);
  if (!rango.ok) return rango;

  const getUnit = db.prepare('SELECT * FROM inventory_units WHERE codigo = ? AND product_id = ?');
  const validos = [];
  const invalidos = [];
  for (const codigo of rango.codigos) {
    const unit = getUnit.get(codigo, product_id);
    if (unit && unit.estado === 'disponible') {
      validos.push(unit);
    } else {
      invalidos.push({ codigo, razon: !unit ? 'no existe en el inventario' : `estado actual: ${unit.estado}` });
    }
  }

  if (invalidos.length > 0 && !soloValidos) {
    return {
      ok: false,
      bloqueado: true,
      message: `${invalidos.length} de ${rango.codigos.length} codigo(s) no se pueden dar de baja`,
      invalidos,
      validosCount: validos.length,
      total: rango.codigos.length
    };
  }

  if (validos.length === 0) {
    return { ok: false, message: 'Ningun codigo del rango esta disponible para dar de baja' };
  }

  const descargoIds = [];
  const transaccion = db.transaction(() => {
    for (const unit of validos) {
      db.prepare("UPDATE inventory_units SET estado = 'de_baja' WHERE id = ?").run(unit.id);
      const descargoId = db.prepare(
        `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
         VALUES (?, ?, 1, ?, ?, datetime('now','localtime'))`
      ).run(unit.product_id, unit.id, motivo.trim(), usuario || '').lastInsertRowid;
      descargoIds.push(descargoId);
    }
  });
  transaccion();

  // Un comprobante por cada codigo dado de baja, para que el usuario pueda ver/imprimir
  // cualquiera de ellos justo despues de la operacion, sin tener que ir a Reportes.
  const registros = descargoIds.length
    ? db.prepare(
        `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
         FROM descargos d
         LEFT JOIN products p ON p.id = d.product_id
         LEFT JOIN inventory_units u ON u.id = d.unit_id
         WHERE d.id IN (${descargoIds.map(() => '?').join(',')})
         ORDER BY d.id ASC`
      ).all(...descargoIds)
    : [];

  return { ok: true, total: rango.codigos.length, dadosDeBaja: validos.length, saltados: invalidos.length, invalidos, registros };
});

// ---------- IPC: Reportes adicionales (facturas, compras, cargos y descargos) ----------
// Solo facturas ORIGINALES (es_devolucion = 0); las devoluciones ahora tienen su propio
// apartado ("reportes:devolucionesFacturas"), pero cada factura original que haya sido
// devuelta sigue mostrando aqui el aviso con el numero de devolucion.
ipcMain.handle('reportes:facturas', (event, { desde, hasta }) => {
  const db = getDb();
  const facturas = db.prepare(
    "SELECT * FROM facturas WHERE es_devolucion = 0 AND date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const totalUsd = facturas.reduce((acc, f) => acc + f.total_usd, 0);
  const totalBs = facturas.reduce((acc, f) => acc + f.total_bs, 0);

  // Resumen ligero de devoluciones por factura: el/los numero(s) de devolucion -si tiene- y si
  // con ellas se devolvio la factura completa, para que se vea de una vez en el listado.
  const getDevolucionesDeFactura = db.prepare(
    'SELECT numero_devolucion, total_usd FROM facturas WHERE devuelve_a_factura_id = ? ORDER BY id'
  );
  const facturasConDevolucion = facturas.map((f) => {
    const devs = getDevolucionesDeFactura.all(f.id);
    if (devs.length === 0) return f;
    const devueltoUsd = devs.reduce((acc, d) => acc + Math.abs(d.total_usd), 0);
    return {
      ...f,
      numerosDevolucion: devs.map((d) => d.numero_devolucion),
      devueltoTotal: devueltoUsd >= (f.total_usd - 0.01)
    };
  });

  return { ok: true, desde, hasta, facturas: facturasConDevolucion, cantidad: facturas.length, totalUsd, totalBs };
});

// Apartado propio de Devoluciones de Facturas: solo las filas es_devolucion = 1, con el numero
// de la factura de venta original que devuelven, para poder ubicarla facilmente.
ipcMain.handle('reportes:devolucionesFacturas', (event, { desde, hasta }) => {
  const db = getDb();
  const devoluciones = db.prepare(
    "SELECT * FROM facturas WHERE es_devolucion = 1 AND date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const getOriginal = db.prepare('SELECT numero_factura FROM facturas WHERE id = ?');
  const conOriginal = devoluciones.map((d) => ({
    ...d,
    numero_factura_original: d.devuelve_a_factura_id ? (getOriginal.get(d.devuelve_a_factura_id)?.numero_factura || null) : null
  }));
  const totalUsd = devoluciones.reduce((acc, d) => acc + d.total_usd, 0);
  const totalBs = devoluciones.reduce((acc, d) => acc + d.total_bs, 0);
  return { ok: true, desde, hasta, devoluciones: conOriginal, cantidad: devoluciones.length, totalUsd, totalBs };
});

// Solo compras ORIGINALES (es_devolucion = 0); las devoluciones ahora tienen su propio
// apartado ("reportes:devolucionesCompras"), pero cada compra original que haya sido devuelta
// sigue mostrando aqui el aviso con el numero de devolucion.
ipcMain.handle('reportes:compras', (event, { desde, hasta }) => {
  const db = getDb();
  const compras = db.prepare(
    "SELECT * FROM compras_encabezado WHERE es_devolucion = 0 AND date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const totalUsd = compras.reduce((acc, c) => acc + c.total_usd, 0);

  // Para cada compra ORIGINAL de la lista, se agrega un resumen ligero de sus devoluciones -si
  // tiene- para que se vea de una vez en el listado, sin tener que entrar
  // al detalle: el/los numero(s) de devolucion, y si con ellas se devolvio la compra completa.
  const getDevolucionesDeCompra = db.prepare(
    'SELECT numero_devolucion, total_usd FROM compras_encabezado WHERE devuelve_a_encabezado_id = ? ORDER BY id'
  );
  const comprasConDevolucion = compras.map((c) => {
    const devs = getDevolucionesDeCompra.all(c.id);
    if (devs.length === 0) return c;
    const devueltoUsd = devs.reduce((acc, d) => acc + Math.abs(d.total_usd), 0);
    return {
      ...c,
      numerosDevolucion: devs.map((d) => d.numero_devolucion),
      devueltoTotal: devueltoUsd >= (c.total_usd - 0.01)
    };
  });

  return { ok: true, desde, hasta, compras: comprasConDevolucion, cantidad: compras.length, totalUsd };
});

// Apartado propio de Devoluciones de Compras: solo las filas es_devolucion = 1, con el numero
// del documento de la compra original que devuelven, para poder ubicarla facilmente.
ipcMain.handle('reportes:devolucionesCompras', (event, { desde, hasta }) => {
  const db = getDb();
  const devoluciones = db.prepare(
    "SELECT * FROM compras_encabezado WHERE es_devolucion = 1 AND date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const getOriginal = db.prepare('SELECT numero_factura_compra FROM compras_encabezado WHERE id = ?');
  const conOriginal = devoluciones.map((d) => ({
    ...d,
    numero_factura_compra_original: d.devuelve_a_encabezado_id ? (getOriginal.get(d.devuelve_a_encabezado_id)?.numero_factura_compra || null) : null
  }));
  const totalUsd = devoluciones.reduce((acc, d) => acc + d.total_usd, 0);
  return { ok: true, desde, hasta, devoluciones: conOriginal, cantidad: devoluciones.length, totalUsd };
});

ipcMain.handle('reportes:productosVendidos', (event, { desde, hasta, tipo, product_id }) => {
  const db = getDb();
  let query = `SELECT fi.*, f.created_at AS fecha, f.numero_factura, f.cliente_nombre
               FROM factura_items fi
               JOIN facturas f ON f.id = fi.factura_id
               WHERE date(f.created_at) BETWEEN date(?) AND date(?)`;
  const params = [desde, hasta];
  if (tipo) {
    query += ' AND fi.tipo = ?';
    params.push(tipo);
  }
  if (product_id) {
    query += ' AND fi.product_id = ?';
    params.push(product_id);
  }
  query += ' ORDER BY f.created_at DESC';
  const items = db.prepare(query).all(...params);

  const resumenPorProducto = new Map();
  for (const item of items) {
    let r = resumenPorProducto.get(item.product_id);
    if (!r) {
      r = { product_id: item.product_id, descripcion: item.descripcion, tipo: item.tipo, cantidad: 0, totalUsd: 0 };
      resumenPorProducto.set(item.product_id, r);
    }
    r.cantidad += item.cantidad;
    r.totalUsd += item.subtotal_usd;
  }
  const resumen = Array.from(resumenPorProducto.values()).sort((a, b) => b.cantidad - a.cantidad);

  const cantidadTotal = items.reduce((acc, i) => acc + i.cantidad, 0);
  const totalUsd = items.reduce((acc, i) => acc + i.subtotal_usd, 0);

  return { ok: true, desde, hasta, tipo, items, resumen, cantidadTotal, totalUsd };
});

// ---------------- Reportes de Inventario (Parte 2) ----------------
// A diferencia de los reportes anteriores, estos no filtran por rango de fechas: muestran
// la existencia ACTUAL (una "foto" del stock en este momento), que es lo que tiene sentido
// para un reporte de inventario/valorizacion.

function obtenerStockPorDepositoDeProducto(db, product) {
  if (product.tipo === 'accesorio') {
    return db.prepare(
      `SELECT d.id AS deposito_id, d.nombre AS deposito_nombre, COALESCE(psd.cantidad, 0) AS cantidad
       FROM depositos d
       LEFT JOIN product_stock_deposito psd ON psd.deposito_id = d.id AND psd.product_id = ?
       WHERE d.activo = 1
       ORDER BY d.nombre`
    ).all(product.id);
  }
  return db.prepare(
    `SELECT d.id AS deposito_id, d.nombre AS deposito_nombre, COUNT(u.id) AS cantidad
     FROM depositos d
     LEFT JOIN inventory_units u ON u.deposito_id = d.id AND u.product_id = ? AND u.estado = 'disponible'
     WHERE d.activo = 1
     GROUP BY d.id
     ORDER BY d.nombre`
  ).all(product.id);
}

// "Productos": listado valorizado de todo el inventario (stock x costo promedio y stock x
// precio de venta), opcionalmente filtrado a un solo deposito.
ipcMain.handle('reportes:inventarioProductos', (event, { depositoId } = {}) => {
  const db = getDb();
  const productos = db.prepare('SELECT * FROM products ORDER BY tipo, nombre').all();

  const filas = productos.map((p) => {
    const porDeposito = obtenerStockPorDepositoDeProducto(db, p);
    const stock = depositoId
      ? (porDeposito.find((d) => d.deposito_id === depositoId)?.cantidad || 0)
      : porDeposito.reduce((acc, d) => acc + d.cantidad, 0);
    return {
      id: p.id,
      tipo: p.tipo,
      nombre: p.nombre,
      categoria: p.categoria,
      codigo_producto: p.codigo_producto,
      codigo_barras: p.codigo_barras,
      precio: p.precio,
      precio2: p.precio2,
      costo_promedio_usd: p.costo_promedio_usd,
      stock,
      valorCostoUsd: stock * (p.costo_promedio_usd || 0),
      valorPrecioUsd: stock * (p.precio || 0),
      porDeposito
    };
  });

  const totales = filas.reduce(
    (acc, f) => ({
      stock: acc.stock + f.stock,
      valorCostoUsd: acc.valorCostoUsd + f.valorCostoUsd,
      valorPrecioUsd: acc.valorPrecioUsd + f.valorPrecioUsd
    }),
    { stock: 0, valorCostoUsd: 0, valorPrecioUsd: 0 }
  );

  return { ok: true, productos: filas, totales };
});

// "Inventario Fisico": hoja de conteo por deposito -- para accesorios muestra la cantidad que
// dice el sistema (para comparar contra el conteo real); para equipo/simcard/usim lista cada
// unidad individual (IMEI/codigo) porque el conteo fisico de esos se hace unidad por unidad.
ipcMain.handle('reportes:inventarioFisico', (event, { depositoId }) => {
  const db = getDb();
  if (!depositoId) return { ok: false, message: 'Debe seleccionar un deposito' };

  const deposito = db.prepare('SELECT * FROM depositos WHERE id = ?').get(depositoId);
  if (!deposito) return { ok: false, message: 'Deposito no encontrado' };

  const accesorios = db.prepare(
    `SELECT p.id AS product_id, p.nombre, p.codigo_producto, p.codigo_barras,
            COALESCE(psd.cantidad, 0) AS cantidadSistema
     FROM products p
     LEFT JOIN product_stock_deposito psd ON psd.product_id = p.id AND psd.deposito_id = ?
     WHERE p.tipo = 'accesorio'
     ORDER BY p.nombre`
  ).all(depositoId);

  const unidades = db.prepare(
    `SELECT u.id AS unit_id, u.codigo, p.id AS product_id, p.nombre, p.tipo, p.codigo_producto
     FROM inventory_units u
     JOIN products p ON p.id = u.product_id
     WHERE u.deposito_id = ? AND u.estado = 'disponible'
     ORDER BY p.tipo, p.nombre, u.codigo`
  ).all(depositoId);

  return {
    ok: true,
    deposito,
    accesorios,
    unidades,
    totalAccesorios: accesorios.reduce((acc, a) => acc + a.cantidadSistema, 0),
    totalUnidades: unidades.length
  };
});

ipcMain.handle('reportes:cargosDescargos', (event, { desde, hasta }) => {
  const db = getDb();
  const cargos = db.prepare(
    `SELECT c.*, p.nombre AS producto_nombre, u.codigo AS unidad_codigo
     FROM compras c
     LEFT JOIN products p ON p.id = c.product_id
     LEFT JOIN inventory_units u ON u.id = c.unit_id
     WHERE c.compra_encabezado_id IS NULL AND date(c.created_at) BETWEEN date(?) AND date(?)
     ORDER BY c.created_at DESC`
  ).all(desde, hasta);
  const descargos = db.prepare(
    `SELECT d.*, p.nombre AS producto_nombre, p.tipo AS producto_tipo, u.codigo AS unidad_codigo
     FROM descargos d
     LEFT JOIN products p ON p.id = d.product_id
     LEFT JOIN inventory_units u ON u.id = d.unit_id
     WHERE date(d.created_at) BETWEEN date(?) AND date(?)
     ORDER BY d.created_at DESC`
  ).all(desde, hasta);

  // Numero de secuencia individual para cada renglon (independiente del id de la fila),
  // asi cada cargo o descargo queda identificado por su propia posicion en el listado,
  // junto con su codigo/IMEI visible (unidad_codigo) cuando corresponde a una unidad serializada.
  const conSecuencia = (filas) => filas.map((f, i) => ({ ...f, secuencia: i + 1 }));

  const totalCargosUsd = cargos.reduce((acc, c) => acc + c.total_usd, 0);
  return {
    ok: true,
    desde,
    hasta,
    cargos: conSecuencia(cargos),
    descargos: conSecuencia(descargos),
    totalCargosUsd,
    cantidadCargos: cargos.length,
    cantidadDescargos: descargos.length
  };
});

// ---------------- Reportes de Vendedores (Parte 3) ----------------
// facturas.usuario guarda el "username" de quien facturo (ver Facturacion.jsx), asi que en
// todos estos reportes se cruza contra la tabla users para mostrar el nombre completo.

function mapaUsuarios(db) {
  const filas = db.prepare('SELECT username, full_name FROM users').all();
  const mapa = {};
  filas.forEach((u) => { mapa[u.username] = u.full_name; });
  return mapa;
}

const FORMATO_PERIODO = { dia: '%Y-%m-%d', mes: '%Y-%m', anio: '%Y' };

// "Efectividad": ventas por vendedor agrupadas por dia, mes o año dentro del rango de fechas.
ipcMain.handle('reportes:vendedoresEfectividad', (event, { desde, hasta, agrupacion }) => {
  const db = getDb();
  const formato = FORMATO_PERIODO[agrupacion] || FORMATO_PERIODO.dia;
  const filas = db.prepare(
    `SELECT f.usuario, strftime(?, f.created_at) AS periodo,
            COUNT(*) AS cantidadFacturas, SUM(f.total_usd) AS totalUsd
     FROM facturas f
     WHERE f.es_devolucion = 0 AND date(f.created_at) BETWEEN date(?) AND date(?)
     GROUP BY f.usuario, periodo
     ORDER BY periodo ASC, totalUsd DESC`
  ).all(formato, desde, hasta);

  const nombres = mapaUsuarios(db);
  const conNombre = filas.map((f) => ({ ...f, nombreVendedor: nombres[f.usuario] || f.usuario || 'Sin asignar' }));
  const totalGeneral = conNombre.reduce((acc, f) => acc + f.totalUsd, 0);
  return { ok: true, desde, hasta, agrupacion: agrupacion || 'dia', filas: conNombre, totalGeneral };
});

// "Ultimas ventas a clientes": la ultima factura de cada cliente que ya tenga al menos una.
ipcMain.handle('reportes:vendedoresUltimasVentas', (event) => {
  const db = getDb();
  const filas = db.prepare(
    `SELECT c.id AS cliente_id, c.nombre AS cliente_nombre, c.rif_cedula, c.telefono,
            f.id AS factura_id, f.numero_factura, f.created_at, f.total_usd, f.usuario
     FROM clientes c
     JOIN facturas f ON f.cliente_id = c.id AND f.es_devolucion = 0
       AND f.created_at = (
         SELECT MAX(f2.created_at) FROM facturas f2 WHERE f2.cliente_id = c.id AND f2.es_devolucion = 0
       )
     ORDER BY f.created_at DESC`
  ).all();

  const nombres = mapaUsuarios(db);
  const conNombre = filas.map((f) => ({ ...f, nombreVendedor: nombres[f.usuario] || f.usuario || 'Sin asignar' }));
  return { ok: true, filas: conNombre };
});

// "Ventas por categoria": matriz vendedor x tipo de producto (equipo/simcard/usim/accesorio).
ipcMain.handle('reportes:vendedoresPorCategoria', (event, { desde, hasta }) => {
  const db = getDb();
  const filas = db.prepare(
    `SELECT f.usuario, fi.tipo, SUM(fi.cantidad) AS cantidad, SUM(fi.subtotal_usd) AS totalUsd
     FROM factura_items fi
     JOIN facturas f ON f.id = fi.factura_id
     WHERE f.es_devolucion = 0 AND date(f.created_at) BETWEEN date(?) AND date(?)
     GROUP BY f.usuario, fi.tipo`
  ).all(desde, hasta);

  const nombres = mapaUsuarios(db);
  const tipos = ['equipo', 'simcard', 'usim', 'accesorio'];
  const vendedoresSet = new Set(filas.map((f) => f.usuario));
  const matriz = Array.from(vendedoresSet).map((usuario) => {
    const fila = { usuario, nombreVendedor: nombres[usuario] || usuario || 'Sin asignar' };
    let totalVendedor = 0;
    tipos.forEach((t) => {
      const encontrado = filas.find((f) => f.usuario === usuario && f.tipo === t);
      fila[t] = encontrado ? { cantidad: encontrado.cantidad, totalUsd: encontrado.totalUsd } : { cantidad: 0, totalUsd: 0 };
      totalVendedor += fila[t].totalUsd;
    });
    fila.totalUsd = totalVendedor;
    return fila;
  }).sort((a, b) => b.totalUsd - a.totalUsd);

  return { ok: true, desde, hasta, tipos, matriz };
});

// "Estadisticas": totales generales por vendedor (facturas, monto, ticket promedio, participacion %).
ipcMain.handle('reportes:vendedoresEstadisticas', (event, { desde, hasta }) => {
  const db = getDb();
  const filas = db.prepare(
    `SELECT f.usuario, COUNT(*) AS cantidadFacturas, SUM(f.total_usd) AS totalUsd
     FROM facturas f
     WHERE f.es_devolucion = 0 AND date(f.created_at) BETWEEN date(?) AND date(?)
     GROUP BY f.usuario
     ORDER BY totalUsd DESC`
  ).all(desde, hasta);

  const nombres = mapaUsuarios(db);
  const totalGeneral = filas.reduce((acc, f) => acc + f.totalUsd, 0);
  const conDetalle = filas.map((f) => ({
    ...f,
    nombreVendedor: nombres[f.usuario] || f.usuario || 'Sin asignar',
    ticketPromedioUsd: f.cantidadFacturas > 0 ? f.totalUsd / f.cantidadFacturas : 0,
    participacionPct: totalGeneral > 0 ? (f.totalUsd / totalGeneral) * 100 : 0
  }));

  return { ok: true, desde, hasta, filas: conDetalle, totalGeneral };
});

// ---------------- Reportes de Ventas (Parte 4) ----------------

// "Transacciones": resumen diario de facturas (cantidad y total) dentro del rango.
ipcMain.handle('reportes:ventasTransacciones', (event, { desde, hasta }) => {
  const db = getDb();
  const filas = db.prepare(
    `SELECT date(created_at) AS fecha, COUNT(*) AS cantidadFacturas,
            SUM(total_usd) AS totalUsd, SUM(total_bs) AS totalBs
     FROM facturas
     WHERE es_devolucion = 0 AND date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY fecha
     ORDER BY fecha ASC`
  ).all(desde, hasta);

  const totales = filas.reduce(
    (acc, f) => ({ cantidadFacturas: acc.cantidadFacturas + f.cantidadFacturas, totalUsd: acc.totalUsd + f.totalUsd, totalBs: acc.totalBs + f.totalBs }),
    { cantidadFacturas: 0, totalUsd: 0, totalBs: 0 }
  );

  return { ok: true, desde, hasta, filas, totales };
});

// "Cierre de ventas diario": por producto y unidades vendidas, para UN dia especifico.
ipcMain.handle('reportes:ventasCierreDiario', (event, { fecha }) => {
  const db = getDb();
  const filas = db.prepare(
    `SELECT fi.descripcion, fi.tipo, fi.codigo, SUM(fi.cantidad) AS unidades, SUM(fi.subtotal_usd) AS totalUsd
     FROM factura_items fi
     JOIN facturas f ON f.id = fi.factura_id
     WHERE f.es_devolucion = 0 AND date(f.created_at) = date(?)
     GROUP BY fi.descripcion, fi.tipo
     ORDER BY totalUsd DESC`
  ).all(fecha);

  const resumenFacturas = db.prepare(
    `SELECT COUNT(*) AS cantidadFacturas, COALESCE(SUM(total_usd), 0) AS totalUsd, COALESCE(SUM(total_bs), 0) AS totalBs
     FROM facturas WHERE es_devolucion = 0 AND date(created_at) = date(?)`
  ).get(fecha);

  const totalUnidades = filas.reduce((acc, f) => acc + f.unidades, 0);

  return { ok: true, fecha, filas, totalUnidades, ...resumenFacturas };
});

// "Relacion de ventas": resumen diario o mensual con subtotal/IVA/total (en USD y Bs).
ipcMain.handle('reportes:ventasRelacion', (event, { desde, hasta, agrupacion }) => {
  const db = getDb();
  const formato = FORMATO_PERIODO[agrupacion] || FORMATO_PERIODO.dia;
  const filas = db.prepare(
    `SELECT strftime(?, created_at) AS periodo, COUNT(*) AS cantidadFacturas,
            SUM(subtotal_usd) AS subtotalUsd, SUM(iva_usd) AS ivaUsd, SUM(total_usd) AS totalUsd,
            SUM(subtotal_bs) AS subtotalBs, SUM(iva_bs) AS ivaBs, SUM(total_bs) AS totalBs
     FROM facturas
     WHERE es_devolucion = 0 AND date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY periodo
     ORDER BY periodo ASC`
  ).all(formato, desde, hasta);

  return { ok: true, desde, hasta, agrupacion: agrupacion || 'dia', filas };
});
