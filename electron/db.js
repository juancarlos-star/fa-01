const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
let db;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, 'facturacion.db');
}

function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function cerrarDb() {
  if (db) { db.close(); db = null; }
}

function tieneColumna(database, tabla, columna) {
  return database.prepare(`PRAGMA table_info(${tabla})`).all().some((c) => c.name === columna);
}

function migrarProductsSiHaceFalta(database) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get();
  if (row && row.sql && row.sql.includes("'accesorio'") && !row.sql.includes("'usim'")) {
    database.exec(`
      ALTER TABLE products RENAME TO products_old;
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL CHECK(tipo IN ('equipo','simcard','usim','accesorio')),
        nombre TEXT NOT NULL,
        categoria TEXT,
        precio REAL NOT NULL DEFAULT 0,
        stock_minimo INTEGER NOT NULL DEFAULT 0,
        stock_cantidad INTEGER NOT NULL DEFAULT 0,
        codigo_barras TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO products (id, tipo, nombre, categoria, precio, stock_minimo, stock_cantidad, codigo_barras, created_at)
        SELECT id, tipo, nombre, categoria, precio, stock_minimo, stock_cantidad, codigo_barras, created_at FROM products_old;
      DROP TABLE products_old;
    `);
  }
}

function migrarFacturasSiHaceFalta(database) {
  const existe = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facturas'").get();
  if (!existe) return;
  if (!tieneColumna(database, 'facturas', 'numero_factura')) {
    database.exec('ALTER TABLE facturas ADD COLUMN numero_factura TEXT');
  }
  if (!tieneColumna(database, 'facturas', 'cliente_direccion')) {
    database.exec('ALTER TABLE facturas ADD COLUMN cliente_direccion TEXT');
  }
}

function migrarCostosSiHaceFalta(database) {
  const existeProducts = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
  if (existeProducts && !tieneColumna(database, 'products', 'costo_promedio_usd')) {
    database.exec('ALTER TABLE products ADD COLUMN costo_promedio_usd REAL NOT NULL DEFAULT 0');
  }
  const existeUnits = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units'").get();
  if (existeUnits && !tieneColumna(database, 'inventory_units', 'costo_unitario_usd')) {
    database.exec('ALTER TABLE inventory_units ADD COLUMN costo_unitario_usd REAL NOT NULL DEFAULT 0');
  }
  const existeItems = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='factura_items'").get();
  if (existeItems && !tieneColumna(database, 'factura_items', 'costo_unitario_usd')) {
    database.exec('ALTER TABLE factura_items ADD COLUMN costo_unitario_usd REAL NOT NULL DEFAULT 0');
  }
}

function migrarCategoriasSiHaceFalta(database) {
  const existe = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categorias'").get();
  if (!existe) return;
  if (!tieneColumna(database, 'categorias', 'tipo')) {
    database.exec("ALTER TABLE categorias ADD COLUMN tipo TEXT NOT NULL DEFAULT 'accesorio'");
    const mapa = { 'Telefono': 'equipo', 'SimCard': 'simcard', 'Usim': 'usim', 'Accesorios': 'accesorio' };
    const update = database.prepare('UPDATE categorias SET tipo = ? WHERE nombre = ?');
    Object.keys(mapa).forEach((nombre) => update.run(mapa[nombre], nombre));
  }
}

// La tabla "users" es la unica tabla del sistema que nunca tuvo una funcion de migracion
// propia. Si la base de datos fue creada por una version anterior de la app cuyo esquema de
// "users" no tenia exactamente estas columnas, cualquier intento de INSERT (crear usuario)
// falla con un error de SQLite ("table users has no column named ...") que antes se perdia
// silenciosamente en el proceso principal: el boton "Crear usuario" no mostraba ningun error
// y el usuario nunca se creaba ni aparecia en la lista. Esta funcion asegura que las columnas
// existan, agregandolas con valores por defecto razonables si hace falta.
function migrarUsersSiHaceFalta(database) {
  const existe = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!existe) return;
  if (!tieneColumna(database, 'users', 'full_name')) {
    database.exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''");
  }
  if (!tieneColumna(database, 'users', 'role')) {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'vendedor'");
  }
  if (!tieneColumna(database, 'users', 'active')) {
    database.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  }
}

