import React, { useState, useEffect, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Cards' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

export default function Inventario({ currentUser }) {
  const [tab, setTab] = useState('equipo');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [categorias, setCategorias] = useState([]);
  const [nombresSugeridos, setNombresSugeridos] = useState([]);

  const [form, setForm] = useState({
    nombre: '',
    categoria: '',
    precio: '',
    stock_minimo: '',
    codigo_barras: '',
    stock_cantidad: ''
  });

  const esAdmin = currentUser?.role === 'administrador';

  const cargarProductos = useCallback(async () => {
    setLoading(true);
    const data = await window.api.listProducts(tab);
    setProducts(data);
    setLoading(false);
  }, [tab]);

  const cargarCategorias = useCallback(async () => {
    const data = await window.api.listCategories();
    setCategorias(data);
  }, []);

  const cargarNombresSugeridos = useCallback(async () => {
    const data = await window.api.listProductNames(tab);
    setNombresSugeridos(data);
  }, [tab]);

  useEffect(() => {
    cargarProductos();
    cargarNombresSugeridos();
    setExpandedId(null);
  }, [tab, cargarProductos, cargarNombresSugeridos]);

  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  const handleCrearProducto = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    const res = await window.api.createProduct({
      tipo: tab,
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      precio: parseFloat(form.precio) || 0,
      stock_minimo: parseInt(form.stock_minimo, 10) || 0,
      codigo_barras: form.codigo_barras.trim(),
      stock_cantidad: parseInt(form.stock_cantidad, 10) || 0
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setForm({ nombre: '', categoria: '', precio: '', stock_minimo: '', codigo_barras: '', stock_cantidad: '' });
    cargarProductos();
    cargarNombresSugeridos();
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('Eliminar este producto?')) return;
    const res = await window.api.deleteProduct(id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargarProductos();
  };

  const handleRegistrarCompra = async (id) => {
    const cantidadStr = window.prompt('Cantidad a ingresar (compra):');
    if (cantidadStr === null) return;
    const cantidad = parseInt(cantidadStr, 10);
    if (!cantidad || cantidad <= 0) {
      alert('Cantidad invalida');
      return;
    }
    const res = await window.api.addProductStock(id, cantidad, currentUser?.username);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargarProductos();
  };

  const handleRegistrarDescargoAccesorio = async (id) => {
    const cantidadStr = window.prompt('Cantidad a descargar:');
    if (cantidadStr === null) return;
    const cantidad = parseInt(cantidadStr, 10);
    if (!cantidad || cantidad <= 0) {
      alert('Cantidad invalida');
      return;
    }
    const motivo = window.prompt('Motivo del descargo (ej: dañado, perdido, robado):');
    if (!motivo || !motivo.trim()) {
      alert('Debes indicar un motivo');
      return;
    }
    const res = await window.api.writeOffProductStock(id, cantidad, motivo, currentUser?.username);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargarProductos();
  };

  return (
    <div>
      <h1>Inventario</h1>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        {TIPOS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: tab === t.key ? 'bold' : 'normal',
              backgroundColor: tab === t.key ? '#0b4f9e' : '#e2e8f0',
              color: tab === t.key ? '#fff' : '#111',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleCrearProducto}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
          background: '#fff',
          padding: '1rem',
          borderRadius: '6px'
        }}
      >
        <div>
          <label>Nombre</label><br />
          <input
            list="nombres-sugeridos"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: iPhone 13 128GB"
          />
          <datalist id="nombres-sugeridos">
            {nombresSugeridos.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label>Categoria</label><br />
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          >
            <option value="">-- Selecciona --</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Precio (USD)</label><br />
          <input
            type="number"
            step="0.01"
            value={form.precio}
            onChange={(e) => setForm({ ...form, precio: e.target.value })}
          />
        </div>
        <div>
          <label>Stock minimo (alerta)</label><br />
          <input
            type="number"
            value={form.stock_minimo}
            onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
          />
        </div>
        {tab === 'accesorio' && (
          <>
            <div>
              <label>Codigo de barras</label><br />
              <input
                value={form.codigo_barras}
                onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
              />
            </div>
            <div>
              <label>Stock inicial</label><br />
              <input
                type="number"
                value={form.stock_cantidad}
                onChange={(e) => setForm({ ...form, stock_cantidad: e.target.value })}
              />
            </div>
          </>
        )}
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          + Crear producto
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {loading ? (
        <p>Cargando...</p>
      ) : products.length === 0 ? (
        <p>No hay productos registrados en esta categoria.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Nombre</th>
              <th>Categoria</th>
              <th>Precio</th>
              {tab === 'accesorio' && <th>Cod. barras</th>}
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const bajoStock = p.stock_disponible <= p.stock_minimo;
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{p.nombre}</td>
                    <td>{p.categoria}</td>
                    <td>${Number(p.precio).toFixed(2)}</td>
                    {tab === 'accesorio' && <td>{p.codigo_barras}</td>}
                    <td style={{ color: bajoStock ? 'red' : 'inherit', fontWeight: bajoStock ? 'bold' : 'normal' }}>
                      {p.stock_disponible} {bajoStock && '⚠ stock bajo'}
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {tab === 'accesorio' ? (
                        esAdmin ? (
                          <>
                            <button onClick={() => handleRegistrarCompra(p.id)}>+ Compra</button>
                            <button onClick={() => handleRegistrarDescargoAccesorio(p.id)}>Descargo</button>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#666' }}>Solo admin ajusta stock</span>
                        )
                      ) : (
                        <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                          {expandedId === p.id ? 'Ocultar' : 'Ver unidades'}
                        </button>
                      )}
                      <button onClick={() => handleEliminar(p.id)}>Eliminar</button>
                    </td>
                  </tr>
                  {expandedId === p.id && tab !== 'accesorio' && (
                    <tr>
                      <td colSpan={5} style={{ background: '#f8fafc', padding: '0.75rem' }}>
                        <UnidadesProducto
                          productId={p.id}
                          tipo={tab}
                          onChange={cargarProductos}
                          currentUser={currentUser}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UnidadesProducto({ productId, tipo, onChange, currentUser }) {
  const [units, setUnits] = useState([]);
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [error, setError] = useState('');

  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [rangoInfo, setRangoInfo] = useState('');

  const esAdmin = currentUser?.role === 'administrador';

  const cargar = useCallback(async () => {
    const data = await window.api.listUnits(productId);
    setUnits(data);
  }, [productId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleAgregar = async (e) => {
    e.preventDefault();
    setError('');
    if (!nuevoCodigo.trim()) return;
    const res = await window.api.addUnit(productId, nuevoCodigo.trim());
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setNuevoCodigo('');
    cargar();
    onChange();
  };

  const handleGenerarRango = async (e) => {
    e.preventDefault();
    setError('');
    setRangoInfo('');
    if (!codigoInicio.trim() || !codigoFin.trim()) {
      setError('Escanea o escribe el primer y el ultimo codigo de la caja');
      return;
    }
    const res = await window.api.addUnitsRange(productId, codigoInicio.trim(), codigoFin.trim());
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRangoInfo(
      `Rango procesado: ${res.total} codigos. Agregados: ${res.agregados}. Ya existian (saltados): ${res.saltados}.`
    );
    setCodigoInicio('');
    setCodigoFin('');
    cargar();
    onChange();
  };

  const handleEliminarUnidad = async (id) => {
    const res = await window.api.deleteUnit(id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargar();
    onChange();
  };

  const handleDarDeBaja = async (id) => {
    const motivo = window.prompt('Motivo del descargo (ej: dañado, perdido, robado):');
    if (!motivo || !motivo.trim()) return;
    const res = await window.api.writeOffUnit(id, motivo, currentUser?.username);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargar();
    onChange();
  };

  const label = tipo === 'equipo' ? 'IMEI' : tipo === 'usim' ? 'Codigo USIM' : 'Codigo SIM (ICCID)';

  return (
    <div>
      <form onSubmit={handleAgregar} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          placeholder={`Nuevo ${label} (manual o pistola)`}
          value={nuevoCodigo}
          onChange={(e) => setNuevoCodigo(e.target.value)}
          autoFocus
        />
        <button type="submit">+ Agregar {label}</button>
      </form>

      {(tipo === 'simcard' || tipo === 'usim') && (
        <form
          onSubmit={handleGenerarRango}
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-end',
            marginBottom: '0.75rem',
            background: '#eef4ff',
            padding: '0.6rem',
            borderRadius: '4px'
          }}
        >
          <div>
            <label style={{ fontSize: '0.8rem' }}>Primer codigo de la caja</label><br />
            <input
              placeholder="Ej: 190000"
              value={codigoInicio}
              onChange={(e) => setCodigoInicio(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Ultimo codigo de la caja</label><br />
            <input
              placeholder="Ej: 190050"
              value={codigoFin}
              onChange={(e) => setCodigoFin(e.target.value)}
            />
          </div>
          <button type="submit">Generar rango completo</button>
        </form>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {rangoInfo && <p style={{ color: 'green' }}>{rangoInfo}</p>}

      {units.length === 0 ? (
        <p>Sin unidades registradas todavia.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {units.map((u) => (
            <li
              key={u.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.3rem 0',
                borderBottom: '1px solid #eee'
              }}
            >
              <span>
                {u.codigo} — <em>{u.estado}</em>
              </span>
              {u.estado === 'disponible' && (
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  {esAdmin && <button onClick={() => handleDarDeBaja(u.id)}>Dar de baja</button>}
                  <button onClick={() => handleEliminarUnidad(u.id)}>Eliminar</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
