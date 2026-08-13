const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./db');

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

  mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  initDb();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: Autenticacion ----------
ipcMain.handle('auth:login', (event, { username, password }) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) {
    return { ok: false, message: 'Usuario no encontrado o inactivo' };
  }
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return { ok: false, message: 'Contrasena incorrecta' };
  }
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
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return { ok: false, message: 'Ese nombre de usuario ya existe' };
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, datetime("now"))'
  ).run(username, hash, full_name, role);
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
  return db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
});

ipcMain.handle('categories:create', (event, { nombre }) => {
  const db = getDb();
  const limpio = (nombre || '').trim();
  if (!limpio) {
    return { ok: false, message: 'El nombre de la categoria no puede estar vacio' };
  }
  const exists = db
    .prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)')
    .get(limpio);
  if (exists) {
    return { ok: false, message: 'Esa categoria ya existe' };
  }
  db.prepare('INSERT INTO categorias (nombre, created_at) VALUES (?, datetime(\'now\'))').run(limpio);
  return { ok: true };
});

// ---------- IPC: Inventario - productos ----------
ipcMain.handle('products:list', (event, { tipo } = {}) => {
  const db = getDb();
  const rows = tipo
    ? db.prepare('SELECT * FROM products WHERE tipo = ? ORDER BY nombre').all(tipo)
    : db.prepare('SELECT * FROM products ORDER BY tipo, nombre').all();

  const countStmt = db.prepare(
    "SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ? AND estado = 'disponible'"
  );

  return rows.map((p) => {
    if (p.tipo === 'accesorio') {
      return { ...p, stock_disponible: p.stock_cantidad };
    }
    const c = countStmt.get(p.id).c;
    return { ...p, stock_disponible: c };
  });
});

ipcMain.handle('products:names', (event, { tipo } = {}) => {
  const db = getDb();
  const rows = tipo
    ? db.prepare('SELECT DISTINCT nombre FROM products WHERE tipo = ? ORDER BY nombre').all(tipo)
    : db.prepare('SELECT DISTINCT nombre FROM products ORDER BY nombre').all();
  return rows.map((r) => r.nombre);
});

