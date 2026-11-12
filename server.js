const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CFG = { moneda: 'USD', envio: 5, envioGratisDesde: 100 };
const CAT = { tech: 'Hardware', accessories: 'Periféricos' };
const METODOS = ['tarjeta', 'pse', 'contraentrega'];
const round2 = n => Math.round(n * 100) / 100;

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n).toFixed(2);

app.use(express.json({ limit: '50kb' }));

// ---------- Librerías servidas localmente (sin CDN, funciona sin internet) ----------
const VENDOR = {
  'alpine.js': 'node_modules/alpinejs/dist/cdn.min.js',
  'htmx.js': 'node_modules/htmx.org/dist/htmx.min.js',
  'chart.js': 'node_modules/chart.js/dist/chart.umd.js',
};
for (const [name, file] of Object.entries(VENDOR)) {
  app.get('/vendor/' + name, (req, res) => res.sendFile(path.join(__dirname, file), { maxAge: '7d' }));
}
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API REST (JSON) ----------
const ORDEN = { default: 'id ASC', 'low-high': 'precio ASC, id ASC', 'high-low': 'precio DESC, id ASC', nombre: 'nombre COLLATE NOCASE ASC' };
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function buscar({ q = '', categoria = 'all', orden = 'default' }) {
  const lista = db.prepare(`SELECT * FROM productos WHERE (@cat = 'all' OR categoria = @cat) ORDER BY ${ORDEN[orden] || ORDEN.default}`)
    .all({ cat: CAT[categoria] ? categoria : 'all' });
  const t = norm(String(q).trim().slice(0, 80));   // búsqueda sin distinguir tildes ni mayúsculas
  return t ? lista.filter(p => norm(p.nombre + ' ' + p.descripcion).includes(t)) : lista;
}

app.get('/api/config', (req, res) => res.json(CFG));
app.get('/api/salud', (req, res) => res.json({
  ok: true,
  sqlite: db.prepare('SELECT sqlite_version() v').get().v,
  driver: db.driver,
  productos: db.prepare('SELECT COUNT(*) n FROM productos').get().n,
  uptime_s: Math.round(process.uptime()),
}));
app.get('/api/productos', (req, res) => res.json(buscar(req.query)));
app.get('/api/productos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json(p);
});

const crearPedido = db.transaction((cliente, items) => {
  const getP = db.prepare('SELECT * FROM productos WHERE id = ?');
  const upd = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?');
  let subtotal = 0;
  const lineas = items.map(({ id, cantidad }) => {
    const p = getP.get(id);
    if (!p) throw new HttpError(400, `El producto ${id} ya no existe`);
    if (upd.run(cantidad, id, cantidad).changes === 0) throw new HttpError(409, `Stock insuficiente para "${p.nombre}" (quedan ${p.stock})`);
    subtotal += p.precio * cantidad;
    return { producto_id: id, nombre: p.nombre, cantidad, precio_unitario: p.precio };
  });
  subtotal = round2(subtotal);
  const envio = subtotal >= CFG.envioGratisDesde ? 0 : CFG.envio;
  const total = round2(subtotal + envio);
  const id = db.prepare('INSERT INTO pedidos (cliente,email,direccion,metodo_pago,subtotal,envio,total) VALUES (?,?,?,?,?,?,?)')
    .run(cliente.nombre, cliente.email, cliente.direccion, cliente.metodo_pago, subtotal, envio, total).lastInsertRowid;
  const insI = db.prepare('INSERT INTO pedido_items (pedido_id,producto_id,cantidad,precio_unitario) VALUES (?,?,?,?)');
  lineas.forEach(l => insI.run(id, l.producto_id, l.cantidad, l.precio_unitario));
  return { id, subtotal, envio, total, items: lineas };
});

app.post('/api/pedidos', (req, res) => {
  const c = req.body?.cliente || {}, items = req.body?.items;
  const cliente = {
    nombre: String(c.nombre || '').trim(), email: String(c.email || '').trim().toLowerCase(),
    direccion: String(c.direccion || '').trim(), metodo_pago: String(c.metodo_pago || ''),
  };
  if (cliente.nombre.length < 2 || cliente.nombre.length > 80) throw new HttpError(400, 'Escribe tu nombre (2 a 80 caracteres)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) throw new HttpError(400, 'El correo no es válido');
  if (cliente.direccion.length < 5 || cliente.direccion.length > 200) throw new HttpError(400, 'Escribe una dirección de entrega completa');
  if (!METODOS.includes(cliente.metodo_pago)) throw new HttpError(400, 'Elige un método de pago');
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) throw new HttpError(400, 'El carrito está vacío');
  const ids = new Set();
  for (const i of items) {
    if (!Number.isInteger(i.id) || !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 20 || ids.has(i.id)) throw new HttpError(400, 'El carrito tiene datos no válidos');
    ids.add(i.id);
  }
  res.status(201).json(crearPedido(cliente, items));
});

