// Lógica del cliente: Alpine.js (estado y componentes) + HTMX (catálogo, ya declarado en el HTML).
document.addEventListener('alpine:init', () => {
  const $ = id => document.getElementById(id);

  Alpine.store('ui', {
    tema: document.documentElement.dataset.theme || 'dark',
    modal: null, paso: 'items', toastMsg: '', _t: null,
    toggleTema() {
      this.tema = this.tema === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.tema;
      try { localStorage.setItem('tema', this.tema); } catch (e) {}
      window.dispatchEvent(new Event('tema'));
    },
    open(m) { this.modal = m; if (m === 'carrito') this.paso = 'items'; document.body.classList.add('lock'); },
    close() { this.modal = null; this.paso = 'items'; document.body.classList.remove('lock'); },
    toast(msg) { this.toastMsg = msg; clearTimeout(this._t); this._t = setTimeout(() => (this.toastMsg = ''), 2600); },
  });

  Alpine.store('cart', {
    items: (() => { try { return JSON.parse(localStorage.getItem('carrito')) || []; } catch (e) { return []; } })(),
    cfg: { envio: 5, envioGratisDesde: 100 },
    async init() { try { this.cfg = await (await fetch('/api/config')).json(); } catch (e) {} },
    save() { try { localStorage.setItem('carrito', JSON.stringify(this.items)); } catch (e) {} },
    addFromEl(el, q = 1) {
      const d = el.dataset;
      return this.add({ id: +d.id, nombre: d.nombre, precio: +d.precio, img: d.img, stock: +d.stock }, q);
    },
    add(p, q = 1) {
      const it = this.items.find(i => i.id === p.id);
      if ((it ? it.cantidad : 0) + q > p.stock) { Alpine.store('ui').toast('No hay más unidades disponibles de este producto'); return false; }
      if (it) { it.cantidad += q; it.stock = p.stock; } else this.items.push({ ...p, cantidad: q });
      this.save(); Alpine.store('ui').toast(`«${p.nombre}» agregado al carrito`); return true;
    },
    setQty(id, q) {
      const it = this.items.find(i => i.id === id); if (!it) return;
      if (q < 1) return this.remove(id);
      if (q > it.stock) { Alpine.store('ui').toast('No hay más unidades disponibles'); return; }
      it.cantidad = q; this.save();
    },
    remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
    clear() { this.items = []; this.save(); },
    get count() { return this.items.reduce((s, i) => s + i.cantidad, 0); },
    get subtotal() { return Math.round(this.items.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100; },
    get envio() { return this.items.length && this.subtotal < this.cfg.envioGratisDesde ? this.cfg.envio : 0; },
    get total() { return Math.round((this.subtotal + this.envio) * 100) / 100; },
  });

  Alpine.data('checkout', () => ({
    f: { nombre: '', email: localStorage.getItem('email') || '', direccion: '', metodo_pago: 'tarjeta' },
    err: {}, error: '', enviando: false, pedido: null,
    init() { this.$watch('$store.ui.paso', v => { if (v === 'items') { this.pedido = null; this.error = ''; } }); },
    validar() {
      const e = {};
      if (this.f.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre completo.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.f.email.trim())) e.email = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
      if (this.f.direccion.trim().length < 5) e.direccion = 'Escribe la dirección completa de entrega.';
      this.err = e; return !Object.keys(e).length;
    },
    async enviar() {
      this.error = '';
      if (!this.validar()) return;
      const cart = Alpine.store('cart');
      this.enviando = true;
      try {
        const r = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente: this.f, items: cart.items.map(i => ({ id: i.id, cantidad: i.cantidad })) }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No se pudo procesar el pedido');
        this.pedido = data; cart.clear();
        try { localStorage.setItem('email', this.f.email.trim().toLowerCase()); } catch (e) {}
        Alpine.store('ui').paso = 'ok';
        htmx.trigger('#filtros', 'change');             // refresca el catálogo con el stock nuevo
        window.dispatchEvent(new Event('pedido-creado')); // refresca métricas
      } catch (e) {
        this.error = e.message;
        if (/stock/i.test(e.message)) htmx.trigger('#filtros', 'change');
      } finally { this.enviando = false; }
    },
  }));

  Alpine.data('pedidos', () => ({
    email: localStorage.getItem('email') || '', lista: [], cargando: false, buscado: false, error: '',
    init() { window.addEventListener('pedido-creado', () => { this.email = localStorage.getItem('email') || this.email; this.buscar(); }); },
    fecha(s) { return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); },
    async buscar() {
      this.cargando = true; this.error = '';
      try {
        const r = await fetch('/api/pedidos?email=' + encodeURIComponent(this.email.trim()));
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
        this.lista = d; this.buscado = true;
      } catch (e) { this.error = e.message || 'No se pudo consultar los pedidos'; } finally { this.cargando = false; }
    },
  }));

  Alpine.data('arquitectura', () => ({
    msg: 'Envía una petición real: Cliente → Servidor → Base de datos.', cargando: false,
    async probar() {
      this.cargando = true; const t = performance.now();
      try {
        const d = await (await fetch('/api/salud')).json();
        this.msg = `Conexión correcta en ${Math.round(performance.now() - t)} ms: el servidor Express consultó SQLite ${d.sqlite} y encontró ${d.productos} productos.`;
      } catch (e) { this.msg = 'No hubo respuesta del servidor. Revisa que `npm start` siga en ejecución.'; }
      this.cargando = false;
    },
  }));

  // Chart.js se descarga solo cuando la sección de métricas entra en pantalla (carga diferida).
  let charts = []; // fuera del estado reactivo: Chart.js no debe pasar por el proxy de Alpine
  let chartP; const cargarChart = () => chartP ||= new Promise((res, rej) => {
    if (window.Chart) return res();
    const s = document.createElement('script'); s.src = '/vendor/chart.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  Alpine.data('metricas', () => ({
    datos: {}, carga: '…', latencia: '…', peso: '…',
    init() {
      const nav = performance.getEntriesByType('navigation')[0];
      const setCarga = () => { const n = performance.getEntriesByType('navigation')[0]; if (n?.domContentLoadedEventEnd) this.carga = Math.round(n.domContentLoadedEventEnd) + ' ms'; };
      nav?.domContentLoadedEventEnd ? setCarga() : addEventListener('load', setCarga);
      new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); this.cargar(); } }, { rootMargin: '300px' }).observe(this.$el);
      window.addEventListener('pedido-creado', () => this.cargar());
      window.addEventListener('tema', () => this.dibujar());
    },
    async cargar() {
      const t = performance.now();
      this.datos = await (await fetch('/api/metricas')).json();
      this.latencia = Math.round(performance.now() - t) + ' ms';
      const l = this.datos.librerias; this.peso = (l.alpine.gzip_kb + l.htmx.gzip_kb).toFixed(1) + ' KB';
      try { await cargarChart(); this.dibujar(); } catch (e) { /* sin Chart.js solo faltan las gráficas */ }
    },
    dibujar() {
      if (!window.Chart || !this.datos.porMes) return;
      charts.forEach(c => c.destroy());
      const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
      Chart.defaults.color = col('--text-muted'); Chart.defaults.font.family = css.fontFamily;
      const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const ventas = new Chart($('c-ventas'), { type: 'bar',
        data: { labels: this.datos.porMes.map(m => MES[+m.mes.slice(5) - 1] + ' ' + m.mes.slice(2, 4)), datasets: [{ label: 'Ventas (USD)', data: this.datos.porMes.map(m => m.total), backgroundColor: col('--primary'), borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: col('--border') } }, x: { grid: { display: false } } } } });
      const cat = new Chart($('c-cat'), { type: 'doughnut',
        data: { labels: this.datos.porCategoria.map(c => c.etiqueta), datasets: [{ data: this.datos.porCategoria.map(c => c.total), backgroundColor: [col('--primary'), col('--gold')], borderColor: col('--card-bg') }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
      charts = [ventas, cat];
    },
  }));
});

// Avisos claros si el servidor o las librerías no están disponibles (p. ej. abrir index.html sin «npm start»).
(() => {
  const aviso = msg => { const a = document.getElementById('aviso'); if (a) { a.textContent = msg; a.hidden = false; } };
  const SIN_SERVIDOR = 'No se pudo conectar con el servidor. Abre una terminal en la carpeta del proyecto, ejecuta «npm install» y luego «npm start», y entra a http://localhost:3000 (no abras index.html directamente).';
  addEventListener('load', () => { if (!window.Alpine || !window.htmx) aviso(SIN_SERVIDOR); });
  document.addEventListener('htmx:sendError', () => {
    aviso(SIN_SERVIDOR);
    const g = document.getElementById('grid'); if (g && !g.children.length) g.innerHTML = '<p class="vacio">El catálogo no pudo cargarse.</p>';
  });
  document.addEventListener('htmx:afterSwap', () => { const a = document.getElementById('aviso'); if (a) a.hidden = true; });
})();
