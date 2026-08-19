import React, { useState, useRef, useEffect } from 'react';

// Ventana modal para escoger, de entre las unidades disponibles de un producto (equipos, SIM,
// USIM), cuales IMEI/codigos individuales se van a facturar. Se abre despues de confirmar la
// cantidad en el renglon de "Codigo" de Facturacion. Tamano de ventana similar al modal de
// "Cliente nuevo". Tiene un filtro arriba (se puede tipiar a mano o leer con la pistola) y una
// lista con scroll debajo. Cada Enter (o click) en un codigo que coincide lo agrega a la
// seleccion; al completar la cantidad pedida, se confirma solo y se cierra.
export default function SeleccionUnidadesModal({ nombreProducto, cantidadNecesaria, unidadesDisponibles, onConfirm, onCancel }) {
  const [filtro, setFiltro] = useState('');
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [aviso, setAviso] = useState('');
  const filtroRef = useRef(null);

  useEffect(() => {
    setTimeout(() => filtroRef.current?.focus(), 0);
  }, []);

  const idsSeleccionados = new Set(seleccionadas.map((u) => u.id));
  const pendientes = unidadesDisponibles.filter((u) => !idsSeleccionados.has(u.id));
  const filtroLower = filtro.trim().toLowerCase();
  const listaFiltrada = filtroLower
    ? pendientes.filter((u) => u.codigo.toLowerCase().includes(filtroLower))
    : pendientes;

  const faltan = cantidadNecesaria - seleccionadas.length;

  const seleccionarUnidad = (unidad) => {
    const nuevas = [...seleccionadas, unidad];
    setSeleccionadas(nuevas);
    setFiltro('');
    setAviso('');
    if (nuevas.length >= cantidadNecesaria) {
      onConfirm(nuevas);
      return;
    }
    setTimeout(() => filtroRef.current?.focus(), 0);
  };

  const quitarSeleccionada = (id) => {
    setSeleccionadas(seleccionadas.filter((u) => u.id !== id));
    setTimeout(() => filtroRef.current?.focus(), 0);
  };

  const handleFiltroKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const texto = filtro.trim();
    if (!texto) return;

    // Coincidencia exacta (asi llega siempre la lectura de la pistola), o si el filtro ya dejo
    // un solo resultado visible, se toma ese directamente.
    const exacta = pendientes.find((u) => u.codigo.toLowerCase() === texto.toLowerCase());
    if (exacta) { seleccionarUnidad(exacta); return; }
    if (listaFiltrada.length === 1) { seleccionarUnidad(listaFiltrada[0]); return; }
    if (listaFiltrada.length === 0) {
      setAviso(`Ningun codigo disponible coincide con "${texto}"`);
    } else {
      setAviso('Hay varias coincidencias, sigue escribiendo o selecciona una de la lista');
    }
  };

  return (
    <div style={overlayStyle} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          SELECCIONAR {nombreProducto ? nombreProducto.toUpperCase() : 'UNIDADES'}
        </div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: '#333' }}>IMEI / Código (tipiar o leer con pistola)</label>
            <span style={{ fontSize: '0.8rem', color: faltan > 0 ? '#b42318' : '#0b8f4e', fontWeight: 'bold' }}>
              {seleccionadas.length} / {cantidadNecesaria} seleccionados
            </span>
          </div>
          <input
            ref={filtroRef}
            type="text"
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value); setAviso(''); }}
            onKeyDown={handleFiltroKeyDown}
            placeholder="Escribe para filtrar..."
            style={inputStyle}
          />
          {aviso && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '6px 0 0' }}>{aviso}</p>}

          {seleccionadas.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#667085', marginBottom: '4px' }}>Ya seleccionados:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {seleccionadas.map((u) => (
                  <span key={u.id} style={chipStyle}>
                    {u.codigo}
                    <button type="button" onClick={() => quitarSeleccionada(u.id)} style={chipCloseStyle}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: '#667085', margin: '12px 0 4px' }}>
            Disponibles ({listaFiltrada.length}):
          </div>
          <div style={listWrapStyle}>
            {listaFiltrada.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#98a2b3', fontSize: '0.85rem' }}>
                No hay codigos disponibles que coincidan.
              </div>
            ) : (
              listaFiltrada.map((u) => (
                <div key={u.id} style={listItemStyle} onClick={() => seleccionarUnidad(u)}>
                  {u.codigo}
                </div>
              ))
            )}
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>
              ESC &nbsp;Cancelar
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
  background: 'linear-gradient(180deg, #6bc0d6, #4a9fb8)',
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

const listWrapStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  maxHeight: '260px',
  overflowY: 'auto'
};

const listItemStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #f0f2f5',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontFamily: 'monospace'
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: '#eaf6ee',
  color: '#0b8f4e',
  border: '1px solid #b7e4c7',
  borderRadius: '999px',
  padding: '2px 4px 2px 10px',
  fontSize: '0.8rem',
  fontFamily: 'monospace'
};

const chipCloseStyle = {
  border: 'none',
  background: 'transparent',
  color: '#0b8f4e',
  cursor: 'pointer',
  fontSize: '0.9rem',
  lineHeight: 1,
  padding: '2px 6px'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: '14px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const btnCancelar = {
  padding: '8px 16px',
  background: '#e2e8f0',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