app.get('/api/pedidos', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Indica el correo con el que compraste');
  const pedidos = db.prepare('SELECT id, total, envio, metodo_pago, creado_en FROM pedidos WHERE lower(email) = ? ORDER BY id DESC LIMIT 20').all(email);
  const itemsQ = db.prepare('SELECT i.cantidad, i.precio_unitario, p.nombre FROM pedido_items i JOIN productos p ON p.id = i.producto_id WHERE i.pedido_id = ?');
  res.json(pedidos.map(p => ({ ...p, items: itemsQ.all(p.id) })));
});

app.get('/api/metricas', (req, res) => {
  const porMes = db.prepare("SELECT strftime('%Y-%m', creado_en) mes, ROUND(SUM(total),2) total, COUNT(*) pedidos FROM pedidos GROUP BY mes ORDER BY mes").all();
  const porCategoria = db.prepare('SELECT p.categoria, ROUND(SUM(i.cantidad * i.precio_unitario),2) total FROM pedido_items i JOIN productos p ON p.id = i.producto_id GROUP BY p.categoria').all()
    .map(r => ({ ...r, etiqueta: CAT[r.categoria] || r.categoria }));
  const tot = db.prepare('SELECT COUNT(*) pedidos, COALESCE(ROUND(SUM(total),2),0) ingresos FROM pedidos').get();
  const peso = file => { const b = fs.readFileSync(path.join(__dirname, file)); return { kb: +(b.length / 1024).toFixed(1), gzip_kb: +(zlib.gzipSync(b).length / 1024).toFixed(1) }; };
  res.json({
    porMes, porCategoria, ...tot,
    librerias: { alpine: peso(VENDOR['alpine.js']), htmx: peso(VENDOR['htmx.js']), chart: peso(VENDOR['chart.js']) },
  });
});

// ---------- Fragmentos HTML para HTMX ----------
const img = p => esc(p.imagen_url || '/img/placeholder.svg');
const FALLBACK = `onerror="this.onerror=null;this.src='/img/placeholder.svg'"`;
function tarjeta(p) {
  const agotado = p.stock === 0;
  return `<article class="card" data-id="${p.id}" data-nombre="${esc(p.nombre)}" data-precio="${p.precio}" data-img="${img(p)}" data-stock="${p.stock}">
  <img src="${img(p)}" alt="${esc(p.nombre)}" loading="lazy" ${FALLBACK}>
  <div class="card-body">
    <span class="tag">${esc(CAT[p.categoria] || p.categoria)}</span>
    <h3>${esc(p.nombre)}</h3>
    <p class="price">${money(p.precio)}</p>
    <p class="stock ${agotado ? 'out' : p.stock <= 10 ? 'low' : ''}">${agotado ? 'Agotado' : p.stock <= 10 ? `Quedan ${p.stock}` : 'Disponible'}</p>
  </div>
  <div class="card-actions">
    <button class="btn btn-ghost" hx-get="/partials/producto/${p.id}" hx-target="#detalle-body" @click="$store.ui.open('detalle')">Ver detalle</button>
    <button class="btn btn-primary" ${agotado ? 'disabled' : ''} @click="$store.cart.addFromEl($el.closest('.card'))">Agregar</button>
  </div>
</article>`;
}
app.get('/partials/productos', (req, res) => {
  const lista = buscar(req.query);
  res.type('html').send(lista.length
    ? `<p class="resultados" role="status">${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}</p>` + lista.map(tarjeta).join('')
    : '<p class="vacio" role="status">No hay productos con esos filtros. Borra la búsqueda o elige otra categoría.</p>');
});
app.get('/partials/producto/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).type('html').send('<p class="vacio">Este producto ya no está disponible.</p>');
  res.type('html').send(`<div class="detalle" data-id="${p.id}" data-nombre="${esc(p.nombre)}" data-precio="${p.precio}" data-img="${img(p)}" data-stock="${p.stock}" x-data="{ q: 1 }">
  <img src="${img(p)}" alt="${esc(p.nombre)}" ${FALLBACK}>
  <div>
    <span class="tag">${esc(CAT[p.categoria] || p.categoria)}</span>
    <h2 id="detalle-titulo">${esc(p.nombre)}</h2>
    <p class="price">${money(p.precio)}</p>
    <p>${esc(p.descripcion)}</p>
    <p class="stock ${p.stock === 0 ? 'out' : p.stock <= 10 ? 'low' : ''}">${p.stock === 0 ? 'Agotado' : `${p.stock} unidades en stock`}</p>
    ${p.stock === 0 ? '' : `<div class="qty-row">
      <label for="q-det">Cantidad</label>
      <input id="q-det" type="number" min="1" max="${Math.min(p.stock, 20)}" x-model.number="q" @change="q = Math.min(Math.max(1, q || 1), ${Math.min(p.stock, 20)})">
      <button class="btn btn-primary" @click="$store.cart.addFromEl($el.closest('.detalle'), q) && $store.ui.open('carrito')">Agregar al carrito</button>
    </div>`}
  </div>
</div>`);
});

// ---------- Errores ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.type === 'entity.parse.failed' ? 'La petición no es un JSON válido' : err.message });
});

if (require.main === module) app.listen(PORT, () => console.log(`SmartCart listo en http://localhost:${PORT}`));
module.exports = app;
