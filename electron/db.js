const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
let db;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'facturacion.db');
}

function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function migrarProductsSiHaceFalta(database) {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")
    .get();
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
  const existeTabla = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facturas'")
    .get();
  if (!existeTabla) return;
  const cols = database.prepare('PRAGMA table_info(facturas)').all();
  const tieneNumero = cols.some((c) => c.name === 'numero_factura');
  if (!tieneNumero) {
    database.exec('ALTER TABLE facturas ADD COLUMN numero_factura TEXT');
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
  `);

  migrarProductsSiHaceFalta(database);
  migrarFacturasSiHaceFalta(database);

  const insertSetting = database.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('tasa_cambio', '1');
  insertSetting.run('moneda_principal', 'USD');
  insertSetting.run('nombre_tienda', 'Tienda Movistar');
  insertSetting.run('rif_tienda', '');
  insertSetting.run('iva_porcentaje', '16');
  insertSetting.run('numero_factura_siguiente', '1');

  const insertCategoria = database.prepare(
    'INSERT OR IGNORE INTO categorias (nombre, created_at) VALUES (?, datetime(\'now\'))'
  );
  insertCategoria.run('Telefono');
  insertCategoria.run('SimCard');
  insertCategoria.run('Usim');
  insertCategoria.run('Accesorios');

  const userCount = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    database
      .prepare(
        "INSERT INTO users (username, password_hash, full_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))"
      )
      .run('admin', hash, 'Administrador', 'administrador');
  }
}
module.exports = { getDb, initDb };
