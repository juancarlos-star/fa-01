import React, { useState, useEffect, useRef } from 'react';

/**
 * Selector de producto tipo "combobox": muestra un input de texto que, a medida
 * que el usuario escribe, va filtrando el desplegable para mostrar solo los
 * productos cuyo nombre coincide con lo escrito. Si el campo esta vacio, se
 * muestra el desplegable completo en orden alfabetico (igual que antes).
 *
 * Props:
 * - productos: lista de productos [{ id, nombre, stock_disponible? }]
 * - value: id del producto seleccionado (string o number) o '' si no hay ninguno
 * - onChange: (idComoString) => void
 * - placeholder: texto del input cuando esta vacio
 * - mostrarStock: si true, agrega "(disponible: N)" junto al nombre en la lista
 */
export default function SelectorProducto({
  productos,
  value,
  onChange,
  placeholder = '-- Selecciona un producto --',
  mostrarStock = true
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

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
    ? productos.filter((p) => p.nombre.toLowerCase().includes(textoBusqueda))
    : productos;

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

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={texto}
        onChange={handleChangeTexto}
        onFocus={() => setAbierto(true)}
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
            filtrados.map((p) => (
              <li
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => seleccionar(p)}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                  fontSize: '0.9rem',
                  background: String(p.id) === String(value) ? '#eef4ff' : 'transparent'
                }}
              >
                {p.nombre}
                {mostrarStock && p.stock_disponible !== undefined ? ` (disponible: ${p.stock_disponible})` : ''}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
