import React, { useState, useRef, useEffect } from 'react';

// Ventana modal para escoger, de entre TODOS los codigos/IMEI que trajo un producto en una
// compra, cuales se van a devolver. A diferencia de SeleccionUnidadesModal (Facturacion), aqui
// la cantidad a devolver NO es fija: el usuario puede elegir cualquier cantidad, de 0 hasta el
// total que sigue disponible (los que ya se vendieron o ya se devolvieron antes se muestran
// deshabilitados, con el motivo). Por defecto vienen todos los disponibles pre-seleccionados
// (el caso mas comun es devolver todo), y el usuario puede desmarcar los que no quiera
// devolver para hacer una devolucion parcial.
export default function SeleccionDevolucionModal({ nombreProducto, unidades, seleccionInicial, onConfirm, onCancel }) {
  const disponibles = unidades.filter((u) => u.estado === 'disponible');
  const [seleccionados, setSeleccionados] = useState(() => {
    if (seleccionInicial && seleccionInicial.length > 0) return new Set(seleccionInicial);
    return new Set(disponibles.map((u) => u.codigo));
  });
  const [filtro, setFiltro] = useState('');
  const filtroRef = useRef(null);

  useEffect(() => {
    setTimeout(() => filtroRef.current?.focus(), 0);
  }, []);

  const filtroLower = filtro.trim().toLowerCase();
  const unidadesFiltradas = filtroLower
    ? unidades.filter((u) => u.codigo.toLowerCase().includes(filtroLower))
    : unidades;

  const toggle = (unidad) => {
    if (unidad.estado !== 'disponible') return;
    const nuevo = new Set(seleccionados);
    if (nuevo.has(unidad.codigo)) nuevo.delete(unidad.codigo);
    else nuevo.add(unidad.codigo);
    setSeleccionados(nuevo);
  };

  const seleccionarTodos = () => setSeleccionados(new Set(disponibles.map((u) => u.codigo)));
  const quitarTodos = () => setSeleccionados(new Set());

  const handleFiltroKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const texto = filtro.trim();
    if (!texto) return;
    // Coincidencia exacta (asi llega la lectura de la pistola): la marca/desmarca directo.
    const exacta = unidades.find((u) => u.codigo.toLowerCase() === texto.toLowerCase());
    if (exacta && exacta.estado === 'disponible') {
      toggle(exacta);
      setFiltro('');
    }
  };

  const etiquetaEstado = (estado) => {
    if (estado === 'vendido') return 'Vendido';
    if (estado === 'de_baja') return 'Ya devuelto';
    return estado;
  };

  const handleConfirmar = () => {
    if (seleccionados.size === 0) return;
    onConfirm(Array.from(seleccionados));
  };

  return (
    <div style={overlayStyle} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          DEVOLVER {nombreProducto ? nombreProducto.toUpperCase() : 'PRODUCTO'}
        </div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: '#333' }}>Filtrar / leer con pistola</label>
            <span style={{ fontSize: '0.8rem', color: '#0b8f4e', fontWeight: 'bold' }}>
              {seleccionados.size} de {disponibles.length} disponibles seleccionados
            </span>
          </div>
          <input
            ref={filtroRef}
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={handleFiltroKeyDown}
            placeholder="Escribe para filtrar o escanea..."
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
            <button type="button" onClick={seleccionarTodos} style={btnMini}>Seleccionar todos</button>
            <button type="button" onClick={quitarTodos} style={btnMini}>Quitar selección</button>
          </div>

          <div style={{ fontSize: '0.75rem', color: '#667085', margin: '6px 0 4px' }}>
            Códigos de esta compra ({unidadesFiltradas.length}):
          </div>
          <div style={listWrapStyle}>
            {unidadesFiltradas.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#98a2b3', fontSize: '0.85rem' }}>
                Ningun codigo coincide con el filtro.
              </div>
            ) : (
              unidadesFiltradas.map((u) => {
                const disponible = u.estado === 'disponible';
                const marcado = seleccionados.has(u.codigo);
                return (
                  <div
                    key={u.id}
                    onClick={() => toggle(u)}
                    style={{
                      ...listItemStyle,
                      cursor: disponible ? 'pointer' : 'not-allowed',
                      color: disponible ? '#111' : '#b0b6bf',
                      background: marcado ? '#eaf6ee' : 'transparent'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" checked={marcado} disabled={!disponible} readOnly style={{ pointerEvents: 'none' }} />
                      {u.codigo}
                    </span>
                    {!disponible && <span style={estadoBadgeStyle}>{etiquetaEstado(u.estado)}</span>}
                  </div>
                );
              })
            )}
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>
              ESC &nbsp;Cancelar
            </button>
            <button type="button" onClick={handleConfirmar} disabled={seleccionados.size === 0} style={btnAceptar}>
              Confirmar ({seleccionados.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
};

const boxStyle = {
  background: '#fff',
  borderRadius: '8px',
  width: '460px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 35px rgba(0,0,0,0.35)'
};

const headerStyle = {
  background: 'linear-gradient(180deg, #d68b6b, #b8574a)',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1.05rem',
  letterSpacing: '0.5px',
  padding: '12px 16px',
  borderRadius: '8px 8px 0 0'
};

const inputStyle = {
  width: '100%',
  padding: '8px 9px',
  border: '1px solid #c7ccd4',
  borderRadius: '5px',
  fontSize: '0.95rem'
};

const btnMini = {
  fontSize: '0.75rem',
  padding: '5px 10px',
  borderRadius: '5px',
  border: '1px solid #c7ccd4',
  background: '#f4f6f8',
  color: '#333',
  cursor: 'pointer'
};

const listWrapStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  maxHeight: '280px',
  overflowY: 'auto'
};

const listItemStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #f0f2f5',
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const estadoBadgeStyle = {
  fontSize: '0.68rem',
  fontFamily: 'inherit',
  color: '#b42318',
  background: '#fdecea',
  borderRadius: '999px',
  padding: '2px 8px'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '14px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const btnAceptar = {
  padding: '8px 16px',
  background: '#0b8f4e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const btnCancelar = {
  padding: '8px 16px',
  background: '#e2e8f0',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