ipcMain.handle('products:create', (event, data) => {
  const db = getDb();
  const { tipo, nombre, categoria, precio, stock_minimo, codigo_barras, stock_cantidad } = data;

  if (!tipo || !nombre) {
    return { ok: false, message: 'Tipo y nombre son obligatorios' };
  }

  const info = db
    .prepare(
      `INSERT INTO products (tipo, nombre, categoria, precio, stock_minimo, stock_cantidad, codigo_barras, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      tipo,
      nombre,
      categoria || '',
      precio || 0,
      stock_minimo || 0,
      tipo === 'accesorio' ? (stock_cantidad || 0) : 0,
      tipo === 'accesorio' ? (codigo_barras || '') : null
    );

  return { ok: true, id: info.lastInsertRowid };
});

ipcMain.handle('products:delete', (event, { id }) => {
  const db = getDb();
  const unitsCount = db.prepare('SELECT COUNT(*) AS c FROM inventory_units WHERE product_id = ?').get(id).c;
  if (unitsCount > 0) {
    return { ok: false, message: 'No se puede eliminar: tiene unidades (IMEI/SIM) registradas' };
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { ok: true };
});

ipcMain.handle('products:addStock', (event, { id, cantidad, usuario }) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return { ok: false, message: 'Producto no encontrado' };
  if (product.tipo !== 'accesorio') return { ok: false, message: 'Solo aplica a accesorios' };
  const n = parseInt(cantidad, 10);
  if (!n || n <= 0) return { ok: false, message: 'Cantidad invalida' };
  const nuevoStock = product.stock_cantidad + n;
  db.prepare('UPDATE products SET stock_cantidad = ? WHERE id = ?').run(nuevoStock, id);
  return { ok: true, stock: nuevoStock };
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
  const transaccion = db.transaction(() => {
    db.prepare('UPDATE products SET stock_cantidad = ? WHERE id = ?').run(nuevoStock, id);
    db.prepare(
      `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
       VALUES (?, NULL, ?, ?, ?, datetime('now'))`
    ).run(id, n, motivo.trim(), usuario || '');
  });
  transaccion();
  return { ok: true, stock: nuevoStock };
});

// ---------- IPC: Inventario - unidades (IMEI / SIM / USIM) ----------
ipcMain.handle('units:list', (event, { product_id }) => {
  const db = getDb();
  return db.prepare('SELECT * FROM inventory_units WHERE product_id = ? ORDER BY created_at DESC').all(product_id);
});

ipcMain.handle('units:add', (event, { product_id, codigo }) => {
  const db = getDb();
  if (!codigo || !codigo.trim()) {
    return { ok: false, message: 'El codigo no puede estar vacio' };
  }
  const exists = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?').get(codigo.trim());
  if (exists) {
    return { ok: false, message: 'Ese codigo ya esta registrado' };
  }
  db.prepare(
    `INSERT INTO inventory_units (product_id, codigo, estado, created_at) VALUES (?, ?, 'disponible', datetime('now'))`
  ).run(product_id, codigo.trim());
  return { ok: true };
});

function calcularRango(codigoInicio, codigoFin) {
  const a = codigoInicio.trim();
  const b = codigoFin.trim();

  if (a.length !== b.length) {
    return { ok: false, message: 'El primer y el ultimo codigo deben tener la misma longitud' };
  }

  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;

  const prefijo = a.slice(0, i);
  const restoA = a.slice(i);
  const restoB = b.slice(i);

  if (!/^\d+$/.test(restoA) || !/^\d+$/.test(restoB)) {
    return { ok: false, message: 'La parte que cambia entre los dos codigos debe ser numerica' };
  }

  const ancho = restoA.length;
  const numA = parseInt(restoA, 10);
  const numB = parseInt(restoB, 10);

  if (numA > numB) {
    return { ok: false, message: 'El primer codigo debe ser menor o igual al ultimo' };
  }

  if (numB - numA + 1 > 5000) {
    return { ok: false, message: 'El rango es demasiado grande (mas de 5000 codigos). Verifica los codigos escaneados' };
  }

  const codigos = [];
  for (let n = numA; n <= numB; n++) {
    codigos.push(prefijo + String(n).padStart(ancho, '0'));
  }
  return { ok: true, codigos };
}

ipcMain.handle('units:addRange', (event, { product_id, codigoInicio, codigoFin }) => {
  const db = getDb();
  if (!codigoInicio || !codigoFin) {
    return { ok: false, message: 'Debes escanear o escribir el primer y el ultimo codigo' };
  }

  const rango = calcularRango(codigoInicio, codigoFin);
  if (!rango.ok) {
    return rango;
  }

  const insertStmt = db.prepare(
    `INSERT INTO inventory_units (product_id, codigo, estado, created_at) VALUES (?, ?, 'disponible', datetime('now'))`
  );
  const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');

  let agregados = 0;
  let saltados = 0;

  const transaccion = db.transaction((codigos) => {
    for (const codigo of codigos) {
      if (existsStmt.get(codigo)) {
        saltados++;
        continue;
      }
      insertStmt.run(product_id, codigo);
      agregados++;
    }
  });
  transaccion(rango.codigos);

  return { ok: true, total: rango.codigos.length, agregados, saltados };
});

ipcMain.handle('units:delete', (event, { id }) => {
  const db = getDb();
  const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
  if (!unit) return { ok: false, message: 'No encontrado' };
  if (unit.estado === 'vendido') {
    return { ok: false, message: 'No se puede eliminar una unidad ya vendida' };
  }
  db.prepare('DELETE FROM inventory_units WHERE id = ?').run(id);
  return { ok: true };
});

ipcMain.handle('units:writeOff', (event, { id, motivo, usuario }) => {
  const db = getDb();
  const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id);
  if (!unit) return { ok: false, message: 'No encontrado' };
  if (unit.estado !== 'disponible') {
    return { ok: false, message: 'Solo se pueden dar de baja unidades disponibles' };
  }
  if (!motivo || !motivo.trim()) {
    return { ok: false, message: 'Debes indicar un motivo para el descargo' };
  }
  const transaccion = db.transaction(() => {
    db.prepare("UPDATE inventory_units SET estado = 'de_baja' WHERE id = ?").run(id);
    db.prepare(
      `INSERT INTO descargos (product_id, unit_id, cantidad, motivo, usuario, created_at)
       VALUES (?, ?, 1, ?, ?, datetime('now'))`
    ).run(unit.product_id, id, motivo.trim(), usuario || '');
  });
  transaccion();
  return { ok: true };
});
