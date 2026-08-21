import React, { useState, useRef, useEffect } from 'react';

// Ventana modal para ingresar, uno por uno (tipiado o con pistola), los codigos/IMEI NUEVOS de
// las unidades que estan entrando en esta compra (equipos, SIM, USIM). Mismo tamano y estilo que
// SeleccionUnidadesModal de Facturacion, pero aqui los codigos no existen todavia: se validan
// contra el inventario (no pueden estar ya registrados) y contra los que se van escribiendo en
// esta misma ventana (no pueden repetirse entre si).
export default function CodigosNuevosModal({ nombreProducto, cantidadNecesaria, onConfirm, onCancel }) {
  const [valor, setValor] = useState('');
  const [codigos, setCodigos] = useState([]);
  const [verificando, setVerificando] = useState(false);
  const [aviso, setAviso] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const faltan = cantidadNecesaria - codigos.length;

  const agregarCodigo = async () => {
    const texto = valor.trim();
    if (!texto) return;
    setAviso('');

    if (codigos.some((c) => c.toLowerCase() === texto.toLowerCase())) {
      setAviso(`El codigo "${texto}" ya lo ingresaste en esta misma compra`);
      return;
    }

    setVerificando(true);
    try {
      const res = await window.api.codigoExiste({ codigo: texto });
      if (res.existe) {
        setAviso(`El codigo "${texto}" ya esta registrado en el inventario`);
        return;
      }
      const nuevos = [...codigos, texto];
      setCodigos(nuevos);
      setValor('');
      if (nuevos.length >= cantidadNecesaria) {
        onConfirm(nuevos);
        return;
      }
    } catch (err) {
      setAviso('Error verificando el codigo: ' + (err?.message || String(err)));
    } finally {
      setVerificando(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const quitarCodigo = (texto) => {
    setCodigos(codigos.filter((c) => c !== texto));
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter') { e.preventDefault(); agregarCodigo(); }
  };

  return (
    <div style={overlayStyle} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          CÓDIGOS / IMEI NUEVOS — {nombreProducto ? nombreProducto.toUpperCase() : ''}
        </div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: '#333' }}>IMEI / Código (tipiar o leer con pistola)</label>
            <span style={{ fontSize: '0.8rem', color: faltan > 0 ? '#b42318' : '#0b8f4e', fontWeight: 'bold' }}>
              {codigos.length} / {cantidadNecesaria} ingresados
            </span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={valor}
            onChange={(e) => { setValor(e.target.value); setAviso(''); }}
            onKeyDown={handleKeyDown}
            placeholder={verificando ? 'Verificando...' : 'Código nuevo + Enter'}
            disabled={verificando}
            style={inputStyle}
          />
          {aviso && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '6px 0 0' }}>{aviso}</p>}

          <div style={{ fontSize: '0.75rem', color: '#667085', margin: '12px 0 4px' }}>
            Códigos ingresados:
          </div>
          <div style={listWrapStyle}>
            {codigos.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#98a2b3', fontSize: '0.85rem' }}>
                Aun no has ingresado ningun codigo.
              </div>
            ) : (
              codigos.map((c) => (
                <div key={c} style={listItemStyle}>
                  <span>{c}</span>
                  <button type="button" onClick={() => quitarCodigo(c)} style={quitarBtnStyle}>Quitar</button>
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
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const quitarBtnStyle = {
  fontSize: '0.72rem',
  padding: '3px 8px',
  borderRadius: '4px',
  border: 'none',
  cursor: 'pointer',
  backgroundColor: '#b42318',
  color: '#fff',
  fontFamily: 'inherit'
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
