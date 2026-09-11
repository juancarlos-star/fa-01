import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
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

// Iconos pequeños en SVG (sin depender de ninguna libreria externa) para los botones de la
// columna "Acciones" y el campo de busqueda, siguiendo el estilo de la imagen de referencia.
function IconoOjo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoLapiz() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function IconoX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconoLupa() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// Las 3 primeras son pestañas fijas del sistema (manejan codigos/IMEI por unidad).
// El resto de las pestañas se generan dinamicamente: una por cada categoria creada en
// "Gestion de categorias" (todas de tipo 'accesorio'), y se comportan igual que Accesorios.
const TABS_FIJAS = [
  { id: 'equipo', tipo: 'equipo', categoria: null, label: 'Teléfonos (IMEI)' },
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
  const [expandedId, setExpandedId] = useState(null);
  const [busqueda, setBusqueda] = useState('');


  const [categorias, setCategorias] = useState([]);
  const [nombresSugeridos, setNombresSugeridos] = useState([]);

  const [productoAEliminar, setProductoAEliminar] = useState(null);

  // Modal centrado para "Crear producto": antes el formulario completo se mostraba siempre
  // debajo de las pestañas; ahora solo aparece dentro de esta ventana emergente al presionar
  // el boton "+ Crear producto".
  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);

  // ---- Edicion completa de un producto: se hace con la misma ventana ProductoRapidoModal que
  // ya se usa en Compras, Compras Telf/Acces y Reportes > Inventario (categoria, "se vende por
  // unidad" y demas campos quedan siempre iguales en cualquier pantalla donde se edite). Aqui
  // solo se guarda el producto completo que se esta editando (o null si no hay ninguno).
  const [productoEnEdicion, setProductoEnEdicion] = useState(null);

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
    setBusqueda('');
  }, [tab.id, cargarProductos, cargarNombresSugeridos]);

  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  // Al crear o editar un producto desde la ventana ProductoRapidoModal, se refresca la lista y
  // (para creacion) se cierra el modal. La categoria/tipo ya quedan definidos dentro del propio
  // modal (igual que en Compras, Compras Telf/Acces y Reportes > Inventario), asi que aqui no
  // hace falta mantener un formulario aparte ni pre-seleccionar nada segun la pestaña activa.
  const handleProductoCreado = () => {
    setMostrarModalCrear(false);
    cargarProductos();
    cargarNombresSugeridos();
  };

  const handleProductoEditado = () => {
    setProductoEnEdicion(null);
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

  const productosFiltrados = products.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  // Columnas siempre presentes: Codigo, Producto, Categoria, Precio 1, Precio 2, Stock, Acciones.
  // Mas las condicionales: Cod. barras (solo accesorios, justo despues de Codigo), y si es admin,
  // Costo prom. + Margen $ + Margen % (para cualquier tipo, no solo accesorios -asi se puede
  // comparar rentabilidad entre telefonos, SIM, etc.).
  const totalColumnas = 7 + (esAccesorio ? 1 : 0) + (esAdmin ? 3 : 0);

  const totalesTab = productosFiltrados.reduce(
    (acc, p) => {
      const stock = p.stock_disponible || 0;
      const costo = Number(p.costo_promedio_usd || 0);
      const precioUsd = Number(p.precio2 || 0);
      acc.stock += stock;
      acc.valorCosto += stock * costo;
      acc.valorVenta += stock * precioUsd;
      return acc;
    },
    { stock: 0, valorCosto: 0, valorVenta: 0 }
  );

  return (
    <div>
      <h1>Gestión de Productos</h1>

      <div className="tab-container-claro" style={{ margin: '1rem 0' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabId(t.id)}
            className={tab.id === t.id ? 'tab-item-claro active' : 'tab-item-claro'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setMostrarModalCrear(true)}
          className="btn-primary"
        >
          + Crear producto
        </button>
      </div>

      {mostrarModalCrear && (
        <ProductoRapidoModal
          onConfirm={handleProductoCreado}
          onCancel={() => setMostrarModalCrear(false)}
        />
      )}


      <div style={{ margin: '0.75rem 0' }}>
        <div className="campo-buscar-pill" style={{ maxWidth: '360px' }}>
          <IconoLupa />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar por nombre en ${tab.label}...`}
          />
        </div>
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
              <th style={{ padding: '0.5rem' }}>Código</th>
              {esAccesorio && <th>Cod. barras</th>}
              <th>Producto</th>
              <th>Categoria</th>
              {esAdmin && <th>Costo prom.</th>}
              <th>Precio 1 (Bs.)</th>
              <th>Precio 2 (Dolares)</th>
              {esAdmin && <th>Margen $</th>}
              {esAdmin && <th>Margen %</th>}
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => {
              const costo = Number(p.costo_promedio_usd || 0);
              const precioUsd = Number(p.precio2 || 0);
              const margen = precioUsd - costo;
              const margenPct = costo ? (margen / costo) * 100 : null;
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{p.codigo_producto || '—'}</td>
                    {esAccesorio && <td>{p.codigo_barras}</td>}
                    <td style={{ color: '#0057a3' }}>{p.nombre}</td>
                    <td>{p.categoria}</td>
                    {esAdmin && <td>${fmt(costo)}</td>}
                    <td>${fmt(Number(p.precio))}</td>
                    <td>${fmt(precioUsd)}</td>
                    {esAdmin && <td style={{ color: margen >= 0 ? '#0b8f4e' : '#b42318' }}>${fmt(margen)}</td>}
                    {esAdmin && <td style={{ color: margen >= 0 ? '#0b8f4e' : '#b42318' }}>{margenPct === null ? '—' : `${fmt(margenPct)}%`}</td>}
                    <td>{p.stock_disponible}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {esAccesorio ? (
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>
                          Ajusta el stock desde Cargos y Descargos
                        </span>
                      ) : (
                        <button className="btn-accion-pill" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                          <IconoOjo /> {expandedId === p.id ? 'Ocultar' : 'Ver unidades'}
                        </button>
                      )}
                      <button className="btn-accion-icono" title="Editar" onClick={() => setProductoEnEdicion(p)}>
                        <IconoLapiz />
                      </button>
                      {esAdmin && (
                        <button className="btn-accion-icono btn-accion-icono-peligro" title="Eliminar" onClick={() => handleEliminar(p.id)}>
                          <IconoX />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === p.id && !esAccesorio && (
                    <tr>
                      <td colSpan={totalColumnas} style={{ background: '#f8fafc', padding: '0.75rem' }}>
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
          <tfoot>
            <tr style={{ borderTop: '2px solid #1d2939', fontWeight: 700, background: '#f9fafb' }}>
              <td style={{ padding: '0.5rem' }} colSpan={esAccesorio ? 4 : 3}>TOTAL {tab.label.toUpperCase()}</td>
              {esAdmin && <td>${fmt(totalesTab.valorCosto)}</td>}
              <td colSpan={2}></td>
              {esAdmin && <td colSpan={2}></td>}
              <td>{totalesTab.stock}</td>
              <td>Valor venta: ${fmt(totalesTab.valorVenta)}</td>
            </tr>
          </tfoot>
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

      {productoEnEdicion && (
        <ProductoRapidoModal
          productoEditar={productoEnEdicion}
          onConfirm={handleProductoEditado}
          onCancel={() => setProductoEnEdicion(null)}
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

  const [editandoCodigoUnitId, setEditandoCodigoUnitId] = useState(null);
  const [nuevoCodigoUnitValor, setNuevoCodigoUnitValor] = useState('');
  const [errorCodigoUnit, setErrorCodigoUnit] = useState('');
  const [guardandoCodigoUnit, setGuardandoCodigoUnit] = useState(false);

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

  const abrirEdicionCodigoUnit = (u) => {
    setEditandoCodigoUnitId(u.id);
    setNuevoCodigoUnitValor(u.codigo);
    setErrorCodigoUnit('');
  };

  const cancelarEdicionCodigoUnit = () => {
    setEditandoCodigoUnitId(null);
    setNuevoCodigoUnitValor('');
    setErrorCodigoUnit('');
  };

  const guardarEdicionCodigoUnit = async (id) => {
    setErrorCodigoUnit('');
    const nuevoCodigo = nuevoCodigoUnitValor.trim();
    if (!nuevoCodigo) {
      setErrorCodigoUnit('El codigo no puede estar vacio');
      return;
    }
    setGuardandoCodigoUnit(true);
    try {
      // Verificacion en tiempo real: el codigo/IMEI no debe estar repetido con ninguna otra
      // unidad ya registrada en el inventario, antes de intentar guardar el cambio.
      const { existe } = await window.api.codigoExiste({ codigo: nuevoCodigo, excludeId: id });
      if (existe) {
        setErrorCodigoUnit('Ese codigo ya esta registrado en otra unidad del inventario');
        return;
      }
      const res = await window.api.updateUnitCodigo(id, nuevoCodigo);
      if (!res.ok) {
        setErrorCodigoUnit(res.message);
        return;
      }
      setEditandoCodigoUnitId(null);
      setNuevoCodigoUnitValor('');
      cargar();
    } catch (err) {
      setErrorCodigoUnit('Ocurrio un error inesperado: ' + (err?.message || String(err)));
    } finally {
      setGuardandoCodigoUnit(false);
    }
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
              {editandoCodigoUnitId === u.id ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <input
                    type="text"
                    value={nuevoCodigoUnitValor}
                    onChange={(e) => setNuevoCodigoUnitValor(e.target.value)}
                    style={{ width: '160px' }}
                    autoFocus
                  />
                  {errorCodigoUnit && <span style={{ color: 'red', fontSize: '0.75rem' }}>{errorCodigoUnit}</span>}
                  <span>
                    <button onClick={() => guardarEdicionCodigoUnit(u.id)} disabled={guardandoCodigoUnit} style={{ fontSize: '0.75rem' }}>
                      {guardandoCodigoUnit ? 'Guardando...' : 'Guardar'}
                    </button>{' '}
                    <button onClick={cancelarEdicionCodigoUnit} disabled={guardandoCodigoUnit} style={{ fontSize: '0.75rem' }}>Cancelar</button>
                  </span>
                </span>
              ) : (
                <span style={{ wordBreak: 'break-all' }}>
                  {u.codigo} — <em>{labelEstadoUnidad(u)}</em>{' '}
                  {u.estado !== 'vendido' && (
                    <button onClick={() => abrirEdicionCodigoUnit(u)} style={{ fontSize: '0.75rem' }}>Editar</button>
                  )}
                </span>
              )}
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
