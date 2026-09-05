import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Input de "Código" reutilizable, usado en Compras, Compras Telf/Acces, Cargos y Facturación:
// a medida que el usuario escribe, muestra un desplegable con los NOMBRES de los productos que
// van coincidiendo (por nombre o código corto), para poder elegir uno con el mouse o con las
// flechas + Enter, sin tener que escribir el código exacto de memoria.
//
// Esto es puramente una ayuda visual sobre la lista de productos que el propio módulo ya tiene
// cargada (prop "productos") -no reemplaza la búsqueda exacta por código/IMEI que hace cada
// módulo al presionar Enter (via window.api.buscarProductoPorCodigo): si el desplegable está
// cerrado, o está abierto pero no hay ninguna sugerencia resaltada, el Enter se delega tal cual
// a esa búsqueda exacta (prop "onEnterSinSeleccion"), que sigue decidiendo qué hacer si no
// encuentra nada (mostrar error, o abrir "Crear producto", según el módulo).
//
// El desplegable se dibuja con un PORTAL directo a document.body (posición "fixed", calculada a
// partir del rectángulo real del input) en vez de vivir dentro del <td>/tabla que lo contiene,
// porque varias de estas tablas tienen su propio scroll interno (overflow-y/x) que recortaría
// un desplegable posicionado "absolute" normal.
//
// Props:
//   value, onChangeValue(text)      -> texto controlado del input
//   productos                        -> lista ya cargada por el módulo (se filtra aquí mismo,
//                                        en memoria, no se golpea la base de datos por cada letra)
//   onSeleccionar(producto)          -> se eligió una sugerencia (click, o Enter con una resaltada)
//   onEnterSinSeleccion()            -> Enter sin ninguna sugerencia resaltada (o desplegable vacío)
//   placeholder, disabled, inputRef  -> se pasan tal cual al <input>
export default function BuscadorProductoInput({
  value,
  onChangeValue,
  productos,
  onSeleccionar,
  onEnterSinSeleccion,
  placeholder,
  disabled,
  inputRef
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(-1);
  const [rect, setRect] = useState(null);
  const contenedorRef = useRef(null);
  const inputInternoRef = useRef(null);

  // Permite que el input quede referenciado a la vez por este componente (para medir su
  // posicion) y por el ref que haya pasado el modulo que lo usa (ej. para hacer foco/blur).
  const asignarRefs = (nodo) => {
    inputInternoRef.current = nodo;
    if (typeof inputRef === 'function') inputRef(nodo);
    else if (inputRef) inputRef.current = nodo;
  };

  const texto = value.trim().toLowerCase();
  const sugerencias = texto
    ? (productos || [])
        .filter((p) => p.nombre.toLowerCase().includes(texto) || (p.codigo_producto || '').toLowerCase().includes(texto))
        .slice(0, 8)
    : [];

  const actualizarPosicion = useCallback(() => {
    if (inputInternoRef.current) setRect(inputInternoRef.current.getBoundingClientRect());
  }, []);

  // Si cambia lo que se escribe, se vuelve a mostrar el desplegable (por si se habia cerrado) y
  // se resetea cual esta resaltada, para no arrastrar una seleccion de una busqueda anterior.
  useEffect(() => {
    setAbierto(true);
    setResaltado(-1);
    actualizarPosicion();
  }, [value, actualizarPosicion]);

  // Mientras el desplegable esta abierto: cierra al hacer click fuera, y recalcula la posicion
  // si la pagina hace scroll o cambia de tamano (incluye el scroll INTERNO de tablas con
  // overflow, gracias al "true" de captura, que si detecta scroll de cualquier descendiente).
  useEffect(() => {
    if (!abierto) return undefined;
    const alHacerClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', alHacerClickFuera);
    document.addEventListener('scroll', actualizarPosicion, true);
    window.addEventListener('resize', actualizarPosicion);
    return () => {
      document.removeEventListener('mousedown', alHacerClickFuera);
      document.removeEventListener('scroll', actualizarPosicion, true);
      window.removeEventListener('resize', actualizarPosicion);
    };
  }, [abierto, actualizarPosicion]);

  const elegir = (producto) => {
    setAbierto(false);
    setResaltado(-1);
    onSeleccionar(producto);
  };

  const manejarTeclado = (e) => {
    const hayDesplegable = abierto && sugerencias.length > 0;
    if (e.key === 'ArrowDown') {
      if (hayDesplegable) { e.preventDefault(); setResaltado((r) => (r + 1) % sugerencias.length); }
    } else if (e.key === 'ArrowUp') {
      if (hayDesplegable) { e.preventDefault(); setResaltado((r) => (r <= 0 ? sugerencias.length - 1 : r - 1)); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hayDesplegable && resaltado >= 0 && sugerencias[resaltado]) {
        elegir(sugerencias[resaltado]);
      } else {
        setAbierto(false);
        onEnterSinSeleccion();
      }
    } else if (e.key === 'Escape') {
      if (abierto) { setAbierto(false); e.stopPropagation(); }
    }
  };

  const mostrarLista = abierto && sugerencias.length > 0 && rect;

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <input
        ref={asignarRefs}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        onKeyDown={manejarTeclado}
        onFocus={() => { setAbierto(true); actualizarPosicion(); }}
        disabled={disabled}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {mostrarLista && createPortal(
        <ul
          style={{
            position: 'fixed', top: rect.bottom + 2, left: rect.left, zIndex: 1000,
            minWidth: Math.max(rect.width, 260), margin: 0, padding: '4px 0', listStyle: 'none',
            background: '#fff', border: '1px solid #d0d5dd', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(16,24,40,0.16)', maxHeight: '220px', overflowY: 'auto'
          }}
        >
          {sugerencias.map((p, i) => (
            <li
              key={p.id}
              // onMouseDown (no onClick) para que dispare ANTES del blur/click-fuera del input.
              onMouseDown={(e) => { e.preventDefault(); elegir(p); }}
              onMouseEnter={() => setResaltado(i)}
              style={{
                padding: '6px 10px', cursor: 'pointer', fontSize: '0.85rem',
                background: i === resaltado ? '#eff8ff' : '#fff'
              }}
            >
              <strong>{p.nombre}</strong>
              {p.codigo_producto && <span style={{ color: '#98a2b3' }}> · {p.codigo_producto}</span>}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
