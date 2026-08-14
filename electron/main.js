const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb, initDb, cerrarDb, getDbPath } = require('./db');

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
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return { ok: false, message: 'Ese nombre de usuario ya existe' };
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
  return db.prepare('SELECT * FROM categorias ORDER BY tipo, nombre').all();
});

ipcMain.handle('categories:create', (event, { nombre, tipo }) => {
  const db = getDb();
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, message: 'El nombre de la categoria no puede estar vacio' };
  const tiposValidos = ['equipo', 'simcard', 'usim', 'accesorio'];
  if (!tiposValidos.includes(tipo)) return { ok: false, message: 'Debes indicar a que tipo pertenece esta categoria' };
  const exists = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)').get(limpio);
  if (exists) return { ok: false, message: 'Esa categoria ya existe' };
  db.prepare("INSERT INTO categorias (nombre, tipo, created_at) VALUES (?, ?, datetime('now'))").run(limpio, tipo);
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

ipcMain.handle('categories:update', (event, { id, nombre }) => {
  const db = getDb();
  const limpio = (nombre || '').trim();
  if (!limpio) return { ok: false, message: 'El nombre no puede estar vacio' };
  const actual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!actual) return { ok: false, message: 'Categoria no encontrada' };
  const exists = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?) AND id != ?').get(limpio, id);
  if (exists) return { ok: false, message: 'Ya existe otra categoria con ese nombre' };

  const transaccion = db.transaction(() => {
    db.prepare('UPDATE products SET categoria = ? WHERE categoria = ? AND tipo = ?').run(limpio, actual.nombre, actual.tipo);
    db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(limpio, id);
  });
  transaccion();
  return { ok: true };
});

ipcMain.handle('categories:delete', (event, { id }) => {
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!cat) return { ok: false, message: 'Categoria no encontrada' };
  const productos = db.prepare('SELECT * FROM products WHERE categoria = ? AND tipo = ?').all(cat.nombre, cat.tipo);

  const transaccion = db.transaction(() => {
    productos.forEach((p) => {
      db.prepare('DELETE FROM inventory_units WHERE product_id = ?').run(p.id);
      db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
    });
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  });
  transaccion();
  return { ok: true, productosEliminados: productos.length };
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
    if (p.tipo === 'accesorio') return { ...p, stock_disponible: p.stock_cantidad };
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
  const { tipo, nombre, categoria, precio, stock_minimo, codigo_barras, stock_cantidad, costo_inicial, usuario } = data;
  if (!tipo || !nombre) return { ok: false, message: 'Tipo y nombre son obligatorios' };

  if (categoria && categoria.trim()) {
    const cat = db.prepare('SELECT tipo FROM categorias WHERE nombre = ?').get(categoria.trim());
    if (!cat || cat.tipo !== tipo) {
      return { ok: false, message: `La categoria "${categoria}" no corresponde a este tipo de producto` };
    }
  }

  const stockInicial = tipo === 'accesorio' ? (parseInt(stock_cantidad, 10) || 0) : 0;
  const costo = parseFloat(costo_inicial) || 0;

  const info = db
    .prepare(
      `INSERT INTO products (tipo, nombre, categoria, precio, stock_minimo, stock_cantidad, costo_promedio_usd, codigo_barras, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      tipo, nombre, categoria || '', precio || 0, stock_minimo || 0,
      stockInicial, costo,
      tipo === 'accesorio' ? (codigo_barras || '') : null
    );

  const productId = info.lastInsertRowid;

  if (tipo === 'accesorio' && stockInicial > 0) {
    db.prepare(
      `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(productId, tipo, nombre, costo, stockInicial, costo * stockInicial, usuario || '');
  }

  return { ok: true, id: productId };
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

  const transaccion = db.transaction(() => {
    db.prepare('UPDATE products SET stock_cantidad = ?, costo_promedio_usd = ? WHERE id = ?').run(nuevoStock, nuevoPromedio, id);
    db.prepare(
      `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, product.tipo, product.nombre, costo, n, costo * n, usuario || '');
  });
  transaccion();
  return { ok: true, stock: nuevoStock, costoPromedio: nuevoPromedio };
});

ipcMain.handle('products:updateCosto', (event, { id, costoPromedio }) => {
  const db = getDb();
  const costo = parseFloat(costoPromedio);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Costo invalido' };
  db.prepare('UPDATE products SET costo_promedio_usd = ? WHERE id = ?').run(costo, id);
  return { ok: true };
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

ipcMain.handle('units:add', (event, { product_id, codigo, costoUnitario, usuario }) => {
  const db = getDb();
  if (!codigo || !codigo.trim()) return { ok: false, message: 'El codigo no puede estar vacio' };
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Debes indicar el costo de compra' };
  const exists = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?').get(codigo.trim());
  if (exists) return { ok: false, message: 'Ese codigo ya esta registrado' };
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

  const transaccion = db.transaction(() => {
    db.prepare(
      `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, created_at)
       VALUES (?, ?, 'disponible', ?, datetime('now'))`
    ).run(product_id, codigo.trim(), costo);
    db.prepare(
      `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'))`
    ).run(product_id, product.tipo, product.nombre, costo, costo, usuario || '');
  });
  transaccion();
  return { ok: true };
});

