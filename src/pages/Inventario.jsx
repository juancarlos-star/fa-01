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

  const [editandoCostoId, setEditandoCostoId] = useState(null);
  const [nuevoCostoValor, setNuevoCostoValor] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    categoria: '',
    precio: '',
    stock_minimo: '',
    codigo_barras: '',
    stock_cantidad: '',
    costo_inicial: ''
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
    setEditandoCostoId(null);
  }, [tab, cargarProductos, cargarNombresSugeridos]);

  const categoriasDelTipo = categorias.filter((c) => c.tipo === tab);

  useEffect(() => {
    if (categoriasDelTipo.length === 1) {
      setForm((f) => ({ ...f, categoria: categoriasDelTipo[0].nombre }));
    } else {
      setForm((f) => ({ ...f, categoria: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, categorias]);

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
    if (tab === 'accesorio' && parseInt(form.stock_cantidad, 10) > 0 && !form.costo_inicial) {
      setError('Indica el costo unitario del stock inicial');
      return;
    }
    const res = await window.api.createProduct({
      tipo: tab,
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      precio: parseFloat(form.precio) || 0,
      stock_minimo: parseInt(form.stock_minimo, 10) || 0,
      codigo_barras: form.codigo_barras.trim(),
      stock_cantidad: parseInt(form.stock_cantidad, 10) || 0,
      costo_inicial: parseFloat(form.costo_inicial) || 0,
      usuario: currentUser?.username
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setForm({ nombre: '', categoria: '', precio: '', stock_minimo: '', codigo_barras: '', stock_cantidad: '', costo_inicial: '' });
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

  // ---- Edicion inline de costo promedio (accesorios) ----

  const abrirEdicionCosto = (p) => {
    setEditandoCostoId(p.id);
    setNuevoCostoValor(String(p.costo_promedio_usd ?? 0));
  };

  const cancelarEdicionCosto = () => {
    setEditandoCostoId(null);
    setNuevoCostoValor('');
  };

  const guardarEdicionCosto = async (id) => {
    const costo = parseFloat(nuevoCostoValor);
    if (isNaN(costo) || costo < 0) {
      alert('Costo invalido');
      return;
    }
    const res = await window.api.updateProductCosto(id, costo);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    setEditandoCostoId(null);
    setNuevoCostoValor('');
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
            disabled={categoriasDelTipo.length <= 1}
          >
            {categoriasDelTipo.length === 0 && <option value="">-- Sin categorias para este tipo --</option>}
            {categoriasDelTipo.map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Precio de venta (USD)</label><br />
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
            <div>
              <label>Costo unitario de compra (USD)</label><br />
              <input
                type="number"
                step="0.01"
                value={form.costo_inicial}
                onChange={(e) => setForm({ ...form, costo_inicial: e.target.value })}
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
              <th>Precio venta</th>
              {tab === 'accesorio' && <th>Cod. barras</th>}
              {tab === 'accesorio' && esAdmin && <th>Costo prom.</th>}
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
                    {tab === 'accesorio' && esAdmin && (
                      <td>
                        {editandoCostoId === p.id ? (
                          <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={nuevoCostoValor}
                              onChange={(e) => setNuevoCostoValor(e.target.value)}
                              style={{ width: '80px' }}
                              autoFocus
                            />
                            <button onClick={() => guardarEdicionCosto(p.id)}>Guardar</button>
                            <button onClick={cancelarEdicionCosto}>Cancelar</button>
                          </span>
                        ) : (
                          <span>
                            ${Number(p.costo_promedio_usd || 0).toFixed(2)}{' '}
                            <button onClick={() => abrirEdicionCosto(p)} style={{ fontSize: '0.75rem' }}>Editar</button>
                          </span>
                        )}
                      </td>
                    )}
                    <td style={{ color: bajoStock ? 'red' : 'inherit', fontWeight: bajoStock ? 'bold' : 'normal' }}>
                      {p.stock_disponible} {bajoStock && '⚠ stock bajo'}
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {tab === 'accesorio' ? (
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>
                          Ajusta el stock desde Cargos y Descargos
                        </span>
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
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '0.75rem' }}>
                        <UnidadesProducto
                          productId={p.id}
                          tipo={tab}
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

function UnidadesProducto({ productId, tipo, currentUser }) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  const [editandoCostoUnitId, setEditandoCostoUnitId] = useState(null);
  const [nuevoCostoUnitValor, setNuevoCostoUnitValor] = useState('');

  const esAdmin = currentUser?.role === 'administrador';

  const cargar = useCallback(async () => {
    setLoading(true);
    const data = await window.api.listUnits(productId);
    setUnits(data);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirEdicionCostoUnit = (u) => {
    setEditandoCostoUnitId(u.id);
    setNuevoCostoUnitValor(String(u.costo_unitario_usd ?? 0));
  };

  const cancelarEdicionCostoUnit = () => {
    setEditandoCostoUnitId(null);
    setNuevoCostoUnitValor('');
  };

  const guardarEdicionCostoUnit = async (id) => {
    const costo = parseFloat(nuevoCostoUnitValor);
    if (isNaN(costo) || costo < 0) {
      alert('Costo invalido');
      return;
    }
    const res = await window.api.updateUnitCosto(id, costo);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    setEditandoCostoUnitId(null);
    setNuevoCostoUnitValor('');
    cargar();
  };

  const label = tipo === 'equipo' ? 'IMEI' : tipo === 'usim' ? 'Codigo USIM' : 'Codigo SIM (ICCID)';

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: 0 }}>
        Vista de solo lectura de {label}s. Para agregar o dar de baja unidades, usa el modulo{' '}
        <strong>Cargos y Descargos</strong>.
      </p>

      {loading ? (
        <p>Cargando...</p>
      ) : units.length === 0 ? (
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
                {esAdmin && (
                  editandoCostoUnitId === u.id ? (
                    <span style={{ marginLeft: '0.5rem' }}>
                      <input
                        type="number"
                        step="0.01"
                        value={nuevoCostoUnitValor}
                        onChange={(e) => setNuevoCostoUnitValor(e.target.value)}
                        style={{ width: '80px' }}
                        autoFocus
                      />
                      <button onClick={() => guardarEdicionCostoUnit(u.id)}>Guardar</button>
                      <button onClick={cancelarEdicionCostoUnit}>Cancelar</button>
                    </span>
                  ) : (
                    <span style={{ marginLeft: '0.5rem', color: '#666' }}>
                      (costo: ${Number(u.costo_unitario_usd || 0).toFixed(2)}{' '}
                      <button onClick={() => abrirEdicionCostoUnit(u)} style={{ fontSize: '0.75rem' }}>Editar</button>)
                    </span>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
