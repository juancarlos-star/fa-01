import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { fmt } from '../utils/format.js';

// Los dialogos nativos (alert/confirm) le quitan la activacion de la ventana a Windows a nivel
// de sistema operativo y no siempre se recupera solos; eso es lo que causaba que, luego de usar
// "Ver unidades"/"Eliminar" (o de editar un costo), los campos del formulario (Nombre, Precio de
// venta, Stock minimo, +Crear producto) se vieran habilitados pero no aceptaran texto ni clicks.
// Se reemplaza window.confirm por el modal propio ConfirmDialog (nunca sale de la ventana), y tras
// cualquier alert() se le pide al proceso principal que reponga el foco de forma confiable.
async function avisar(mensaje) {
  alert(mensaje);
  await window.api.focusVentana();
}

// Las 3 primeras son pestañas fijas del sistema (manejan codigos/IMEI por unidad).
// El resto de las pestañas se generan dinamicamente: una por cada categoria creada en
// "Gestion de categorias" (todas de tipo 'accesorio'), y se comportan igual que Accesorios.
const TABS_FIJAS = [
  { id: 'equipo', tipo: 'equipo', categoria: null, label: 'Equipos (IMEI)' },
  { id: 'simcard', tipo: 'simcard', categoria: null, label: 'SIM Cards' },
  { id: 'usim', tipo: 'usim', categoria: null, label: 'USIM' }
];

function labelEstadoUnidad(u) {
  // Solo los items que entraron por el modulo de Compras muestran "Disponible". Los que
  // entraron manualmente por Cargos y Descargos muestran "Cargado" (pero igual son
  // facturables, ya que a nivel interno siguen con estado 'disponible'). Al darlos de baja
  // desde Cargos y Descargos se muestran como "Descargado".
  if (u.estado === 'de_baja') return 'Descargado';
  if (u.estado === 'disponible') return u.compra_encabezado_id ? 'Disponible' : 'Cargado';
  return u.estado;
}

