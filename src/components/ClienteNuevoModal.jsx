import React, { useState } from 'react';

// Ventana modal para registrar un cliente nuevo desde Facturacion, con el mismo diseno que la
// ventana "CLIENTES" del software de referencia: encabezado en franja de color, campo "Cedula o
// RIF" (reemplaza a "Codigo"), Tipo Cliente, Nombre, Telefono, Movil, Correo Electronico, las 3
// Redes Sociales y Notas. Se excluyen a proposito "Denominacion Fiscal", "Contacto", "Fax",
// "Dias de Credito" y "Limite de Credito", tal como se pidio. Solo Cedula/RIF, Nombre y Telefono
// son obligatorios para poder crear el cliente; el resto es opcional.
export default function ClienteNuevoModal({ cedulaInicial, onConfirm, onCancel }) {
  const [form, setForm] = useState({
    rif_cedula: cedulaInicial || '',
    tipo_cliente: 'Natural',
    nombre: '',
    telefono: '',
    movil: '',
    direccion: '',
    email: '',
    red_social1: '',
    red_social2: '',
    red_social3: '',
    notas: ''
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!form.rif_cedula.trim()) { setError('La cedula o RIF es obligatoria'); return; }
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.telefono.trim()) { setError('El telefono es obligatorio'); return; }

    setGuardando(true);
    try {
      const res = await window.api.createCliente(form);
      if (!res.ok) {
        setError(res.message || 'No se pudo crear el cliente');
        return;
      }
      onConfirm(res.cliente);
    } finally {
      setGuardando(false);
    }
  };

  // Esc para cancelar, igual que en la ventana de referencia ("ESC - Cancelar")
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'F9') { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div style={overlayStyle} onKeyDown={handleKeyDown}>
      <div style={boxStyle}>
        <div style={headerStyle}>CLIENTES</div>
        <form onSubmit={handleSubmit} style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <Campo label="Cedula o RIF" required>
            <input autoFocus value={form.rif_cedula} onChange={set('rif_cedula')}
              placeholder="Ej: V19857432" style={inputStyle} />
          </Campo>

          <Campo label="Tipo Cliente">
            <select value={form.tipo_cliente} onChange={set('tipo_cliente')} style={inputStyle}>
              <option value="Natural">Natural</option>
              <option value="Juridico">Juridico</option>
            </select>
          </Campo>

          <Campo label="Nombre" required>
            <input value={form.nombre} onChange={set('nombre')}
              placeholder="Nombre y apellido / Razon social" style={inputStyle} />
          </Campo>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <Campo label="Telefono" required>
                <input value={form.telefono} onChange={set('telefono')} placeholder="0424-0000000" style={inputStyle} />
              </Campo>
            </div>
            <div style={{ flex: 1 }}>
              <Campo label="Movil">
                <input value={form.movil} onChange={set('movil')} placeholder="Opcional" style={inputStyle} />
              </Campo>
            </div>
          </div>

          <Campo label="Direccion">
            <input value={form.direccion} onChange={set('direccion')}
              placeholder="Direccion del cliente" style={inputStyle} />
          </Campo>

          <Campo label="Correo Electronico">
            <input type="email" value={form.email} onChange={set('email')}
              placeholder="correo@ejemplo.com" style={inputStyle} />
          </Campo>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <Campo label="Red Social 1">
                <input value={form.red_social1} onChange={set('red_social1')} style={inputStyle} />
              </Campo>
            </div>
            <div style={{ flex: 1 }}>
              <Campo label="Red Social 2">
                <input value={form.red_social2} onChange={set('red_social2')} style={inputStyle} />
              </Campo>
            </div>
            <div style={{ flex: 1 }}>
              <Campo label="Red Social 3">
                <input value={form.red_social3} onChange={set('red_social3')} style={inputStyle} />
              </Campo>
            </div>
          </div>

          <Campo label="Notas">
            <textarea value={form.notas} onChange={set('notas')} rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
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
