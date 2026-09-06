import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

/**
 * Selector de producto tipo "combobox": muestra un input de texto que, a medida
 * que el usuario escribe, va filtrando el desplegable para mostrar solo los
 * productos cuyo nombre O codigo coincide con lo escrito. Si el campo esta vacio, se
 * muestra el desplegable completo en orden alfabetico (igual que antes).
 *
 * Soporta navegacion por teclado (flechas + Enter) para poder usarse en flujos de
 * captura rapida tipo "Enter, Enter, Enter" (ver Apartados > Nuevo apartado): al
 * presionar Enter se selecciona el resaltado (o el primero de la lista si no se
 * navego con flechas) y se llama a onEnterSeleccionar, que el padre usa para saltar
 * el foco al siguiente campo del renglon.
 *
 * Expone (via ref) un metodo focus() para que el padre pueda devolver el foco aqui
 * despues de agregar un renglon al carrito.
 *
 * Props:
 * - productos: lista de productos [{ id, nombre, codigo_producto?, stock_disponible? }]
 * - value: id del producto seleccionado (string o number) o '' si no hay ninguno
 * - onChange: (idComoString) => void
 * - onEnterSeleccionar: () => void -- opcional, se llama justo despues de seleccionar por Enter
 * - placeholder: texto del input cuando esta vacio
 * - mostrarStock: si true, agrega "(disponible: N)" junto al nombre en la lista
 */
const SelectorProducto = forwardRef(function SelectorProducto({
  productos,
  value,
  onChange,
  onEnterSeleccionar,
  placeholder = '-- Nombre o código de producto --',
  mostrarStock = true
}, ref) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedorRef = useRef(null);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus()
  }));

  // Mantiene el texto visible sincronizado con el producto seleccionado
  useEffect(() => {
    if (!value) {
      setTexto('');
      return;
    }
    const p = productos.find((x) => String(x.id) === String(value));
    if (p) setTexto(p.nombre);
  }, [value, productos]);

  // Cierra el desplegable al hacer click fuera del componente
  useEffect(() => {
    const cerrarSiClickAfuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', cerrarSiClickAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiClickAfuera);
  }, []);

  const textoBusqueda = texto.trim().toLowerCase();
  const filtrados = textoBusqueda
    ? productos.filter((p) =>
        p.nombre.toLowerCase().includes(textoBusqueda) ||
        (p.codigo_producto || '').toLowerCase().includes(textoBusqueda)
      )
    : productos;

  // Cada vez que cambia la lista filtrada se vuelve a resaltar el primer resultado,
  // para que un Enter inmediato siempre tome "el de arriba".
  useEffect(() => { setResaltado(0); }, [texto]);

  const seleccionar = (p) => {
    onChange(String(p.id));
    setTexto(p.nombre);
    setAbierto(false);
  };

  const handleChangeTexto = (e) => {
    const nuevo = e.target.value;
    setTexto(nuevo);
    setAbierto(true);
    if (value) onChange('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setResaltado((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const elegido = filtrados[resaltado];
      if (elegido) {
        seleccionar(elegido);
        onEnterSeleccionar && onEnterSeleccionar();
      }
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={texto}
        onChange={handleChangeTexto}
        onFocus={() => setAbierto(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {abierto && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            zIndex: 30,
            boxShadow: '0 4px 10px rgba(0,0,0,0.12)'
          }}
        >
          {filtrados.length === 0 ? (
            <li style={{ padding: '6px 8px', color: '#888', fontSize: '0.85rem' }}>
              Sin resultados
            </li>
          ) : (
            filtrados.map((p, i) => (
              <li
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => seleccionar(p)}
                onMouseEnter={() => setResaltado(i)}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: '0.9rem',
                  background: i === resaltado ? '#eef4ff' : (String(p.id) === String(value) ? '#f7f9fc' : 'transparent')
                }}
              >
                {p.codigo_producto ? `[${p.codigo_producto}] ` : ''}{p.nombre}
                {mostrarStock && p.stock_disponible !== undefined ? ` (disponible: ${p.stock_disponible})` : ''}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
});

export default SelectorProducto;
