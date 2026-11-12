# SmartCart · Optimización Web: nuevas librerías JS y desarrollo E-Commerce

Proyecto de Ingeniería de Software — Universidad Manuela Beltrán.
Autores: Ángel Garzón, Leonardo Peñuela y Cristian Catolico. Profesora: Olga Lucía.

## Cómo ejecutarlo

Necesitas Node.js 18 o superior. La base de datos usa `better-sqlite3` si se instala bien; si su compilación falla en tu equipo, la aplicación usa automáticamente el SQLite integrado de Node.js, que requiere Node 22.5 o superior (mostrará un aviso «ExperimentalWarning» que es normal).

```bash
npm install
npm start
```

Abre http://localhost:3000. La base de datos (`smartcart.db`) se crea sola en el primer arranque con los 6 productos y pedidos de demostración. Para empezar de cero, borra ese archivo y reinicia. Todo funciona sin internet, salvo las fotos de los productos (Unsplash), que tienen un ícono de respaldo.

## Arquitectura (Cliente - Servidor - Base de Datos)

| Capa | Tecnología | Dónde |
|---|---|---|
| Cliente | HTML5, CSS3, JavaScript, **Alpine.js** (carrito, modales, formularios, tema) y **HTMX** (catálogo y detalle) | `public/` |
| Servidor | **Node.js + Express**, API REST y fragmentos HTML | `server.js` |
| Base de datos | SQL relacional (SQLite) con `productos`, `pedidos`, `pedido_items` | `schema.sql`, `db.js` |

Alpine.js, HTMX y Chart.js se sirven desde `node_modules` (`/vendor/...`). Chart.js solo se descarga cuando la sección de métricas aparece en pantalla.

## API REST

| Método y ruta | Qué hace |
|---|---|
| `GET /api/productos?q=&categoria=&orden=` | Lista y filtra productos (la búsqueda ignora tildes) |
| `GET /api/productos/:id` | Detalle de un producto |
| `POST /api/pedidos` | Crea un pedido: valida datos, recalcula precios y envío en el servidor y descuenta el stock en una transacción |
| `GET /api/pedidos?email=` | Pedidos de un cliente |
| `GET /api/metricas` | Ventas por mes y categoría, y peso real de las librerías |
| `GET /api/salud`, `GET /api/config` | Estado del servidor/BD y reglas de envío |
| `GET /partials/productos`, `GET /partials/producto/:id` | HTML que consume HTMX |

## Qué hay en la página (según el póster)

Catálogo con búsqueda, categorías y orden · detalle de producto · carrito persistente · checkout con validación y confirmación · mis pedidos · Problema, Estado del arte y Metodología · diagrama de arquitectura con prueba de conexión real · Métricas y resultados (85 % y 40 %, más medición en vivo y gráficas desde la BD) · Conclusiones y Referencias · tema claro/oscuro.

`mysql/database_export.sql` es la versión MySQL del esquema por si prefieres ese motor para la entrega.

Los pagos son simulados: no se piden ni se guardan datos bancarios.
