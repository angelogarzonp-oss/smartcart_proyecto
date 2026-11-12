-- Esquema relacional de SmartCart (SQLite). La versión MySQL está en mysql/database_export.sql
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio REAL NOT NULL CHECK (precio >= 0),
  categoria TEXT NOT NULL,
  imagen_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  direccion TEXT NOT NULL,
  metodo_pago TEXT NOT NULL,
  subtotal REAL NOT NULL,
  envio REAL NOT NULL,
  total REAL NOT NULL,
  origen TEXT NOT NULL DEFAULT 'web',
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pedidos_email ON pedidos(email);
