import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// Paginador simple estilo << 1 2 3 4 >> en azul (color de marca #0b4f9e).
// Se muestra solo si hay mas de una pagina.
export function Paginador({ paginaActual, totalPaginas, onCambiarPagina }) {
  if (totalPaginas <= 1) return null;

  const botonEstilo = (activo, deshabilitado) => ({
    minWidth: '2rem',
    padding: '0.3rem 0.55rem',
    border: '1px solid #0b4f9e',
    borderRadius: '4px',
    background: activo ? '#0b4f9e' : '#fff',
    color: activo ? '#fff' : '#0b4f9e',
    fontWeight: activo ? 700 : 500,
    fontSize: '0.85rem',
    cursor: deshabilitado ? 'not-allowed' : 'pointer',
    opacity: deshabilitado ? 0.4 : 1
  });

  // Con muchas paginas no listamos todas: primera, ultima, y un rango alrededor de la actual.
  const numeros = useMemo(() => {
    const rango = [];
    const inicio = Math.max(1, paginaActual - 2);
    const fin = Math.min(totalPaginas, paginaActual + 2);
    for (let i = inicio; i <= fin; i++) rango.push(i);
    return rango;
  }, [paginaActual, totalPaginas]);

  return (
    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        style={botonEstilo(false, paginaActual === 1)}
        disabled={paginaActual === 1}
        onClick={() => onCambiarPagina(paginaActual - 1)}
      >
        {'<<'}
      </button>
      {numeros[0] > 1 && <span style={{ color: '#667085' }}>…</span>}
      {numeros.map((n) => (
        <button
          key={n}
          type="button"
          style={botonEstilo(n === paginaActual, false)}
          onClick={() => onCambiarPagina(n)}
        >
          {n}
        </button>
      ))}
      {numeros[numeros.length - 1] < totalPaginas && <span style={{ color: '#667085' }}>…</span>}
      <button
        type="button"
        style={botonEstilo(false, paginaActual === totalPaginas)}
        disabled={paginaActual === totalPaginas}
        onClick={() => onCambiarPagina(paginaActual + 1)}
      >
        {'>>'}
      </button>
    </div>
  );
}

// Mide el ancho real (en px) que ocupa un texto con una fuente dada, reusando un unico
// canvas oculto. Se usa para calcular el ancho de columna segun el largo real de los
// codigos/IMEI en vez de un valor fijo a ojo.
let _canvasMedidor = null;
function medirAnchoTexto(texto, fuente) {
  if (!_canvasMedidor) _canvasMedidor = document.createElement('canvas');
  const ctx = _canvasMedidor.getContext('2d');
  ctx.font = fuente;
  return ctx.measureText(String(texto)).width;
}

// Grilla que reparte "items" en columnas de "filasPorColumna" elementos, calculando
// automaticamente cuantas columnas caben en el ancho disponible del contenedor (sin scroll
// horizontal), y pagina el resto con el componente Paginador de arriba.
//
// El ancho de cada columna se recalcula segun el largo real de los codigos/IMEI (via
// "medirTexto"): si se ingresan codigos mas largos o mas cortos, la cantidad de columnas
// que caben se ajusta sola. Si no se pasa "medirTexto", se usa el valor fijo "anchoMinColumna".
export default function GridPaginado({
  items,
  renderItem,
  keyExtractor,
  filasPorColumna = 10,
  anchoMinColumna = 200,
  espacioColumnas = 12,
  medirTexto,
  fuenteMedida = '0.85rem system-ui, -apple-system, sans-serif',
  paddingExtra = 70
}) {
  const contenedorRef = useRef(null);
  const [columnas, setColumnas] = useState(1);
  const [pagina, setPagina] = useState(1);

  // Ancho de columna necesario segun el texto mas largo actual (se recalcula cada vez que
  // cambia la lista de items, por ejemplo al agregar/editar un codigo).
  const anchoColumna = useMemo(() => {
    if (!medirTexto || items.length === 0) return anchoMinColumna;
    let maxAncho = 0;
    for (const item of items) {
      const ancho = medirAnchoTexto(medirTexto(item) || '', fuenteMedida);
      if (ancho > maxAncho) maxAncho = ancho;
    }
    return Math.max(anchoMinColumna, Math.ceil(maxAncho) + paddingExtra);
  }, [items, medirTexto, fuenteMedida, paddingExtra, anchoMinColumna]);

  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return undefined;

    const calcular = () => {
      const ancho = el.clientWidth;
      const n = Math.max(1, Math.floor((ancho + espacioColumnas) / (anchoColumna + espacioColumnas)));
      setColumnas(n);
    };

    calcular();
    const observer = new ResizeObserver(calcular);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchoColumna, espacioColumnas]);

  const itemsPorPagina = Math.max(1, columnas * filasPorColumna);
  const totalPaginas = Math.max(1, Math.ceil(items.length / itemsPorPagina));

  // Si cambia el numero de items (o de columnas) y la pagina actual queda fuera de rango,
  // volvemos a la ultima pagina valida en vez de mostrar una pagina vacia.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const itemsPagina = useMemo(() => {
    const inicio = (pagina - 1) * itemsPorPagina;
    return items.slice(inicio, inicio + itemsPorPagina);
  }, [items, pagina, itemsPorPagina]);

  const cambiarPagina = useCallback((n) => {
    setPagina(Math.min(Math.max(1, n), totalPaginas));
  }, [totalPaginas]);

  return (
    <div>
      <div
        ref={contenedorRef}
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: `repeat(${filasPorColumna}, auto)`,
          gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
          columnGap: `${espacioColumnas}px`,
          width: '100%',
          overflow: 'hidden'
        }}
      >
        {itemsPagina.map((item, i) => (
          <React.Fragment key={keyExtractor ? keyExtractor(item) : i}>
            {renderItem(item)}
          </React.Fragment>
        ))}
      </div>
      <Paginador paginaActual={pagina} totalPaginas={totalPaginas} onCambiarPagina={cambiarPagina} />
    </div>
  );
}
