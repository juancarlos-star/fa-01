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
  const [expandedId, setExpandedId] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const [categorias, setCategorias] = useState([]);
  const [nombresSugeridos, setNombresSugeridos] = useState([]);

  const [editandoCostoId, setEditandoCostoId] = useState(null);
  const [nuevoCostoValor, setNuevoCostoValor] = useState('');

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
    setEditandoCostoId(null);
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

  // Columnas siempre presentes: Nombre, Categoria, Precio 1, Precio 2, Codigo, Stock, Acciones.
  // Mas las condicionales de accesorios (Cod. barras y, si es admin, Costo prom.).
  const totalColumnas = 7 + (esAccesorio ? 1 : 0) + (esAccesorio && esAdmin ? 1 : 0);

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

      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setMostrarModalCrear(true)}
          style={{
            padding: '0.6rem 1.2rem',
            background: '#0b4f9e',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
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
              <th>Precio 1 (Bs.)</th>
              <th>Precio 2 (Dolares)</th>
              <th>Código</th>
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
                    <td>${fmt(Number(p.precio2 || 0))}</td>
                    <td>{p.codigo_producto || '—'}</td>
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
                      <button onClick={() => setProductoEnEdicion(p)}>Editar</button>
                      <button onClick={() => handleEliminar(p.id)}>Eliminar</button>
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
