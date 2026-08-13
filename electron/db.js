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
      tipo TEXT NOT NULL CHECK(tipo IN ('equipo','simcard','accesorio')),
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
      estado TEXT NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible','vendido')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
  // Semilla: tasa de cambio y moneda principal, solo si no existen
  const insertSetting = database.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('tasa_cambio', '1');
  insertSetting.run('moneda_principal', 'USD');
  insertSetting.run('nombre_tienda', 'Tienda Movistar');
  insertSetting.run('rif_tienda', '');

  // Semilla: categorias iniciales, solo si no existen
  const insertCategoria = database.prepare(
    'INSERT OR IGNORE INTO categorias (nombre, created_at) VALUES (?, datetime(\'now\'))'
  );
  insertCategoria.run('Telefono');
  insertCategoria.run('SimCard');
  insertCategoria.run('Accesorios');
  
  // Semilla: usuario administrador por defecto, solo si no hay ningun usuario
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