function calcularRango(codigoInicio, codigoFin) {
  const a = codigoInicio.trim();
  const b = codigoFin.trim();
  if (a.length !== b.length) return { ok: false, message: 'El primer y el ultimo codigo deben tener la misma longitud' };
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
    `INSERT INTO inventory_units (product_id, codigo, estado, costo_unitario_usd, created_at) VALUES (?, ?, 'disponible', ?, datetime('now'))`
  );
  const existsStmt = db.prepare('SELECT id FROM inventory_units WHERE codigo = ?');
  let agregados = 0;
  let saltados = 0;
  const transaccion = db.transaction((codigos) => {
    for (const codigo of codigos) {
      if (existsStmt.get(codigo)) { saltados++; continue; }
      insertStmt.run(product_id, codigo, costo);
      agregados++;
    }
    if (agregados > 0) {
      db.prepare(
        `INSERT INTO compras (product_id, tipo, descripcion, costo_unitario_usd, cantidad, total_usd, usuario, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(product_id, product.tipo, product.nombre, costo, agregados, costo * agregados, usuario || '');
    }
  });
  transaccion(rango.codigos);
  return { ok: true, total: rango.codigos.length, agregados, saltados };
});

ipcMain.handle('units:updateCosto', (event, { id, costoUnitario }) => {
  const db = getDb();
  const costo = parseFloat(costoUnitario);
  if (isNaN(costo) || costo < 0) return { ok: false, message: 'Costo invalido' };
  db.prepare('UPDATE inventory_units SET costo_unitario_usd = ? WHERE id = ?').run(costo, id);
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
ipcMain.handle('clientes:list', () => {
  const db = getDb();
  return db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
});

ipcMain.handle('clientes:search', (event, { query }) => {
  const db = getDb();
  const q = `%${(query || '').trim()}%`;
  return db
    .prepare('SELECT * FROM clientes WHERE nombre LIKE ? OR rif_cedula LIKE ? ORDER BY nombre LIMIT 20')
    .all(q, q);
});

ipcMain.handle('clientes:create', (event, data) => {
  const db = getDb();
  const { nombre, rif_cedula, telefono, direccion, email } = data;
  if (!nombre || !nombre.trim()) return { ok: false, message: 'El nombre del cliente es obligatorio' };
  const info = db
    .prepare(
      `INSERT INTO clientes (nombre, rif_cedula, telefono, direccion, email, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(nombre.trim(), rif_cedula || '', telefono || '', direccion || '', email || '');
  return { ok: true, id: info.lastInsertRowid };
});

// ---------- IPC: Facturacion ----------
ipcMain.handle('facturas:crear', (event, payload) => {
  const db = getDb();
  const { cliente, items, usuario, sinCliente } = payload;

  if (!items || items.length === 0) {
    return { ok: false, message: 'La factura debe tener al menos un producto' };
  }
  if (!sinCliente && !(cliente && (cliente.id || (cliente.nombre && cliente.nombre.trim())))) {
    return { ok: false, message: 'Selecciona un cliente registrado, crea uno nuevo, o marca "Consumidor final"' };
  }

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
      if (item.cantidad > product.stock_cantidad) {
        return { ok: false, message: `Stock insuficiente de "${product.nombre}"` };
      }
    } else {
      if (!item.unit_id) return { ok: false, message: `Falta seleccionar el codigo (IMEI/SIM/USIM) de "${product.nombre}"` };
      const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(item.unit_id);
      if (!unit || unit.estado !== 'disponible') {
        return { ok: false, message: `El codigo seleccionado de "${product.nombre}" ya no esta disponible` };
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
             VALUES (?, ?, ?, ?, ?, datetime('now'))`
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
         (cliente_id, cliente_nombre, cliente_rif, cliente_direccion, numero_factura, subtotal_usd, iva_usd, total_usd, tasa_cambio, subtotal_bs, iva_bs, total_bs, iva_porcentaje, usuario, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(clienteId, clienteNombre, clienteRif, clienteDireccion, numeroFacturaStr, subtotalUsd, ivaUsd, totalUsd, tasaCambio, subtotalBs, ivaBs, totalBs, ivaPorcentaje, usuario || '');

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
        db.prepare('UPDATE products SET stock_cantidad = stock_cantidad - ? WHERE id = ?').run(cantidad, product.id);
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
    `INSERT INTO gastos (concepto, categoria, monto_usd, usuario, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
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