function migrarComprasSiHaceFalta(database) {
  const existe = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compras'").get();
  if (existe && !tieneColumna(database, 'compras', 'compra_encabezado_id')) {
    database.exec('ALTER TABLE compras ADD COLUMN compra_encabezado_id INTEGER');
  }
  // Vincula cada registro de cargo (compras) con la unidad de inventario (IMEI/codigo)
  // individual a la que corresponde, cuando aplica (equipo/simcard/usim). Esto permite
  // mostrar el codigo visible de cada unidad en el registro de cargos/descargos, igual
  // que ya se hace en "descargos" a traves de unit_id.
  if (existe && !tieneColumna(database, 'compras', 'unit_id')) {
    database.exec('ALTER TABLE compras ADD COLUMN unit_id INTEGER');
  }
  // Vincula cada unidad de inventario (IMEI/codigo) con la compra en la que entro, para poder
  // mostrar en el reporte de compras (factura de compra) todos los codigos de esa compra.
  const existeUnits = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units'").get();
  if (existeUnits && !tieneColumna(database, 'inventory_units', 'compra_encabezado_id')) {
    database.exec('ALTER TABLE inventory_units ADD COLUMN compra_encabezado_id INTEGER');
  }
}

// Permite agrupar varios renglones de cargo o descargo (incluso de productos distintos:
// equipos, simcards, usim y accesorios mezclados) bajo un mismo "documento", para poder
// imprimir un solo comprobante consolidado y llevar la operacion como un unico procedimiento.
// Depositos (almacenes): cada deposito lleva su propio stock, separado del resto. Se agrega la
// tabla de depositos, la tabla de stock de accesorios por deposito (los accesorios no tienen
// unidad individual, asi que su stock por deposito se lleva aparte, sumando/restando cantidad)
// y la columna deposito_id en las tablas que registran movimiento de inventario (unidades,
// compras, descargos y facturas), para saber de que deposito entro o salio cada cosa.
function migrarDepositosSiHaceFalta(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS depositos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_stock_deposito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (deposito_id) REFERENCES depositos(id),
      UNIQUE(product_id, deposito_id)
    );
  `);

  const totalDepositos = database.prepare('SELECT COUNT(*) AS c FROM depositos').get().c;
  let principalId;
  if (totalDepositos === 0) {
    principalId = database.prepare(
      "INSERT INTO depositos (codigo, nombre, activo, created_at) VALUES ('01', 'Principal', 1, datetime('now','localtime'))"
    ).run().lastInsertRowid;
  } else {
    principalId = database.prepare('SELECT id FROM depositos ORDER BY id ASC LIMIT 1').get().id;
  }

  if (!tieneColumna(database, 'inventory_units', 'deposito_id')) {
    database.exec('ALTER TABLE inventory_units ADD COLUMN deposito_id INTEGER');
    database.prepare('UPDATE inventory_units SET deposito_id = ? WHERE deposito_id IS NULL').run(principalId);
  }
  if (!tieneColumna(database, 'compras', 'deposito_id')) {
    database.exec('ALTER TABLE compras ADD COLUMN deposito_id INTEGER');
    database.prepare('UPDATE compras SET deposito_id = ? WHERE deposito_id IS NULL').run(principalId);
  }
  if (!tieneColumna(database, 'descargos', 'deposito_id')) {
    database.exec('ALTER TABLE descargos ADD COLUMN deposito_id INTEGER');
    database.prepare('UPDATE descargos SET deposito_id = ? WHERE deposito_id IS NULL').run(principalId);
  }
  if (!tieneColumna(database, 'facturas', 'deposito_id')) {
    database.exec('ALTER TABLE facturas ADD COLUMN deposito_id INTEGER');
    database.prepare('UPDATE facturas SET deposito_id = ? WHERE deposito_id IS NULL').run(principalId);
  }

  // Backfill: todo el stock actual de accesorios (que hasta ahora era un solo numero agregado
  // en products.stock_cantidad) se asigna al deposito principal, para que la suma por deposito
  // siga cuadrando con el total que ya tenia cada producto.
  const existeProducts = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
  if (existeProducts) {
    const accesorios = database.prepare("SELECT id, stock_cantidad FROM products WHERE tipo = 'accesorio'").all();
    const upsert = database.prepare(
      `INSERT INTO product_stock_deposito (product_id, deposito_id, cantidad) VALUES (?, ?, ?)
       ON CONFLICT(product_id, deposito_id) DO NOTHING`
    );
    for (const p of accesorios) upsert.run(p.id, principalId, p.stock_cantidad || 0);
  }
}

// "codigo_producto": codigo corto que el usuario asigna al crear el producto (ej. "ss24"), usado
// como filtro rapido en Facturacion para ubicar el producto al escribirlo y presionar Enter.
// "precio2": segundo precio de venta (ademas del ya existente "precio", que pasa a ser el
// Precio 1). Permite manejar, por ejemplo, un precio en Bs y otro en Dolares para el mismo
// producto.
function migrarPreciosYCodigoProductoSiHaceFalta(database) {
  const existeProducts = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
  if (!existeProducts) return;
  if (!tieneColumna(database, 'products', 'codigo_producto')) {
    database.exec('ALTER TABLE products ADD COLUMN codigo_producto TEXT');
  }
  if (!tieneColumna(database, 'products', 'precio2')) {
    database.exec('ALTER TABLE products ADD COLUMN precio2 REAL NOT NULL DEFAULT 0');
  }
  // Indice unico parcial: dos productos no pueden compartir el mismo codigo_producto, pero se
  // permite que muchos productos no tengan ninguno (NULL), asi los productos ya existentes que
  // nunca reciban un codigo no chocan entre si.
  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_codigo_producto ON products(codigo_producto) WHERE codigo_producto IS NOT NULL'
  );
}

function migrarCargosDescargosEncabezadoSiHaceFalta(database) {
  const existeCompras = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compras'").get();
  if (existeCompras && !tieneColumna(database, 'compras', 'encabezado_id')) {
    database.exec('ALTER TABLE compras ADD COLUMN encabezado_id INTEGER');
  }
  const existeDescargos = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='descargos'").get();
  if (existeDescargos && !tieneColumna(database, 'descargos', 'encabezado_id')) {
    database.exec('ALTER TABLE descargos ADD COLUMN encabezado_id INTEGER');
  }
}

// Campos adicionales del cliente, para que la ventana de "Cliente nuevo" en Facturacion
// (identica a la del modulo de Clientes del software Saint) pueda guardar Tipo de Cliente,
// Movil, las 3 Redes Sociales y Notas, ademas de los campos que ya existian.
function migrarClientesCamposSiHaceFalta(database) {
  const existe = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clientes'").get();
  if (!existe) return;
  if (!tieneColumna(database, 'clientes', 'tipo_cliente')) {
    database.exec("ALTER TABLE clientes ADD COLUMN tipo_cliente TEXT NOT NULL DEFAULT 'Natural'");
  }
  if (!tieneColumna(database, 'clientes', 'movil')) {
    database.exec('ALTER TABLE clientes ADD COLUMN movil TEXT');
  }
  if (!tieneColumna(database, 'clientes', 'red_social1')) {
    database.exec('ALTER TABLE clientes ADD COLUMN red_social1 TEXT');
  }
  if (!tieneColumna(database, 'clientes', 'red_social2')) {
    database.exec('ALTER TABLE clientes ADD COLUMN red_social2 TEXT');
  }
  if (!tieneColumna(database, 'clientes', 'red_social3')) {
    database.exec('ALTER TABLE clientes ADD COLUMN red_social3 TEXT');
  }
  if (!tieneColumna(database, 'clientes', 'notas')) {
    database.exec('ALTER TABLE clientes ADD COLUMN notas TEXT');
  }
}

// Modulo de Compras (rediseño estilo Facturacion): el proveedor ahora es una entidad guardada
// (tabla "proveedores"), igual que el cliente en Facturacion, en vez de un simple texto libre.
// compras_encabezado guarda una "foto" (snapshot) del proveedor al momento de la compra
// (proveedor_id + rif/telefono/direccion), ademas de la moneda en la que se registro el costo.
// La columna "proveedor" (nombre) ya existia y se sigue llenando, para no romper las pantallas
// que ya la usan (historial de compras / PDF).
function migrarProveedoresYComprasEncabezadoSiHaceFalta(database) {
  const existeCompras = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compras_encabezado'").get();
  if (!existeCompras) return;
  if (!tieneColumna(database, 'compras_encabezado', 'proveedor_id')) {
    database.exec('ALTER TABLE compras_encabezado ADD COLUMN proveedor_id INTEGER');
  }
  if (!tieneColumna(database, 'compras_encabezado', 'proveedor_rif')) {
    database.exec('ALTER TABLE compras_encabezado ADD COLUMN proveedor_rif TEXT');
  }
  if (!tieneColumna(database, 'compras_encabezado', 'proveedor_telefono')) {
    database.exec('ALTER TABLE compras_encabezado ADD COLUMN proveedor_telefono TEXT');
  }
  if (!tieneColumna(database, 'compras_encabezado', 'proveedor_direccion')) {
    database.exec('ALTER TABLE compras_encabezado ADD COLUMN proveedor_direccion TEXT');
  }
  if (!tieneColumna(database, 'compras_encabezado', 'moneda')) {
    database.exec("ALTER TABLE compras_encabezado ADD COLUMN moneda TEXT NOT NULL DEFAULT 'Bs'");
  }
}

// Modulo de Devolucion de Compras: una devolucion se guarda como su PROPIO encabezado de
// compra (con total NEGATIVO), enlazado al encabezado original que se esta devolviendo. Asi,
// los reportes que ya suman compras_encabezado.total_usd por rango de fechas reflejan la
// devolucion automaticamente en el mes en que se REALIZA la devolucion (no en el mes de la
// compra original, que se mantiene intacto como registro historico). "es_devolucion" permite
// distinguir un encabezado de devolucion de una compra normal en la misma tabla.
function migrarDevolucionesCompraSiHaceFalta(database) {
  const existeCompras = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compras_encabezado'").get();
  if (existeCompras) {
    if (!tieneColumna(database, 'compras_encabezado', 'es_devolucion')) {
      database.exec('ALTER TABLE compras_encabezado ADD COLUMN es_devolucion INTEGER NOT NULL DEFAULT 0');
    }
    if (!tieneColumna(database, 'compras_encabezado', 'devuelve_a_encabezado_id')) {
      database.exec('ALTER TABLE compras_encabezado ADD COLUMN devuelve_a_encabezado_id INTEGER');
    }
  }
  const existeComprasDetalle = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compras'").get();
  if (existeComprasDetalle && !tieneColumna(database, 'compras', 'es_devolucion')) {
    database.exec('ALTER TABLE compras ADD COLUMN es_devolucion INTEGER NOT NULL DEFAULT 0');
  }
  // Solo para renglones de devolucion: el costo promedio que tenia el producto en ese momento,
  // para poder mostrar en el reporte la diferencia contra el costo con el que se compro
  // originalmente.
  if (existeComprasDetalle && !tieneColumna(database, 'compras', 'costo_actual_producto_usd')) {
    database.exec('ALTER TABLE compras ADD COLUMN costo_actual_producto_usd REAL');
  }
  const existeUnidades = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_units'").get();
  if (existeUnidades && !tieneColumna(database, 'inventory_units', 'devolucion_encabezado_id')) {
    database.exec('ALTER TABLE inventory_units ADD COLUMN devolucion_encabezado_id INTEGER');
  }
}

function initDb() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('administrador','vendedor')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'accesorio' CHECK(tipo IN ('equipo','simcard','usim','accesorio')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('equipo','simcard','usim','accesorio')),
      nombre TEXT NOT NULL,
      categoria TEXT,
      precio REAL NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 0,
      stock_cantidad INTEGER NOT NULL DEFAULT 0,
      codigo_barras TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      codigo TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible','vendido','de_baja')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS descargos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      unit_id INTEGER,
      cantidad INTEGER NOT NULL DEFAULT 1,
      motivo TEXT NOT NULL,
      usuario TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      rif_cedula TEXT,
      telefono TEXT,
      direccion TEXT,
      email TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      rif TEXT,
      telefono TEXT,
      direccion TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente_nombre TEXT,
      cliente_rif TEXT,
      cliente_direccion TEXT,
      numero_factura TEXT,
      subtotal_usd REAL NOT NULL,
      iva_usd REAL NOT NULL,
      total_usd REAL NOT NULL,
      tasa_cambio REAL NOT NULL,
      subtotal_bs REAL NOT NULL,
      iva_bs REAL NOT NULL,
      total_bs REAL NOT NULL,
      iva_porcentaje REAL NOT NULL,
      usuario TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
    CREATE TABLE IF NOT EXISTS factura_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      product_id INTEGER,
      unit_id INTEGER,
      tipo TEXT,
      descripcion TEXT NOT NULL,
      codigo TEXT,
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario_usd REAL NOT NULL,
      subtotal_usd REAL NOT NULL,
      costo_unitario_usd REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    );
    CREATE TABLE IF NOT EXISTS compras_encabezado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor TEXT NOT NULL,
      numero_factura_compra TEXT NOT NULL,
      total_usd REAL NOT NULL DEFAULT 0,
      usuario TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      tipo TEXT,
      descripcion TEXT,
      costo_unitario_usd REAL NOT NULL,
      cantidad INTEGER NOT NULL,
      total_usd REAL NOT NULL,
      usuario TEXT,
      created_at TEXT NOT NULL,
      compra_encabezado_id INTEGER,
      unit_id INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (compra_encabezado_id) REFERENCES compras_encabezado(id),
      FOREIGN KEY (unit_id) REFERENCES inventory_units(id)
    );
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT,
      monto_usd REAL NOT NULL,
      usuario TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cargos_descargos_encabezado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_documento TEXT NOT NULL CHECK(tipo_documento IN ('cargo','descargo')),
      motivo TEXT,
      usuario TEXT,
      created_at TEXT NOT NULL
    );
  `);

  migrarProductsSiHaceFalta(database);
  migrarFacturasSiHaceFalta(database);
  migrarCostosSiHaceFalta(database);
  migrarCategoriasSiHaceFalta(database);
  migrarComprasSiHaceFalta(database);
  migrarUsersSiHaceFalta(database);
  migrarCargosDescargosEncabezadoSiHaceFalta(database);
  migrarDepositosSiHaceFalta(database);
  migrarPreciosYCodigoProductoSiHaceFalta(database);
  migrarClientesCamposSiHaceFalta(database);
  migrarProveedoresYComprasEncabezadoSiHaceFalta(database);
  migrarDevolucionesCompraSiHaceFalta(database);

  const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('tasa_cambio', '1');
  insertSetting.run('moneda_principal', 'USD');
  insertSetting.run('nombre_tienda', 'Tienda Movistar');
  insertSetting.run('rif_tienda', '');
  insertSetting.run('iva_porcentaje', '16');
  insertSetting.run('numero_factura_siguiente', '1');

  const insertCategoria = database.prepare("INSERT OR IGNORE INTO categorias (nombre, tipo, created_at) VALUES (?, ?, datetime('now','localtime'))");
  insertCategoria.run('Telefono', 'equipo');
  insertCategoria.run('SimCard', 'simcard');
  insertCategoria.run('Usim', 'usim');
  insertCategoria.run('Accesorios', 'accesorio');

  const userCount = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    database.prepare(
      "INSERT INTO users (username, password_hash, full_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, datetime('now','localtime'))"
    ).run('admin', hash, 'Administrador', 'administrador');
  }
}
module.exports = { getDb, initDb, cerrarDb, getDbPath };
