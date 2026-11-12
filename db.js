const fs = require('fs');
const path = require('path');

// Controlador SQLite: usa better-sqlite3 si está instalado y, si no, el SQLite integrado de Node (22.5+).
// Así el proyecto arranca aunque la compilación nativa de better-sqlite3 falle en tu equipo.
const file = process.env.DB_FILE || path.join(__dirname, 'smartcart.db');
let db;
try {
  if (process.env.DB_DRIVER === 'node') throw new Error('forzado');
  const Database = require('better-sqlite3');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (e) {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch (_) {
    console.error('No hay controlador SQLite. Ejecuta "npm install" (better-sqlite3) o usa Node.js 22.5 o superior.');
    process.exit(1);
  }
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db = {
    exec: sql => raw.exec(sql),
    prepare: sql => raw.prepare(sql),
    transaction: fn => (...args) => {
      raw.exec('BEGIN');
      try { const r = fn(...args); raw.exec('COMMIT'); return r; } catch (err) { raw.exec('ROLLBACK'); throw err; }
    },
  };
}
db.driver = db.constructor?.name === 'Database' ? 'better-sqlite3' : 'node:sqlite';

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const PRODUCTOS = [
  ['Teclado Mecánico RGB Pro', 'Switches mecánicos, iluminación RGB por tecla y estructura de aluminio. Ideal para programar y jugar.', 45, 'tech', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600', 25],
  ['Mouse Gamer Inalámbrico 16K', 'Sensor óptico de 16.000 DPI, conexión inalámbrica de baja latencia y 70 horas de batería.', 25, 'tech', 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600', 40],
  ['Audífonos Surround 7.1', 'Sonido envolvente virtual 7.1, micrófono con cancelación de ruido y almohadillas memory foam.', 35, 'tech', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600', 30],
  ['Mousepad XL Speed Surface', 'Superficie de baja fricción de 90×40 cm con base antideslizante y bordes cosidos.', 15, 'accessories', 'https://images.unsplash.com/photo-1616440347437-b1c73416ef22?w=600', 60],
  ['Soporte de Aluminio para Monitor', 'Eleva el monitor a la altura de los ojos y deja espacio debajo para el teclado y los cables.', 30, 'accessories', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600', 20],
  ['Hub USB-C 7 en 1 Multiport', 'HDMI 4K, 3 puertos USB 3.0, lector SD/microSD y carga Power Delivery de 100 W.', 40, 'tech', 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600', 35],
];

if (db.prepare('SELECT COUNT(*) n FROM productos').get().n === 0) {
  const ins = db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria, imagen_url, stock) VALUES (?,?,?,?,?,?)');
  db.transaction(() => PRODUCTOS.forEach(p => ins.run(...p)))();
}

// Pedidos de demostración (origen = 'demo') para que las gráficas tengan historial desde el primer arranque.
if (db.prepare('SELECT COUNT(*) n FROM pedidos').get().n === 0) {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const prods = db.prepare('SELECT id, precio FROM productos').all();
  const insP = db.prepare("INSERT INTO pedidos (cliente,email,direccion,metodo_pago,subtotal,envio,total,origen,creado_en) VALUES ('Cliente demo','demo@smartcart.test','Dirección demo','tarjeta',?,?,?,'demo',?)");
  const insI = db.prepare('INSERT INTO pedido_items (pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)');
  const now = new Date();
  db.transaction(() => {
    for (let m = 5; m >= 0; m--) {
      const n = 6 + Math.floor(rnd() * 9);
      for (let k = 0; k < n; k++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1 + Math.floor(rnd() * 27), 12));
        if (d > now) continue;
        const lineas = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ p: prods[Math.floor(rnd() * prods.length)], c: 1 + Math.floor(rnd() * 2) }));
        const subtotal = lineas.reduce((s, l) => s + l.p.precio * l.c, 0);
        const envio = subtotal >= 100 ? 0 : 5;
        const id = insP.run(subtotal, envio, subtotal + envio, d.toISOString().slice(0, 19).replace('T', ' ')).lastInsertRowid;
        lineas.forEach(l => insI.run(id, l.p.id, l.c, l.p.precio));
      }
    }
  })();
}

module.exports = db;