export default function Inventario({ currentUser }) {
  const [tabId, setTabId] = useState('equipo');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const [categorias, setCategorias] = useState([]);
  const [nombresSugeridos, setNombresSugeridos] = useState([]);

  const [editandoCostoId, setEditandoCostoId] = useState(null);
  const [nuevoCostoValor, setNuevoCostoValor] = useState('');

  const [productoAEliminar, setProductoAEliminar] = useState(null);

  const [form, setForm] = useState({
    nombre: '',
    categoria: '',
    precio: '',
    stock_minimo: '',
    codigo_barras: '',
    costo_inicial: ''
  });

  const esAdmin = currentUser?.role === 'administrador';

  const tabsDinamicas = useMemo(
    () =>
      categorias
        .filter((c) => c.tipo === 'accesorio')
        .map((c) => ({ id: `cat-${c.id}`, tipo: 'accesorio', categoria: c.nombre, label: c.nombre })),
    [categorias]
  );

  const tabs = useMemo(() => [...TABS_FIJAS, ...tabsDinamicas], [tabsDinamicas]);
  const tab = tabs.find((t) => t.id === tabId) || TABS_FIJAS[0];
  const esAccesorio = tab.tipo === 'accesorio';

  const cargarProductos = useCallback(async () => {
    setLoading(true);
    const data = await window.api.listProducts(tab.tipo, tab.categoria);
    setProducts(data);
    setLoading(false);
  }, [tab.tipo, tab.categoria]);

  const cargarCategorias = useCallback(async () => {
    const data = await window.api.listCategories();
    setCategorias(data);
  }, []);

  const cargarNombresSugeridos = useCallback(async () => {
    const data = await window.api.listProductNames(tab.tipo, tab.categoria);
    setNombresSugeridos(data);
  }, [tab.tipo, tab.categoria]);

  useEffect(() => {
    cargarProductos();
    cargarNombresSugeridos();
    setExpandedId(null);
    setEditandoCostoId(null);
    setBusqueda('');
  }, [tab.id, cargarProductos, cargarNombresSugeridos]);

  const categoriasDelTipo = categorias.filter((c) => c.tipo === tab.tipo);

  useEffect(() => {
    if (esAccesorio) {
      // En las pestañas dinamicas la categoria ya esta implicita en la pestaña misma.
      setForm((f) => ({ ...f, categoria: tab.categoria || '' }));
    } else if (categoriasDelTipo.length === 1) {
      setForm((f) => ({ ...f, categoria: categoriasDelTipo[0].nombre }));
    } else {
      setForm((f) => ({ ...f, categoria: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, categorias]);

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
      tipo: tab.tipo,
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim(),
      precio: parseFloat(form.precio) || 0,
      stock_minimo: parseInt(form.stock_minimo, 10) || 0,
      codigo_barras: form.codigo_barras.trim(),
      costo_inicial: parseFloat(form.costo_inicial) || 0,
      usuario: currentUser?.username
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setForm({ nombre: '', categoria: esAccesorio ? tab.categoria || '' : '', precio: '', stock_minimo: '', codigo_barras: '', costo_inicial: '' });
    cargarProductos();
    cargarNombresSugeridos();
  };

  const handleEliminar = (id) => {
    setProductoAEliminar(id);
  };

  const ejecutarEliminar = async () => {
    const id = productoAEliminar;
    setProductoAEliminar(null);
    const res = await window.api.deleteProduct(id);
    if (!res.ok) {
      await avisar(res.message);
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
      await avisar('Costo invalido');
      return;
    }
    const res = await window.api.updateProductCosto(id, costo);
    if (!res.ok) {
      await avisar(res.message);
      return;
    }
    setEditandoCostoId(null);
    setNuevoCostoValor('');
    cargarProductos();
  };

  const productosFiltrados = products.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  return (
    <div>
      <h1>Inventario</h1>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabId(t.id)}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: tab.id === t.id ? 'bold' : 'normal',
              backgroundColor: tab.id === t.id ? '#0b4f9e' : '#e2e8f0',
              color: tab.id === t.id ? '#fff' : '#111',
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
        {!esAccesorio && (
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
        )}
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
        {esAccesorio && (
          <>
            <div>
              <label>Codigo de barras</label><br />
              <input
                value={form.codigo_barras}
                onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
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

      {esAccesorio && (
        <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '-1rem' }}>
          El stock inicial no se define aqui: toda entrada de stock se registra desde{' '}
          <strong>Compras</strong> o desde <strong>Cargos y Descargos</strong>.
        </p>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ margin: '0.75rem 0' }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar por nombre en ${tab.label}...`}
          style={{ width: '100%', maxWidth: '360px', padding: '0.5rem' }}
        />
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : products.length === 0 ? (
        <p>No hay productos registrados en esta categoria.</p>
      ) : productosFiltrados.length === 0 ? (
        <p>Ningun producto coincide con "{busqueda}".</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Nombre</th>
              <th>Categoria</th>
              <th>Precio venta</th>
              {esAccesorio && <th>Cod. barras</th>}
              {esAccesorio && esAdmin && <th>Costo prom.</th>}
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => {
              const bajoStock = p.stock_disponible <= p.stock_minimo;
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{p.nombre}</td>
                    <td>{p.categoria}</td>
                    <td>${fmt(Number(p.precio))}</td>
                    {esAccesorio && <td>{p.codigo_barras}</td>}
                    {esAccesorio && esAdmin && (
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
                            ${fmt(Number(p.costo_promedio_usd || 0))}{' '}
                            <button onClick={() => abrirEdicionCosto(p)} style={{ fontSize: '0.75rem' }}>Editar</button>
                          </span>
                        )}
                      </td>
                    )}
                    <td style={{ color: bajoStock ? 'red' : 'inherit', fontWeight: bajoStock ? 'bold' : 'normal' }}>
                      {p.stock_disponible} {bajoStock && '⚠ stock bajo'}
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {esAccesorio ? (
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
                  {expandedId === p.id && !esAccesorio && (
                    <tr>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '0.75rem' }}>
                        <UnidadesProducto
                          productId={p.id}
                          tipo={tab.tipo}
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

      {productoAEliminar !== null && (
        <ConfirmDialog
          message="¿Seguro que deseas eliminar este producto?"
          confirmLabel="Si, eliminar"
          onConfirm={ejecutarEliminar}
          onCancel={() => setProductoAEliminar(null)}
        />
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
    // Las unidades ya facturadas (vendidas) no deben mostrarse aqui: esta vista
    // es para ver el inventario disponible/dado de baja, no el historial de ventas.
    setUnits(data.filter((u) => u.estado !== 'vendido'));
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
      await window.api.focusVentana();
      return;
    }
    const res = await window.api.updateUnitCosto(id, costo);
    if (!res.ok) {
      alert(res.message);
      await window.api.focusVentana();
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
        Vista de solo lectura de {label}s. Para agregar se debe hacer por el modulo de{' '}
        <strong>Compras</strong> (queda como "Disponible") o, si quiere agregar manualmente o dar
        de baja unidades, usa el modulo <strong>Cargos y Descargos</strong> (queda como "Cargado" o
        "Descargado"; los "Cargado" igual se pueden facturar).
      </p>

      {loading ? (
        <p>Cargando...</p>
      ) : units.length === 0 ? (
        <p>Sin unidades registradas todavia.</p>
      ) : (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '6px',
            background: '#fff',
            padding: '0.5rem',
            maxHeight: '380px',
            overflowY: 'auto',
            overflowX: 'auto',
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(10, auto)',
            gridAutoColumns: 'minmax(200px, 1fr)',
            columnGap: '0.75rem',
            width: '100%'
          }}
        >
          {units.map((u) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '0.35rem 0.4rem',
                borderBottom: '1px solid #eee',
                fontSize: '0.85rem'
              }}
            >
              <span style={{ wordBreak: 'break-all' }}>
                {u.codigo} — <em>{labelEstadoUnidad(u)}</em>
              </span>
              {esAdmin && (
                editandoCostoUnitId === u.id ? (
                  <span style={{ marginTop: '0.2rem' }}>
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
                  <span style={{ marginTop: '0.2rem', color: '#666' }}>
                    (costo: ${fmt(Number(u.costo_unitario_usd || 0))}{' '}
                    <button onClick={() => abrirEdicionCostoUnit(u)} style={{ fontSize: '0.75rem' }}>Editar</button>)
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
