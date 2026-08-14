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
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
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
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT,
      monto_usd REAL NOT NULL,
      usuario TEXT,
      created_at TEXT NOT NULL
    );
  `);

  migrarProductsSiHaceFalta(database);
  migrarFacturasSiHaceFalta(database);
  migrarCostosSiHaceFalta(database);
  migrarCategoriasSiHaceFalta(database);

  const insertSetting = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('tasa_cambio', '1');
  insertSetting.run('moneda_principal', 'USD');
  insertSetting.run('nombre_tienda', 'Tienda Movistar');
  insertSetting.run('rif_tienda', '');
  insertSetting.run('iva_porcentaje', '16');
  insertSetting.run('numero_factura_siguiente', '1');

  const insertCategoria = database.prepare("INSERT OR IGNORE INTO categorias (nombre, tipo, created_at) VALUES (?, ?, datetime('now'))");
  insertCategoria.run('Telefono', 'equipo');
  insertCategoria.run('SimCard', 'simcard');
  insertCategoria.run('Usim', 'usim');
  insertCategoria.run('Accesorios', 'accesorio');

  const userCount = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    database.prepare(
      "INSERT INTO users (username, password_hash, full_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))"
    ).run('admin', hash, 'Administrador', 'administrador');
  }
}
module.exports = { getDb, initDb, cerrarDb, getDbPath };
