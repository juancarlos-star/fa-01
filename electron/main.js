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
    const errorAlAbrir = await shell.openPath(filePath);
    if (errorAlAbrir) {
      return { ok: true, path: filePath, avisoApertura: errorAlAbrir };
    }
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
    const errorAlAbrir = await shell.openPath(filePath);
    await imprimirPdfEnSegundoPlano(filePath);
    if (errorAlAbrir) {
      return { ok: true, path: filePath, avisoApertura: errorAlAbrir };
    }
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
  if (!telefono || !telefono.trim()) return { ok: false, message: 'El telefono del cliente es obligatorio' };
  const cedulaLimpia = (rif_cedula || '').trim();
  if (!cedulaLimpia) return { ok: false, message: 'La cedula o RIF del cliente es obligatoria' };
  const existente = db.prepare('SELECT id FROM clientes WHERE rif_cedula = ? COLLATE NOCASE').get(cedulaLimpia);
  if (existente) return { ok: false, message: 'Ya existe un cliente registrado con esa cedula o RIF' };
  const info = db
    .prepare(
      `INSERT INTO clientes (nombre, rif_cedula, telefono, direccion, email, tipo_cliente, movil, red_social1, red_social2, red_social3, notas, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    )
    .run(
      nombre.trim(), cedulaLimpia, telefono.trim(), direccion || '', email || '',
      tipo_cliente || 'Natural', movil || '', red_social1 || '', red_social2 || '', red_social3 || '', notas || ''
    );
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  return { ok: true, id: info.lastInsertRowid, cliente };
});

ipcMain.handle('clientes:update', (event, { id, nombre, rif_cedula, telefono, direccion, email, tipo_cliente, movil, red_social1, red_social2, red_social3, notas }) => {
  const db = getDb();
  if (!id) return { ok: false, message: 'Cliente invalido' };
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del cliente es obligatorio' };
  db.prepare(
    `UPDATE clientes SET nombre = ?, rif_cedula = ?, telefono = ?, direccion = ?, email = ?,
       tipo_cliente = ?, movil = ?, red_social1 = ?, red_social2 = ?, red_social3 = ?, notas = ?
     WHERE id = ?`
  ).run(
    nombre.trim(), rif_cedula || '', telefono || '', direccion || '', email || '',
    tipo_cliente || 'Natural', movil || '', red_social1 || '', red_social2 || '', red_social3 || '', notas || '',
    id
  );
  const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  return { ok: true, cliente: actualizado };
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

// ---------- IPC: Gastos ----------
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
      `SELECT cantidad, costo_unitario_usd FROM factura_items WHERE factura_id IN (${placeholders})`
    ).all(...idsFacturas);
    costoVendidoUsd = items.reduce((acc, i) => acc + (i.costo_unitario_usd * i.cantidad), 0);
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
    const { proveedor, numeroFacturaCompra, items, usuario, depositoId } = payload;

    if (!proveedor || !proveedor.trim()) return { ok: false, message: 'El nombre del proveedor es obligatorio' };
    if (!numeroFacturaCompra || !numeroFacturaCompra.trim()) return { ok: false, message: 'El numero de factura de compra es obligatorio' };
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
        if (codigos.length === 0) return { ok: false, message: `No se escaneo ningun codigo para "${product.nombre}"` };
        if (!item.cantidadDeclarada || codigos.length !== Number(item.cantidadDeclarada)) {
          return { ok: false, message: `"${product.nombre}": escaneaste ${codigos.length} codigo(s) pero declaraste ${item.cantidadDeclarada}` };
        }
        for (const codigo of codigos) {
          if (codigosVistosEnEsteLote.has(codigo)) {
            return { ok: false, message: `El codigo "${codigo}" esta repetido dentro de esta misma compra` };
          }
          codigosVistosEnEsteLote.add(codigo);
          const exists = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?').get(codigo);
          if (exists) return { ok: false, message: `El codigo "${codigo}" ya esta registrado en el inventario` };
        }
      }
    }

    let totalUsd = 0;

    const transaccion = db.transaction(() => {
      const encabezadoInfo = db.prepare(
        `INSERT INTO compras_encabezado (proveedor, numero_factura_compra, total_usd, usuario, created_at)
         VALUES (?, ?, 0, ?, datetime('now','localtime'))`
      ).run(proveedor.trim(), numeroFacturaCompra.trim(), usuario || '');
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
  const getCodigos = db.prepare('SELECT codigo FROM inventory_units WHERE compra_encabezado_id = ? AND product_id = ? ORDER BY id');
  const itemsConCodigos = items.map((item) => ({
    ...item,
    codigos: item.tipo === 'accesorio' ? [] : getCodigos.all(id, item.product_id).map((r) => r.codigo)
  }));
  return { ok: true, encabezado, items: itemsConCodigos };
});

// ---------- IPC: numero de compra consecutivo (id de compras_encabezado, se muestra antes de registrar) ----------
ipcMain.handle('compras:proximoNumero', () => {
  const db = getDb();
  const fila = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM compras_encabezado').get();
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
ipcMain.handle('reportes:facturas', (event, { desde, hasta }) => {
  const db = getDb();
  const facturas = db.prepare(
    "SELECT * FROM facturas WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const totalUsd = facturas.reduce((acc, f) => acc + f.total_usd, 0);
  const totalBs = facturas.reduce((acc, f) => acc + f.total_bs, 0);
  return { ok: true, desde, hasta, facturas, cantidad: facturas.length, totalUsd, totalBs };
});

ipcMain.handle('reportes:compras', (event, { desde, hasta }) => {
  const db = getDb();
  const compras = db.prepare(
    "SELECT * FROM compras_encabezado WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC"
  ).all(desde, hasta);
  const totalUsd = compras.reduce((acc, c) => acc + c.total_usd, 0);
  return { ok: true, desde, hasta, compras, cantidad: compras.length, totalUsd };
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
