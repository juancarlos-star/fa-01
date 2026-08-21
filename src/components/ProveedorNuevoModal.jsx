import React, { useState } from 'react';

// Ventana modal para registrar un proveedor nuevo desde Compras, mismo diseno que
// ClienteNuevoModal (franja de color, campo "RIF", Nombre, Telefono, Direccion). RIF, Nombre y
// Direccion son obligatorios; Telefono es opcional.
export default function ProveedorNuevoModal({ rifInicial, onConfirm, onCancel }) {
  const [form, setForm] = useState({
    rif: rifInicial || '',
    nombre: '',
    telefono: '',
    direccion: ''
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!form.rif.trim()) { setError('El RIF es obligatorio'); return; }
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.direccion.trim()) { setError('La direccion es obligatoria'); return; }

    setGuardando(true);
    try {
      const res = await window.api.createProveedor(form);
      if (!res.ok) {
        setError(res.message || 'No se pudo crear el proveedor');
        return;
      }
      onConfirm(res.proveedor);
    } finally {
      setGuardando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'F9') { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div style={overlayStyle} onKeyDown={handleKeyDown}>
      <div style={boxStyle}>
        <div style={headerStyle}>PROVEEDORES</div>
        <form onSubmit={handleSubmit} style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <Campo label="RIF" required>
            <input autoFocus value={form.rif} onChange={set('rif')}
              placeholder="Ej: J298374651" style={inputStyle} />
          </Campo>

          <Campo label="Nombre / Razon social" required>
            <input value={form.nombre} onChange={set('nombre')}
              placeholder="Nombre del proveedor" style={inputStyle} />
          </Campo>

          <Campo label="Telefono">
            <input value={form.telefono} onChange={set('telefono')} placeholder="0424-0000000 (opcional)" style={inputStyle} />
          </Campo>

          <Campo label="Direccion" required>
            <input value={form.direccion} onChange={set('direccion')}
              placeholder="Direccion del proveedor" style={inputStyle} />
          </Campo>

          {error && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '4px' }}>{error}</p>}

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>
              ESC &nbsp;Cancelar
            </button>
            <button type="submit" disabled={guardando} style={btnAceptar}>
              {guardando ? 'Guardando...' : 'F9  Aceptar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({ label, required, children }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', color: '#333', marginBottom: '3px' }}>
        {label} {required && <span style={{ color: '#d92d20' }}>*</span>}
      </label>
      {children}
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
  padding: '7px 8px',
  border: '1px solid #c7ccd4',
  borderRadius: '5px',
  fontSize: '0.9rem'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '12px',
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
