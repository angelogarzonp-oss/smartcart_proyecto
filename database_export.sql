-- Exportación MySQL de SmartCart (equivalente al esquema SQLite que usa la aplicación)
CREATE DATABASE IF NOT EXISTS smartcart_db CHARACTER SET utf8mb4;
USE smartcart_db;

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(300) NOT NULL DEFAULT '',
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  categoria VARCHAR(50) NOT NULL,
  imagen_url VARCHAR(255),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0)
);
CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL,
  direccion VARCHAR(200) NOT NULL,
  metodo_pago VARCHAR(20) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  envio DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  origen VARCHAR(10) NOT NULL DEFAULT 'web',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pedidos_email (email)
);
CREATE TABLE IF NOT EXISTS pedido_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

INSERT INTO productos (nombre, descripcion, precio, categoria, imagen_url, stock) VALUES
('Teclado Mecánico RGB Pro', 'Switches mecánicos, iluminación RGB por tecla y estructura de aluminio.', 45.00, 'tech', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600', 25),
('Mouse Gamer Inalámbrico 16K', 'Sensor óptico de 16.000 DPI, conexión inalámbrica de baja latencia.', 25.00, 'tech', 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600', 40),
('Audífonos Surround 7.1', 'Sonido envolvente virtual 7.1 y micrófono con cancelación de ruido.', 35.00, 'tech', 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600', 30),
('Mousepad XL Speed Surface', 'Superficie de baja fricción de 90x40 cm con base antideslizante.', 15.00, 'accessories', 'https://images.unsplash.com/photo-1616440347437-b1c73416ef22?w=600', 60),
('Soporte de Aluminio para Monitor', 'Eleva el monitor a la altura de los ojos y libera espacio en el escritorio.', 30.00, 'accessories', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600', 20),
('Hub USB-C 7 en 1 Multiport', 'HDMI 4K, 3 puertos USB 3.0, lector SD/microSD y carga de 100 W.', 40.00, 'tech', 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600', 35);
