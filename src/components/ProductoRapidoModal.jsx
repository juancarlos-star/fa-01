import React, { useState, useEffect } from 'react';
import { fmt } from '../utils/format.js';

// Ventana modal para crear un producto nuevo "al vuelo" desde Compras, cuando el codigo o
// nombre que se escribio en el renglon de la compra no coincide con ningun producto existente.
// A la derecha se muestra una lista chica de los productos ya registrados (codigo, descripcion,
// costo y precio) para poder confirmar de un vistazo que en efecto no existe todavia, o para
// copiar el formato de codigo que se viene usando.
export default function ProductoRapidoModal({ codigoInicial, onConfirm, onCancel }) {
  const [form, setForm] = useState({
    codigo_producto: codigoInicial || '',
    nombre: '',
    costo_inicial: '',
    precio: '',
    precio2: '',
    seVendePorUnidad: false // false = accesorio (cantidad general) | true = requiere codigo/IMEI individual
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [productos, setProductos] = useState([]);
  const [filtroLista, setFiltroLista] = useState('');

  useEffect(() => {
    window.api.listProducts().then(setProductos);
  }, []);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!form.nombre.trim()) { setError('La descripcion es obligatoria'); return; }
    const tipo = form.seVendePorUnidad ? 'equipo' : 'accesorio';
    const codigoLimpio = form.codigo_producto.trim();
    if (tipo !== 'accesorio' && !codigoLimpio) {
      setError('El codigo es obligatorio para productos que se venden por unidad (requieren IMEI/codigo individual)');
      return;
    }

    setGuardando(true);
    try {
      const res = await window.api.createProduct({
        tipo,
        nombre: form.nombre.trim(),
        precio: parseFloat(form.precio) || 0,
        precio2: parseFloat(form.precio2) || 0,
        costo_inicial: parseFloat(form.costo_inicial) || 0,
        codigo_producto: codigoLimpio || null
      });
      if (!res.ok) {
        setError(res.message || 'No se pudo crear el producto');
        return;
      }
      // El handler products:create solo devuelve el id; se arma aqui el objeto con los mismos
      // campos que devuelve la busqueda de productos, para poder seguir de inmediato con el
      // renglon de Cantidad sin tener que volver a buscarlo.
      onConfirm({
        id: res.id,
        tipo,
        nombre: form.nombre.trim(),
        codigo_producto: codigoLimpio || null,
        precio: parseFloat(form.precio) || 0,
        precio2: parseFloat(form.precio2) || 0,
        costo_promedio_usd: parseFloat(form.costo_inicial) || 0,
        stock_disponible: 0
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  const filtroLower = filtroLista.trim().toLowerCase();
  const productosFiltrados = filtroLower
    ? productos.filter((p) =>
        (p.nombre || '').toLowerCase().includes(filtroLower) ||
        (p.codigo_producto || '').toLowerCase().includes(filtroLower))
    : productos;

  return (
    <div style={overlayStyle} onKeyDown={handleKeyDown}>
      <div style={boxStyle}>
        <div style={headerStyle}>PRODUCTO NUEVO</div>
        <div style={{ display: 'flex' }}>
          <form onSubmit={handleSubmit} style={{ padding: '1rem 1.2rem 1.2rem', width: '360px', flexShrink: 0 }}>
            <Campo label="Codigo">
              <input autoFocus value={form.codigo_producto} onChange={set('codigo_producto')}
                placeholder="Ej: ss24" style={inputStyle} />
            </Campo>

            <Campo label="Descripcion" required>
              <input value={form.nombre} onChange={set('nombre')}
                placeholder="Nombre del producto" style={inputStyle} />
            </Campo>

            <Campo label="Costo">
              <input type="number" step="0.01" min="0" value={form.costo_inicial} onChange={set('costo_inicial')}
                placeholder="0.00" style={inputStyle} />
            </Campo>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <Campo label="Precio Bs.">
                  <input type="number" step="0.01" min="0" value={form.precio} onChange={set('precio')}
                    placeholder="0.00" style={inputStyle} />
                </Campo>
              </div>
              <div style={{ flex: 1 }}>
                <Campo label="Precio Dólares">
                  <input type="number" step="0.01" min="0" value={form.precio2} onChange={set('precio2')}
                    placeholder="0.00" style={inputStyle} />
                </Campo>
              </div>
            </div>

            <div style={{ margin: '10px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#333', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.seVendePorUnidad}
                  onChange={(e) => setForm({ ...form, seVendePorUnidad: e.target.checked })}
                />
                Se vende por unidad (requiere código/IMEI individual, ej. equipos, SIM, USIM)
              </label>
            </div>

            {error && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '4px' }}>{error}</p>}

            <div style={footerStyle}>
              <button type="button" onClick={onCancel} style={btnCancelar}>
                ESC &nbsp;Cancelar
              </button>
              <button type="submit" disabled={guardando} style={btnAceptar}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>

          <div style={listaWrapStyle}>
            <div style={{ fontSize: '0.8rem', color: '#333', marginBottom: '6px', fontWeight: 'bold' }}>
              Productos ya registrados
            </div>
            <input
              value={filtroLista}
              onChange={(e) => setFiltroLista(e.target.value)}
              placeholder="Filtrar..."
              style={{ ...inputStyle, marginBottom: '8px' }}
            />
            <div style={listaScrollStyle}>
              {productosFiltrados.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#98a2b3', fontSize: '0.8rem' }}>
                  No hay productos que coincidan.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', position: 'sticky', top: 0, background: '#f4f6f8' }}>
                      <th style={thStyle}>Código</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={thStyle}>Costo</th>
                      <th style={thStyle}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                        <td style={tdStyle}>{p.codigo_producto || '—'}</td>
                        <td style={tdStyle}>{p.nombre}</td>
                        <td style={tdStyle}>${fmt(p.costo_promedio_usd)}</td>
                        <td style={tdStyle}>{fmt(p.precio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
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
  width: '760px',
  maxWidth: '95vw',
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

const listaWrapStyle = {
  flex: 1,
  borderLeft: '1px solid #eee',
  padding: '1rem 1.2rem 1.2rem',
  minWidth: '300px'
};

const listaScrollStyle = {
  maxHeight: '360px',
  overflowY: 'auto',
  border: '1px solid #e2e8f0',
  borderRadius: '6px'
};

const thStyle = {
  padding: '5px 6px',
  borderBottom: '1px solid #e2e8f0',
  color: '#475467'
};

const tdStyle = {
  padding: '5px 6px'
};
