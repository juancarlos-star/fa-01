import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Inventario from './Inventario.jsx';
import FiltroFecha, { hoyStr, primerDiaDelMesStr } from '../components/FiltroFecha.jsx';
import CompraFacturaDetalle from '../components/CompraFacturaDetalle.jsx';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import Facturas from './Facturas.jsx';
import Etiquetas from './Etiquetas.jsx';
import SelectorProducto from '../components/SelectorProducto.jsx';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { agruparItemsPorProducto } from '../utils/agruparFacturaItems.js';
import {
  generarPDFGanancias,
  generarPDFCompras,
  generarPDFFacturas,
  generarPDFCargosDescargos,
  generarPDFClientes,
  generarPDFProductosVendidos,
  generarPDFInventarioProductos,
  generarPDFInventarioFisico,
  generarPDFVendedoresEfectividad,
  generarPDFVendedoresUltimasVentas,
  generarPDFVendedoresPorCategoria,
  generarPDFVendedoresEstadisticas,
  generarPDFVentasTransacciones,
  generarPDFVentasCierreDiario,
  generarPDFVentasRelacion,
  generarPDFVentasPorCliente,
  generarPDFLibroVentasIva,
  generarPDFLibroComprasIva,
  generarPDFCatalogo
} from '../utils/generarReportesPDF.js';import { fmt } from '../utils/format.js';

// Reportes organizados por categorias (Inventario, Vendedores, Ventas, Compras...), cada una
// con su propio sub-menu de reportes.
const CATEGORIAS = [
  {
    key: 'inventario',
    label: 'Inventario',
    items: [
      { key: 'gestionProductos', label: 'Gestión de Productos' },
      { key: 'inventarioProductos', label: 'Productos' },
      { key: 'inventarioFisico', label: 'Inventario Físico' },
      { key: 'stockBajo', label: 'Stock Bajo' },
      { key: 'stockMuerto', label: 'Stock muerto' },
      { key: 'catalogoWhatsapp', label: 'Catálogo para WhatsApp' },
      { key: 'cargosDescargos', label: 'Cargos y descargos de inventario' }
    ]
  },
  {
    key: 'vendedores',
    label: 'Vendedores',
    items: [
      { key: 'vendedoresEfectividad', label: 'Efectividad' },
      { key: 'vendedoresUltimasVentas', label: 'Últimas ventas a clientes' },
      { key: 'vendedoresPorCategoria', label: 'Ventas por categoría' },
      { key: 'vendedoresPeriodo', label: 'Ventas por período (día/semana/mes)' },
      { key: 'productosVendidos', label: 'Ventas de productos' },
      { key: 'vendedoresEstadisticas', label: 'Estadísticas' },
      { key: 'metasComisiones', label: 'Metas y comisiones' }
    ]
  },
  {
    key: 'ventas',
    label: 'Ventas',
    items: [
      { key: 'historial', label: 'Historial de facturas' },
      { key: 'ganancias', label: 'Ventas y ganancias' },
      { key: 'margenProducto', label: 'Margen real por producto' },
      { key: 'ventasTransacciones', label: 'Transacciones' },
      { key: 'ventasCierreDiario', label: 'Cierre de ventas diario' },
      { key: 'ventasRelacion', label: 'Relación de ventas' },
      { key: 'facturas', label: 'Transacciones procesadas' },
      { key: 'ventasPorCliente', label: 'Visualizar transacciones' },
      { key: 'devolucionesFacturas', label: 'Devoluciones de Facturas' },
      { key: 'clientes', label: 'Clientes' },
      { key: 'clientesFrecuentes', label: 'Clientes frecuentes / recuperación' }
    ]
  },
  {
    key: 'compras',
    label: 'Compras',
    items: [
      { key: 'compras', label: 'Compras' },
      { key: 'devolucionesCompras', label: 'Devoluciones de Compras' }
    ]
  },
  {
    key: 'impuestos',
    label: 'Impuestos',
    items: [
      { key: 'libroVentasIva', label: 'Libro de Ventas IVA' },
      { key: 'libroComprasIva', label: 'Libro de Compras IVA' }
    ]
  },
  {
    key: 'etiquetas',
    label: 'Etiquetas',
    items: [
      { key: 'etiquetas', label: 'Imprimir Etiquetas' }
    ]
  }
];

// Pestañas que no usan el filtro de rango de fechas global (manejan su propia carga de datos).
const SIN_FILTRO_FECHA = ['clientes', 'clientesFrecuentes', 'historial', 'gestionProductos', 'inventarioProductos', 'inventarioFisico', 'stockBajo', 'stockMuerto', 'catalogoWhatsapp', 'vendedoresUltimasVentas', 'ventasCierreDiario', 'etiquetas', 'metasComisiones'];

// Hook compartido para traer la configuracion de la tienda (nombre, RIF, logo, etc.), usado por
// las pestañas de Reportes que generan el PDF de una factura individual (necesitan pasarsela a
// generarFacturaPDF para que el documento muestre los datos de la tienda).
function useSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => { window.api.getSettings().then(setSettings); }, []);
  return settings;
}

export default function Reportes({ currentUser, categoriaInicial }) {
  const esAdmin = currentUser?.role === 'administrador';
  // El vendedor ve todas las categorias y pestañas de Reportes, con solo 2 excepciones
  // puntuales: "Impuestos > Libro de Ventas IVA" y "Vendedores > Efectividad", que siguen
  // siendo exclusivas del administrador (el backend tambien las bloquea por detras, en
  // electron/main.js, asi que aunque alguien manipulara la app no podria traer esos datos).
  const categoriasVisibles = esAdmin
    ? CATEGORIAS
    : CATEGORIAS.map((c) => ({
        ...c,
        items: c.items.filter((i) => {
          if (c.key === 'impuestos' && i.key === 'libroVentasIva') return false;
          if (c.key === 'vendedores' && i.key === 'vendedoresEfectividad') return false;
          return true;
        })
      }));

  const categoriaDefault = categoriaInicial && categoriasVisibles.some((c) => c.key === categoriaInicial)
    ? categoriaInicial
    : categoriasVisibles[0].key;
  const catDefaultObj = categoriasVisibles.find((c) => c.key === categoriaDefault);
  const [categoria, setCategoria] = useState(categoriaDefault);
  const [tab, setTab] = useState(catDefaultObj.items[0].key);
  const [desde, setDesde] = useState(primerDiaDelMesStr());
  const [hasta, setHasta] = useState(hoyStr());

  const categoriaActiva = categoriasVisibles.find((c) => c.key === categoria) || categoriasVisibles[0];
  const tabActiva = categoriaActiva.items.find((i) => i.key === tab);

  return (
    <div>
      <h1>Reportes · {categoriaActiva.label}{tabActiva ? ` · ${tabActiva.label}` : ''}</h1>

      <div className="reportes-subtabs">
        {categoriaActiva.items.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!SIN_FILTRO_FECHA.includes(tab) && (
        <FiltroFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />
      )}

      {tab === 'gestionProductos' && <Inventario currentUser={currentUser} />}
      {tab === 'historial' && <Facturas currentUser={currentUser} />}
      {tab === 'ganancias' && <ReporteGanancias desde={desde} hasta={hasta} />}
      {tab === 'margenProducto' && <ReporteMargenProducto desde={desde} hasta={hasta} />}
      {tab === 'compras' && <ReporteCompras desde={desde} hasta={hasta} />}
      {tab === 'devolucionesCompras' && <ReporteDevolucionesCompras desde={desde} hasta={hasta} />}
      {tab === 'facturas' && <ReporteFacturas desde={desde} hasta={hasta} />}
      {tab === 'devolucionesFacturas' && <ReporteDevolucionesFacturas desde={desde} hasta={hasta} />}
      {tab === 'productosVendidos' && <ReporteProductosVendidos desde={desde} hasta={hasta} />}
      {tab === 'cargosDescargos' && <ReporteCargosDescargos desde={desde} hasta={hasta} />}
      {tab === 'clientes' && <ReporteClientes />}
      {tab === 'clientesFrecuentes' && <ReporteClientesFrecuentes />}
      {tab === 'inventarioProductos' && <ReporteInventarioProductos />}
      {tab === 'inventarioFisico' && <ReporteInventarioFisico />}
      {tab === 'stockBajo' && <ReporteStockBajo />}
      {tab === 'stockMuerto' && <ReporteStockMuerto />}
      {tab === 'catalogoWhatsapp' && <ReporteCatalogoWhatsapp />}
      {tab === 'vendedoresEfectividad' && <ReporteVendedoresEfectividad desde={desde} hasta={hasta} />}
      {tab === 'vendedoresUltimasVentas' && <ReporteVendedoresUltimasVentas />}
      {tab === 'vendedoresPorCategoria' && <ReporteVendedoresPorCategoria desde={desde} hasta={hasta} />}
      {tab === 'vendedoresEstadisticas' && <ReporteVendedoresEstadisticas desde={desde} hasta={hasta} />}
      {tab === 'vendedoresPeriodo' && <ReporteVendedoresPeriodo desde={desde} hasta={hasta} />}
      {tab === 'metasComisiones' && <ReporteMetasComisiones esAdmin={esAdmin} />}
      {tab === 'ventasTransacciones' && <ReporteVentasTransacciones desde={desde} hasta={hasta} />}
      {tab === 'ventasCierreDiario' && <ReporteVentasCierreDiario />}
      {tab === 'ventasRelacion' && <ReporteVentasRelacion desde={desde} hasta={hasta} />}
      {tab === 'ventasPorCliente' && <ReporteVentasPorCliente desde={desde} hasta={hasta} />}
      {tab === 'libroVentasIva' && <ReporteLibroVentasIva desde={desde} hasta={hasta} />}
      {tab === 'libroComprasIva' && <ReporteLibroComprasIva desde={desde} hasta={hasta} />}
      {tab === 'etiquetas' && <Etiquetas />}
    </div>
  );
}

// ---------------- Ventas y ganancias ----------------

function ReporteGanancias({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteGanancias(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFGanancias(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <div className="form-box" style={{ maxWidth: '460px', marginTop: '1rem' }}>
        <p>Facturas emitidas: <strong>{reporte.cantidadFacturas}</strong></p>
        <p>Ventas (sin IVA): <strong>${fmt(reporte.ventasSubtotalUsd)}</strong></p>
        <p>IVA cobrado: <strong>${fmt(reporte.ivaCobradoUsd)}</strong></p>
        <p>Costo de lo vendido: <strong>${fmt(reporte.costoVendidoUsd)}</strong></p>
        <p style={{ color: '#027a48' }}>Ganancia bruta: <strong>${fmt(reporte.gananciaBrutaUsd)}</strong></p>
        <p>Gastos del periodo: <strong>${fmt(reporte.gastosTotalUsd)}</strong></p>
        <p style={{ color: reporte.gananciaNetaUsd >= 0 ? '#027a48' : '#b42318', fontSize: '1.1rem' }}>
          <strong>Ganancia neta: ${fmt(reporte.gananciaNetaUsd)}</strong>
        </p>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Gastos del periodo</h3>
      {reporte.gastos.length === 0 ? (
        <p>No hay gastos registrados en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Concepto</th>
              <th>Categoria</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {reporte.gastos.map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{g.created_at}</td>
                <td>{g.concepto}</td>
                <td>{g.categoria || '—'}</td>
                <td>${fmt(g.monto_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------- Compras ----------------

function ReporteCompras({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteCompras(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); setDetalle(null); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleCompraEncabezado(id);
    if (res.ok) setDetalle(res);
  };

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFCompras(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalle) {
    const { encabezado, items, devoluciones, resumenDevolucion } = detalle;
    return (
      <CompraFacturaDetalle
        encabezado={encabezado}
        items={items}
        devoluciones={devoluciones}
        resumenDevolucion={resumenDevolucion}
        onVolver={() => setDetalle(null)}
      />
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Compras registradas: <strong>{reporte.cantidad}</strong>{' '}
        — Total: <strong>${fmt(reporte.totalUsd)}</strong>
      </p>
      {reporte.compras.length === 0 ? (
        <p>No hay compras registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N°</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>N° factura</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reporte.compras.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>#{c.id}</td>
                <td>{c.created_at}</td>
                <td>{c.proveedor}</td>
                <td>
                  {c.numero_factura_compra}
                  {c.numerosDevolucion && c.numerosDevolucion.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#b42318', fontWeight: 600 }}>
                      {c.devueltoTotal ? '⚠ Devuelta por completo' : '⚠ Con devolución parcial'} — N° {c.numerosDevolucion.map((n) => String(n).padStart(6, '0')).join(', ')}
                    </div>
                  )}
                </td>
                <td>${fmt(c.total_usd)}</td>
                <td><button onClick={() => verDetalle(c.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Devoluciones de Compras ----------------

function ReporteDevolucionesCompras({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteDevolucionesCompras(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); setDetalle(null); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleCompraEncabezado(id);
    if (res.ok) setDetalle(res);
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalle) {
    const { encabezado, items, devoluciones, resumenDevolucion } = detalle;
    return (
      <CompraFacturaDetalle
        encabezado={encabezado}
        items={items}
        devoluciones={devoluciones}
        resumenDevolucion={resumenDevolucion}
        onVolver={() => setDetalle(null)}
      />
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <p>
        Devoluciones registradas: <strong>{reporte.cantidad}</strong>{' '}
        — Total devuelto: <strong>${fmt(reporte.totalUsd)}</strong>
      </p>
      {reporte.devoluciones.length === 0 ? (
        <p>No hay devoluciones de compras registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N° de devolución</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Compra devuelta</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reporte.devoluciones.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee', color: '#b42318' }}>
                <td style={{ padding: '0.5rem' }}>Devolución N° {String(d.numero_devolucion).padStart(6, '0')}</td>
                <td>{d.created_at}</td>
                <td>{d.proveedor}</td>
                <td>{d.numero_factura_compra_original || `#${d.devuelve_a_encabezado_id}`}</td>
                <td>${fmt(d.total_usd)}</td>
                <td><button onClick={() => verDetalle(d.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Facturas ----------------

function ReporteFacturas({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const settings = useSettings();
  const [detalle, setDetalle] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteFacturas(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); setDetalle(null); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleFactura(id);
    if (res.ok) setDetalle(res);
  };

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFFacturas(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalle) {
    const { factura, items } = detalle;
    return (
      <div style={{ marginTop: '1rem' }}>
        <button onClick={() => setDetalle(null)}>&larr; Volver al listado</button>
        <h3>Factura N° {factura.numero_factura || String(factura.id).padStart(6, '0')}</h3>
        <p><strong>Cliente:</strong> {factura.cliente_nombre} {factura.cliente_rif ? `(${factura.cliente_rif})` : ''}</p>
        <p><strong>Fecha:</strong> {factura.created_at}</p>
        <p><strong>Vendedor:</strong> {factura.usuario}</p>
        <button onClick={() => generarFacturaPDF(factura, items, settings)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', margin: '1rem 0', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem', width: '32%' }}>Producto</th>
              <th style={{ width: '28%' }}>Codigo</th>
              <th style={{ width: '10%' }}>Cant.</th>
              <th style={{ width: '15%' }}>Precio unit.</th>
              <th style={{ width: '15%' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {agruparItemsPorProducto(items).map((grupo) => (
              <tr key={grupo.product_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem', verticalAlign: 'top', wordBreak: 'break-word' }}>{grupo.descripcion}</td>
                <td style={{ verticalAlign: 'top' }}>
                  {grupo.codigos.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {grupo.codigos.map((c) => (
                        <span key={c} style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{c}</span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ verticalAlign: 'top' }}>{grupo.cantidad}</td>
                <td style={{ verticalAlign: 'top' }}>${fmt(grupo.precio_unitario)}</td>
                <td style={{ verticalAlign: 'top' }}>${fmt(grupo.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-box" style={{ maxWidth: '320px' }}>
          <p>Subtotal: ${fmt(factura.subtotal_usd)}</p>
          <p>IVA ({factura.iva_porcentaje}%): ${fmt(factura.iva_usd)}</p>
          <p><strong>Total: ${fmt(factura.total_usd)}</strong></p>
          <p style={{ color: '#666' }}>Tasa usada: {factura.tasa_cambio} Bs/USD</p>
          <p><strong>Total Bs: {fmt(factura.total_bs)}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Facturas emitidas: <strong>{reporte.cantidad}</strong>{' '}
        — Total: <strong>${fmt(reporte.totalUsd)}</strong> (Bs {fmt(reporte.totalBs)})
      </p>
      {reporte.facturas.length === 0 ? (
        <p>No hay facturas emitidas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N°</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Total USD</th>
              <th>Total Bs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reporte.facturas.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>#{f.numero_factura || String(f.id).padStart(6, '0')}</td>
                <td>{f.created_at}</td>
                <td>
                  {f.cliente_nombre}
                  {f.numerosDevolucion && f.numerosDevolucion.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#b42318', fontWeight: 600 }}>
                      {f.devueltoTotal ? '⚠ Devuelta por completo' : '⚠ Con devolución parcial'} — N° {f.numerosDevolucion.map((n) => String(n).padStart(6, '0')).join(', ')}
                    </div>
                  )}
                </td>
                <td>${fmt(f.total_usd)}</td>
                <td>Bs {fmt(f.total_bs)}</td>
                <td><button onClick={() => verDetalle(f.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Devoluciones de Facturas ----------------

function ReporteDevolucionesFacturas({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const settings = useSettings();
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteDevolucionesFacturas(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); setDetalle(null); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleFactura(id);
    if (res.ok) setDetalle(res);
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalle) {
    const { factura, items } = detalle;
    return (
      <div style={{ marginTop: '1rem' }}>
        <button onClick={() => setDetalle(null)}>&larr; Volver al listado</button>
        <h3>Devolución N° {String(factura.numero_devolucion).padStart(6, '0')}</h3>
        <p><strong>Cliente:</strong> {factura.cliente_nombre} {factura.cliente_rif ? `(${factura.cliente_rif})` : ''}</p>
        <p><strong>Fecha:</strong> {factura.created_at}</p>
        <p><strong>Vendedor:</strong> {factura.usuario}</p>
        <button onClick={() => generarFacturaPDF(factura, items, settings)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', margin: '1rem 0', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem', width: '32%' }}>Producto</th>
              <th style={{ width: '28%' }}>Codigo</th>
              <th style={{ width: '10%' }}>Cant.</th>
              <th style={{ width: '15%' }}>Precio unit.</th>
              <th style={{ width: '15%' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {agruparItemsPorProducto(items).map((grupo) => (
              <tr key={grupo.product_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem', verticalAlign: 'top', wordBreak: 'break-word' }}>{grupo.descripcion}</td>
                <td style={{ verticalAlign: 'top' }}>
                  {grupo.codigos.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {grupo.codigos.map((c) => (
                        <span key={c} style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{c}</span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ verticalAlign: 'top' }}>{grupo.cantidad}</td>
                <td style={{ verticalAlign: 'top' }}>${fmt(grupo.precio_unitario)}</td>
                <td style={{ verticalAlign: 'top' }}>${fmt(grupo.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-box" style={{ maxWidth: '320px' }}>
          <p>Subtotal: ${fmt(factura.subtotal_usd)}</p>
          <p>IVA ({factura.iva_porcentaje}%): ${fmt(factura.iva_usd)}</p>
          <p><strong>Total: ${fmt(factura.total_usd)}</strong></p>
          <p style={{ color: '#666' }}>Tasa usada: {factura.tasa_cambio} Bs/USD</p>
          <p><strong>Total Bs: {fmt(factura.total_bs)}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <p>
        Devoluciones registradas: <strong>{reporte.cantidad}</strong>{' '}
        — Total devuelto: <strong>${fmt(reporte.totalUsd)}</strong> (Bs {fmt(reporte.totalBs)})
      </p>
      {reporte.devoluciones.length === 0 ? (
        <p>No hay devoluciones de facturas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N° de devolución</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Factura devuelta</th>
              <th>Total USD</th>
              <th>Total Bs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reporte.devoluciones.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee', color: '#b42318' }}>
                <td style={{ padding: '0.5rem' }}>Devolución N° {String(d.numero_devolucion).padStart(6, '0')}</td>
                <td>{d.created_at}</td>
                <td>{d.cliente_nombre}</td>
                <td>{d.numero_factura_original || `#${d.devuelve_a_factura_id}`}</td>
                <td>${fmt(d.total_usd)}</td>
                <td>Bs {fmt(d.total_bs)}</td>
                <td><button onClick={() => verDetalle(d.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Productos vendidos ----------------

const TIPOS_PRODUCTO = [
  { key: 'equipo', label: 'Teléfonos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

function ReporteProductosVendidos({ desde, hasta }) {
  const [tipo, setTipo] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Carga los productos del tipo seleccionado, para el buscador de producto
  useEffect(() => {
    window.api.listProducts(tipo).then(setProductos);
    setProductoId('');
  }, [tipo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteProductosVendidos(desde, hasta, tipo, productoId || null);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta, tipo, productoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      const tipoLabel = TIPOS_PRODUCTO.find((t) => t.key === tipo)?.label || tipo;
      await generarPDFProductosVendidos(reporte, desde, hasta, tipoLabel, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '620px' }}>
        <label>Tipo de producto</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {TIPOS_PRODUCTO.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipo(t.key)}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: tipo === t.key ? '#0b4f9e' : '#e2e8f0',
                color: tipo === t.key ? '#fff' : '#111',
                border: 'none', borderRadius: '4px', cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label>Producto (opcional, deja vacio para ver todos los del tipo)</label>
        <SelectorProducto
          productos={productos}
          value={productoId}
          onChange={setProductoId}
          placeholder="-- Todos los productos --"
          mostrarStock={false}
        />
        {productoId && (
          <button type="button" onClick={() => setProductoId('')} style={{ marginTop: '0.4rem' }}>
            Quitar filtro de producto
          </button>
        )}
      </div>

      {cargando || !reporte ? (
        <p>Cargando...</p>
      ) : (
        <>
          <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
          <p>
            Unidades vendidas en el periodo: <strong>{reporte.cantidadTotal}</strong>
            {' '}— Total: <strong>${fmt(reporte.totalUsd)}</strong>
          </p>

          <h3>Resumen por producto</h3>
          {reporte.resumen.length === 0 ? (
            <p>No hay ventas de este tipo de producto en el rango seleccionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Producto</th>
                  <th>Cantidad vendida</th>
                  <th>Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {reporte.resumen.map((r) => (
                  <tr key={r.product_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{r.descripcion}</td>
                    <td>{r.cantidad}</td>
                    <td>${fmt(r.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Detalle de ventas</h3>
          {reporte.items.length === 0 ? (
            <p>No hay ventas registradas en este rango de fechas.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th>N° factura</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Codigo</th>
                  <th>Cant.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {reporte.items.map((i) => (
                  <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{i.fecha}</td>
                    <td>{i.numero_factura || '—'}</td>
                    <td>{i.cliente_nombre}</td>
                    <td>{i.descripcion}</td>
                    <td>{i.codigo || '—'}</td>
                    <td>{i.cantidad}</td>
                    <td>${fmt(i.subtotal_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Cargos y descargos de inventario ----------------

function ReporteCargosDescargos({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [subtab, setSubtab] = useState('cargos');
  const [generandoPDF, setGenerandoPDF] = useState(false);
  // Documento individual (comprobante) seleccionado para ver/imprimir/descargar:
  // { registro, tipoDocumento: 'cargo' | 'descargo' }
  const [detalleDocumento, setDetalleDocumento] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteCargosDescargos(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); setDetalleDocumento(null); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFCargosDescargos(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalleDocumento) {
    return (
      <CargoDescargoDetalle
        registro={detalleDocumento.registro}
        tipoDocumento={detalleDocumento.tipoDocumento}
        onVolver={() => setDetalleDocumento(null)}
      />
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => setSubtab('cargos')}
          style={{
            padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            backgroundColor: subtab === 'cargos' ? '#027a48' : '#e2e8f0', color: subtab === 'cargos' ? '#fff' : '#111'
          }}
        >
          Cargos ({reporte.cantidadCargos})
        </button>
        <button
          onClick={() => setSubtab('descargos')}
          style={{
            padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            backgroundColor: subtab === 'descargos' ? '#b42318' : '#e2e8f0', color: subtab === 'descargos' ? '#fff' : '#111'
          }}
        >
          Descargos ({reporte.cantidadDescargos})
        </button>
      </div>

      {subtab === 'cargos' && (
        <>
          <p>Total cargado en el periodo: <strong>${fmt(reporte.totalCargosUsd)}</strong></p>
          {reporte.cargos.length === 0 ? (
            <p>No hay cargos manuales de inventario en este rango de fechas.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>N°</th>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Codigo</th>
                  <th>Cantidad</th>
                  <th>Costo unit.</th>
                  <th>Total</th>
                  <th>Usuario</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reporte.cargos.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>#{String(c.secuencia ?? c.id).padStart(5, '0')}</td>
                    <td>{c.created_at}</td>
                    <td>{c.producto_nombre || c.descripcion}</td>
                    <td>{c.tipo}</td>
                    <td>{c.unidad_codigo || '—'}</td>
                    <td>{c.cantidad}</td>
                    <td>${fmt(c.costo_unitario_usd)}</td>
                    <td>${fmt(c.total_usd)}</td>
                    <td>{c.usuario || '—'}</td>
                    <td>
                      <button onClick={() => setDetalleDocumento({ registro: c, tipoDocumento: 'cargo' })}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {subtab === 'descargos' && (
        reporte.descargos.length === 0 ? (
          <p>No hay descargos registrados en este rango de fechas.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.5rem' }}>N°</th>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Codigo</th>
                <th>Cantidad</th>
                <th>Motivo</th>
                <th>Usuario</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reporte.descargos.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>#{String(d.secuencia ?? d.id).padStart(5, '0')}</td>
                  <td>{d.created_at}</td>
                  <td>{d.producto_nombre}</td>
                  <td>{d.producto_tipo}</td>
                  <td>{d.unidad_codigo || '—'}</td>
                  <td>{d.cantidad}</td>
                  <td>{d.motivo}</td>
                  <td>{d.usuario || '—'}</td>
                  <td>
                    <button onClick={() => setDetalleDocumento({ registro: d, tipoDocumento: 'descargo' })}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ---------------- Inventario: Productos (valorizado) ----------------

const TIPO_LABEL_INV = { equipo: 'Teléfono', simcard: 'SIM', usim: 'USIM', accesorio: 'Accesorio' };

function ReporteInventarioProductos() {
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  // ---- Editar producto directo desde este reporte (misma ventana "PRODUCTO NUEVO"/"EDITAR") ----
  const [productoEnEdicion, setProductoEnEdicion] = useState(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);

  const abrirEdicionProducto = async (id) => {
    setCargandoEdicion(true);
    try {
      // El reporte solo trae un resumen de cada producto (para la tabla); antes de editar se
      // busca el registro completo (incluye stock_minimo, codigo_barras, etc.) para no perder
      // esos datos al guardar.
      const todos = await window.api.listProducts();
      const completo = todos.find((p) => p.id === id);
      if (completo) setProductoEnEdicion(completo);
    } finally {
      setCargandoEdicion(false);
    }
  };

  useEffect(() => { window.api.listDepositos(true).then(setDepositos); }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteInventarioProductos(depositoId ? Number(depositoId) : null);
    setReporte(data);
    setCargando(false);
  }, [depositoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const depositoLabel = depositoId
    ? (depositos.find((d) => d.id === Number(depositoId))?.nombre || '—')
    : 'Todos los depositos';

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFInventarioProductos(reporte, depositoLabel, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  const busquedaLower = busqueda.trim().toLowerCase();
  const coincide = (p) =>
    (p.nombre || '').toLowerCase().includes(busquedaLower) ||
    (p.codigo_producto || '').toLowerCase().includes(busquedaLower);
  const productosFiltrados = busquedaLower ? reporte.productos.filter(coincide) : reporte.productos;
  const sugerencias = busquedaLower ? productosFiltrados.slice(0, 8) : [];

  // Agrupados por tipo (Teléfono/SIM/USIM/Accesorio), en ese orden fijo, cada uno con su propio
  // subtotal de unidades y valor -asi se puede ver de un vistazo cuanto stock/valor representa
  // cada categoria, en vez de tener que sumarlo a mano de una lista plana de 50+ productos.
  const ordenTipos = ['equipo', 'simcard', 'usim', 'accesorio'];
  const grupos = ordenTipos
    .map((tipo) => ({ tipo, productos: productosFiltrados.filter((p) => p.tipo === tipo) }))
    .filter((g) => g.productos.length > 0);

  const margenUsd = (p) => (p.precioUsd || 0) - (p.costo_promedio_usd || 0);
  const margenPct = (p) => (p.costo_promedio_usd ? (margenUsd(p) / p.costo_promedio_usd) * 100 : null);

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="form-box" style={{ maxWidth: '360px' }}>
          <label>Deposito</label>
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
            <option value="">-- Todos los depositos --</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>

        <div className="form-box" style={{ maxWidth: '360px', position: 'relative' }}>
          <label>Buscar producto (nombre o código)</label>
          <input
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setMostrarSugerencias(true); }}
            onFocus={() => setMostrarSugerencias(true)}
            onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
            placeholder="Escribe para filtrar..."
          />
          {mostrarSugerencias && busquedaLower && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              background: '#fff', border: '1px solid #d0d5dd', borderRadius: '6px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto', marginTop: '2px'
            }}>
              {sugerencias.length === 0 ? (
                <div style={{ padding: '8px 10px', color: '#98a2b3', fontSize: '0.85rem' }}>Sin coincidencias.</div>
              ) : (
                sugerencias.map((p) => (
                  <div
                    key={p.id}
                    onMouseDown={() => { setBusqueda(p.nombre); setMostrarSugerencias(false); }}
                    style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f0f2f5', fontSize: '0.85rem' }}
                  >
                    <strong>{p.nombre}</strong>{p.codigo_producto ? ` — ${p.codigo_producto}` : ''}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Stock total: <strong>{reporte.totales.stock}</strong>
        {' '}— Valor al costo: <strong>${fmt(reporte.totales.valorCostoUsd)}</strong>
        {' '}— Valor Total $: <strong>${fmt(reporte.totales.valorTotalUsd)}</strong>
        {' '}— Tasa del dia: <strong>{fmt(reporte.tasaCambio)} Bs/USD</strong>
      </p>

      {productosFiltrados.length === 0 ? (
        <p>{busquedaLower ? 'Ningun producto coincide con la busqueda.' : 'No hay productos cargados.'}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #1d2939' }}>
              <th style={{ padding: '0.5rem' }}>Codigo</th>
              <th>Producto</th>
              <th>Stock</th>
              <th>Costo</th>
              <th>Precio Bs.</th>
              <th>Precio $.</th>
              <th>Margen $.</th>
              <th>Margen %</th>
              <th>Valor Total $.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => {
              const subtotalStock = grupo.productos.reduce((acc, p) => acc + p.stock, 0);
              const subtotalCosto = grupo.productos.reduce((acc, p) => acc + p.stock * (p.costo_promedio_usd || 0), 0);
              const subtotalValor = grupo.productos.reduce((acc, p) => acc + p.valorTotalUsd, 0);
              return (
                <React.Fragment key={grupo.tipo}>
                  <tr style={{ background: '#eef4ff' }}>
                    <td colSpan={10} style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: '#0b4f9e' }}>
                      {TIPO_LABEL_INV[grupo.tipo] || grupo.tipo} ({grupo.productos.length})
                    </td>
                  </tr>
                  {grupo.productos.map((p) => {
                    const margen = margenUsd(p);
                    const pct = margenPct(p);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.5rem' }}>{p.codigo_producto || '—'}</td>
                        <td>{p.nombre}</td>
                        <td>{p.stock}</td>
                        <td>${fmt(p.costo_promedio_usd)}</td>
                        <td>Bs. {fmt(p.precioBs)}</td>
                        <td>${fmt(p.precioUsd)}</td>
                        <td style={{ color: margen >= 0 ? '#0b8f4e' : '#b42318' }}>${fmt(margen)}</td>
                        <td style={{ color: margen >= 0 ? '#0b8f4e' : '#b42318' }}>{pct === null ? '—' : `${fmt(pct)}%`}</td>
                        <td>${fmt(p.valorTotalUsd)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => abrirEdicionProducto(p.id)}
                            disabled={cargandoEdicion}
                            style={{
                              padding: '4px 10px', fontSize: '0.78rem', background: '#fff',
                              border: '1px solid #0b4f9e', color: '#0b4f9e', borderRadius: '4px', cursor: 'pointer'
                            }}
                          >
                            ✎ Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderBottom: '2px solid #d0d5dd', fontWeight: 600, background: '#f9fafb' }}>
                    <td style={{ padding: '0.5rem' }} colSpan={2}>Subtotal {TIPO_LABEL_INV[grupo.tipo] || grupo.tipo}</td>
                    <td>{subtotalStock}</td>
                    <td>${fmt(subtotalCosto)}</td>
                    <td colSpan={3}></td>
                    <td colSpan={2}>${fmt(subtotalValor)}</td>
                    <td></td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #1d2939', fontWeight: 700 }}>
              <td style={{ padding: '0.5rem' }} colSpan={2}>TOTAL GENERAL</td>
              <td>{reporte.totales.stock}</td>
              <td>${fmt(reporte.totales.valorCostoUsd)}</td>
              <td colSpan={3}></td>
              <td colSpan={2}>${fmt(reporte.totales.valorTotalUsd)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}

      {productoEnEdicion && (
        <ProductoRapidoModal
          productoEditar={productoEnEdicion}
          onConfirm={() => { setProductoEnEdicion(null); cargar(); }}
          onCancel={() => setProductoEnEdicion(null)}
        />
      )}
    </div>
  );
}

// ---------------- Inventario: Stock Bajo ----------------

// Muestra solo los productos en cantidad CERO, o cuyo stock actual es igual o menor a su
// "Stock minimo (opcional)" configurado en la ficha del producto. Los productos sin stock
// minimo definido (0 o vacio) solo entran a esta lista si su stock es exactamente cero.
function ReporteStockBajo() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [productoEnEdicion, setProductoEnEdicion] = useState(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);

  const abrirEdicionProducto = async (id) => {
    setCargandoEdicion(true);
    try {
      const todos = await window.api.listProducts();
      const completo = todos.find((p) => p.id === id);
      if (completo) setProductoEnEdicion(completo);
    } finally {
      setCargandoEdicion(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteInventarioProductos(null);
    setReporte(data);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !reporte) return <p>Cargando...</p>;

  const stockBajoLista = reporte.productos.filter((p) => {
    const minimo = Number(p.stock_minimo) || 0;
    return p.stock === 0 || (minimo > 0 && p.stock <= minimo);
  });

  const agotados = stockBajoLista.filter((p) => p.stock === 0);
  const bajos = stockBajoLista.filter((p) => p.stock > 0);
  // Estimado de cuanto costaria reponer cada producto hasta su stock minimo configurado (si no
  // tiene minimo configurado, no se puede estimar cuanto reponer, asi que no suma nada).
  const inversionReposicion = stockBajoLista.reduce((acc, p) => {
    const minimo = Number(p.stock_minimo) || 0;
    if (!minimo) return acc;
    const faltante = Math.max(0, minimo - p.stock);
    return acc + faltante * (p.costo_promedio_usd || 0);
  }, 0);

  const busquedaLower = busqueda.trim().toLowerCase();
  const coincide = (p) =>
    (p.nombre || '').toLowerCase().includes(busquedaLower) ||
    (p.codigo_producto || '').toLowerCase().includes(busquedaLower);
  const productosFiltrados = busquedaLower ? stockBajoLista.filter(coincide) : stockBajoLista;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '360px' }}>
        <label>Buscar producto (nombre o código)</label>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Escribe para filtrar..."
        />
      </div>

      <p>
        Total en stock bajo o agotado: <strong>{stockBajoLista.length}</strong>
        {' '}— Agotados: <strong style={{ color: '#b42318' }}>{agotados.length}</strong>
        {' '}— Con stock bajo: <strong style={{ color: '#b54708' }}>{bajos.length}</strong>
        {' '}— Inversión estimada para reponer al mínimo: <strong>${fmt(inversionReposicion)}</strong>
      </p>

      {productosFiltrados.length === 0 ? (
        <p>{stockBajoLista.length === 0 ? 'Ningún producto está en stock bajo o agotado ahora mismo.' : 'Ningún producto coincide con la búsqueda.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {productosFiltrados.map((p) => {
            const agotado = p.stock === 0;
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                  padding: '8px 10px', borderRadius: '6px',
                  background: agotado ? '#fef3f2' : '#fffaeb'
                }}
              >
                <span style={{ fontSize: '0.85rem', color: '#344054' }}>
                  {agotado ? '⛔' : '⚠️'} <strong>{p.nombre}</strong>
                  <span style={{ color: '#98a2b3' }}> — {TIPO_LABEL_INV[p.tipo] || p.tipo}{p.codigo_producto ? ` · ${p.codigo_producto}` : ''}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.78rem', color: '#667085' }}>
                    Costo: ${fmt(p.costo_promedio_usd)}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: agotado ? '#b42318' : '#b54708' }}>
                    {agotado ? 'Agotado (0)' : `Quedan ${p.stock} (mín. ${p.stock_minimo})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => abrirEdicionProducto(p.id)}
                    disabled={cargandoEdicion}
                    style={{ fontSize: '0.78rem', padding: '4px 10px', border: '1px solid #d0d5dd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                  >
                    Editar
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {productoEnEdicion && (
        <ProductoRapidoModal
          productoEditar={productoEnEdicion}
          onConfirm={() => { setProductoEnEdicion(null); cargar(); }}
          onCancel={() => setProductoEnEdicion(null)}
        />
      )}
    </div>
  );
}

// ---------------- Inventario: Stock muerto ----------------

// Productos con existencia ACTUAL que llevan mucho tiempo sin venderse (o nunca se han
// vendido). El umbral de "dias sin moverse" es configurable en pantalla (no hay una regla
// fija de negocio: 30/60/90 dias significan cosas distintas segun el tipo de producto), con
// 60 dias como punto de partida razonable.
function ReporteStockMuerto() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [umbralDias, setUmbralDias] = useState(60);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteStockMuerto();
    setReporte(data);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !reporte) return <p>Cargando...</p>;

  const busquedaLower = busqueda.trim().toLowerCase();
  const coincide = (p) =>
    (p.nombre || '').toLowerCase().includes(busquedaLower) ||
    (p.codigo_producto || '').toLowerCase().includes(busquedaLower);

  const paraLiquidar = reporte.productos.filter((p) => p.diasSinMoverse >= umbralDias);
  const listaFiltrada = (busquedaLower ? paraLiquidar.filter(coincide) : paraLiquidar);
  const capitalEnUmbral = paraLiquidar.reduce((acc, p) => acc + p.capitalInmovilizadoUsd, 0);

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div className="form-box" style={{ maxWidth: '360px' }}>
          <label>Buscar producto (nombre o código)</label>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribe para filtrar..."
          />
        </div>
        <div className="form-box" style={{ maxWidth: '220px' }}>
          <label>Considerar "sin moverse" desde (días)</label>
          <input
            type="number"
            min="1"
            value={umbralDias}
            onChange={(e) => setUmbralDias(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
      </div>

      <p>
        Productos con {umbralDias}+ días sin venderse: <strong>{paraLiquidar.length}</strong>
        {' '}— Capital inmovilizado en esos productos: <strong>${fmt(capitalEnUmbral)}</strong>
        {' '}— Capital inmovilizado en TODO el stock (sin filtrar por días): <strong>${fmt(reporte.capitalTotalInmovilizado)}</strong>
      </p>

      {listaFiltrada.length === 0 ? (
        <p>{paraLiquidar.length === 0 ? 'Ningún producto lleva tanto tiempo sin venderse.' : 'Ningún producto coincide con la búsqueda.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {listaFiltrada.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                padding: '8px 10px', borderRadius: '6px', background: '#fffaeb'
              }}
            >
              <span style={{ fontSize: '0.85rem', color: '#344054' }}>
                🐌 <strong>{p.nombre}</strong>
                <span style={{ color: '#98a2b3' }}> — {TIPO_LABEL_INV[p.tipo] || p.tipo}{p.codigo_producto ? ` · ${p.codigo_producto}` : ''}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.78rem', color: '#667085' }}>
                  Stock: {p.stock} · Costo: ${fmt(p.costo_promedio_usd)} · Capital: ${fmt(p.capitalInmovilizadoUsd)}
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#b54708' }}>
                  {p.nuncaVendido ? `Nunca vendido (${p.diasSinMoverse} días en inventario)` : `${p.diasSinMoverse} días sin venderse`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Ventas: Análisis de margen real por producto ----------------

// A diferencia de "Ventas y ganancias" (que da el total del negocio), aqui se desglosa la
// ganancia POR PRODUCTO usando el costo que tenia cada unidad al momento de venderse (no el
// costo actual), para responder "que producto deja mas ganancia de verdad" y no solo "que
// producto se vende mas". Se ordena por defecto por ganancia total; el % de margen se muestra
// aparte porque un producto puede vender poco pero con margen altisimo, o mucho con margen bajo.
function ReporteMargenProducto({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState('ganancia'); // 'ganancia' o 'margen'

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteMargenPorProducto(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !reporte) return <p>Cargando...</p>;

  const productosOrdenados = [...reporte.productos].sort((a, b) =>
    orden === 'margen' ? b.margenPct - a.margenPct : b.gananciaUsd - a.gananciaUsd
  );

  return (
    <div style={{ marginTop: '1rem' }}>
      <p>
        Ventas totales: <strong>${fmt(reporte.totales.ventasUsd)}</strong>
        {' '}— Costo total: <strong>${fmt(reporte.totales.costoUsd)}</strong>
        {' '}— Ganancia total: <strong style={{ color: '#067647' }}>${fmt(reporte.totales.gananciaUsd)}</strong>
      </p>

      <h4 style={{ marginBottom: '6px' }}>Comparativo por tipo de producto</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1.2rem' }}>
        {reporte.porTipo.length === 0 ? (
          <p>No hay ventas en este rango de fechas.</p>
        ) : reporte.porTipo.map((t) => (
          <div key={t.tipo} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '6px', background: '#f9fafb' }}>
            <span style={{ fontSize: '0.85rem' }}><strong>{TIPO_LABEL_INV[t.tipo] || t.tipo || 'Sin tipo'}</strong></span>
            <span style={{ fontSize: '0.78rem', color: '#667085', display: 'flex', gap: '14px' }}>
              <span>Vendido: {t.cantidad}</span>
              <span>Ventas: ${fmt(t.ventasUsd)}</span>
              <span style={{ fontWeight: 600, color: '#067647' }}>Ganancia: ${fmt(t.gananciaUsd)}</span>
              <span style={{ fontWeight: 600 }}>Margen: {fmt(t.margenPct)}%</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <h4 style={{ margin: 0 }}>Ranking de productos</h4>
        <div className="form-box" style={{ maxWidth: '220px', margin: 0 }}>
          <label>Ordenar por</label>
          <select value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="ganancia">Ganancia total</option>
            <option value="margen">% de margen</option>
          </select>
        </div>
      </div>

      {productosOrdenados.length === 0 ? (
        <p>No hay ventas en este rango de fechas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {productosOrdenados.map((p) => (
            <div key={p.product_id ?? p.descripcion} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: '#f9fafb' }}>
              <span style={{ fontSize: '0.85rem', color: '#344054' }}>
                <strong>{p.descripcion}</strong>
                <span style={{ color: '#98a2b3' }}> — {TIPO_LABEL_INV[p.tipo] || p.tipo || 'Sin tipo'}</span>
              </span>
              <span style={{ fontSize: '0.78rem', color: '#667085', display: 'flex', gap: '14px', flexShrink: 0 }}>
                <span>Vendido: {p.cantidad}</span>
                <span>Ventas: ${fmt(p.ventasUsd)}</span>
                <span style={{ fontWeight: 600, color: '#067647' }}>Ganancia: ${fmt(p.gananciaUsd)}</span>
                <span style={{ fontWeight: 600 }}>Margen: {fmt(p.margenPct)}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Inventario: Catálogo para WhatsApp ----------------

// Genera un PDF listo para compartir por WhatsApp/Estados con lo que hay disponible AHORA
// (stock > 0), tomado directo del inventario real -nunca una lista aparte que se desactualice-,
// con opcion de filtrar por tipo (ej. solo telefonos) antes de generar.
function ReporteCatalogoWhatsapp() {
  const [tipo, setTipo] = useState('');
  const [productos, setProductos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getCatalogoVigente(tipo || null);
    setProductos(data.productos || []);
    setCargando(false);
  }, [tipo]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFCatalogo(productos, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !productos) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '260px' }}>
        <label>Filtrar por tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todo lo disponible</option>
          <option value="equipo">Solo teléfonos</option>
          <option value="simcard">Solo SIM Cards</option>
          <option value="usim">Solo USIM</option>
          <option value="accesorio">Solo accesorios</option>
        </select>
      </div>

      <p>Productos con stock disponible ahora: <strong>{productos.length}</strong></p>

      <button
        type="button"
        onClick={() => generar(false)}
        disabled={generandoPDF || productos.length === 0}
        style={{ backgroundColor: '#0b4f9e', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.6rem 1.2rem', cursor: generandoPDF ? 'default' : 'pointer', marginBottom: '1rem' }}
      >
        {generandoPDF ? 'Generando...' : '📄 Generar catálogo'}
      </button>

      {productos.length === 0 ? (
        <p>No hay productos con stock disponible para este filtro.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {productos.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f9fafb', borderRadius: '6px', fontSize: '0.85rem' }}>
              <span><strong>{p.nombre}</strong><span style={{ color: '#98a2b3' }}> — {TIPO_LABEL_INV[p.tipo] || p.tipo}{p.categoria ? ` · ${p.categoria}` : ''}</span></span>
              <span>${fmt(p.precioUsd)} · Stock: {p.stock}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReporteInventarioFisico() {
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => {
    window.api.listDepositos(true).then((lista) => {
      setDepositos(lista);
      if (lista.length > 0) setDepositoId((actual) => actual || String(lista[0].id));
    });
  }, []);

  const cargar = useCallback(async () => {
    if (!depositoId) { setReporte(null); return; }
    setCargando(true);
    const data = await window.api.getReporteInventarioFisico(Number(depositoId));
    setReporte(data && data.ok ? data : null);
    setCargando(false);
  }, [depositoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFInventarioFisico(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '360px' }}>
        <label>Deposito a contar</label>
        <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
          {depositos.length === 0 && <option value="">-- No hay depositos --</option>}
          {depositos.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {cargando || !reporte ? (
        <p>Cargando...</p>
      ) : (
        <>
          <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
          <p style={{ color: '#667085', fontSize: '0.85rem' }}>
            Esta hoja es para el conteo fisico: descarga el PDF, cuenta lo que hay realmente en
            el deposito y compara contra la columna "en sistema". Este reporte no descuenta ni
            ajusta stock automaticamente.
          </p>

          <h3>Total en inventario — {reporte.totalAccesorios + reporte.totalUnidades} unidades en sistema</h3>

          {reporte.accesorios.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Codigo</th>
                  <th>Producto</th>
                  <th>Cant. en sistema</th>
                </tr>
              </thead>
              <tbody>
                {reporte.accesorios.map((a) => (
                  <tr key={a.product_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{a.codigo_producto || '—'}</td>
                    <td>{a.nombre}</td>
                    <td>{a.cantidadSistema}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #1d2939', fontWeight: 700, background: '#f9fafb' }}>
                  <td style={{ padding: '0.5rem' }} colSpan={2}>Subtotal Accesorios</td>
                  <td>{reporte.totalAccesorios}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {reporte.unidades.length === 0 ? (
            <p>No hay unidades disponibles en este deposito.</p>
          ) : (
            (() => {
              // Agrupadas por tipo (Teléfono/SIM/USIM) y, dentro de cada tipo, por producto —
              // asi se ve cuantas unidades de cada modelo hay que contar, en vez de tener que
              // recorrer a mano una lista plana de decenas de IMEI/ICCID.
              const ordenTipos = ['equipo', 'simcard', 'usim'];
              const gruposPorTipo = ordenTipos
                .map((tipo) => ({ tipo, unidades: reporte.unidades.filter((u) => u.tipo === tipo) }))
                .filter((g) => g.unidades.length > 0);

              return gruposPorTipo.map((grupoTipo) => {
                const porProducto = new Map();
                grupoTipo.unidades.forEach((u) => {
                  if (!porProducto.has(u.nombre)) porProducto.set(u.nombre, []);
                  porProducto.get(u.nombre).push(u);
                });

                return (
                  <table key={grupoTipo.tipo} style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '1.5rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #1d2939' }}>
                        <th style={{ padding: '0.5rem' }} colSpan={3}>
                          {TIPO_LABEL_INV[grupoTipo.tipo] || grupoTipo.tipo} ({grupoTipo.unidades.length})
                        </th>
                      </tr>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd', color: '#667085', fontSize: '0.85rem' }}>
                        <th style={{ padding: '0.35rem 0.5rem' }}>Producto</th>
                        <th>Codigo / IMEI</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(porProducto.entries()).map(([nombre, unidades]) => (
                        <React.Fragment key={nombre}>
                          <tr style={{ background: '#f9fafb' }}>
                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }} colSpan={3}>
                              {nombre} — {unidades.length} unidad{unidades.length === 1 ? '' : 'es'}
                            </td>
                          </tr>
                          {unidades.map((u) => (
                            <tr key={u.unit_id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '0.5rem' }}></td>
                              <td>{u.codigo}</td>
                              <td></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                );
              });
            })()
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Vendedores: Efectividad ----------------

function ReporteVendedoresEfectividad({ desde, hasta }) {
  const [agrupacion, setAgrupacion] = useState('dia');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVendedoresEfectividad(desde, hasta, agrupacion);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta, agrupacion]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresEfectividad(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[{ key: 'dia', label: 'Diario' }, { key: 'mes', label: 'Mensual' }, { key: 'anio', label: 'Anual' }].map((a) => (
          <button
            key={a.key}
            onClick={() => setAgrupacion(a.key)}
            style={{
              padding: '0.4rem 0.9rem',
              backgroundColor: agrupacion === a.key ? '#0b4f9e' : '#e2e8f0',
              color: agrupacion === a.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>Total vendido en el periodo: <strong>${fmt(reporte.totalGeneral)}</strong></p>

      {reporte.filas.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Periodo</th>
              <th>Vendedor</th>
              <th>Facturas</th>
              <th>Total vendido</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{f.periodo}</td>
                <td>{f.nombreVendedor}</td>
                <td>{f.cantidadFacturas}</td>
                <td>${fmt(f.totalUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Vendedores: Ultimas ventas a clientes ----------------

function ReporteVendedoresUltimasVentas() {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVendedoresUltimasVentas();
    setReporte(data);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresUltimasVentas(reporte.filas, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>Clientes con al menos una compra: <strong>{reporte.filas.length}</strong></p>

      {reporte.filas.length === 0 ? (
        <p>Todavia no hay clientes con facturas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Cliente</th>
              <th>Cedula/RIF</th>
              <th>Ultima compra</th>
              <th>N° factura</th>
              <th>Total</th>
              <th>Vendedor</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.cliente_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{f.cliente_nombre}</td>
                <td>{f.rif_cedula || '—'}</td>
                <td>{f.created_at}</td>
                <td>{f.numero_factura || '—'}</td>
                <td>${fmt(f.total_usd)}</td>
                <td>{f.nombreVendedor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Vendedores: Ventas por categoria ----------------

function ReporteVendedoresPorCategoria({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVendedoresPorCategoria(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresPorCategoria(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p style={{ color: '#667085', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        Cuanto vendio cada vendedor de cada tipo de producto (equipo, SIM, USIM, accesorio) en el periodo.
      </p>

      {reporte.matriz.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Vendedor</th>
              {reporte.tipos.map((t) => (
                <th key={t}>{TIPO_LABEL_INV[t] || t}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {reporte.matriz.map((m) => (
              <tr key={m.usuario} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{m.nombreVendedor}</td>
                {reporte.tipos.map((t) => (
                  <td key={t}>${fmt(m[t].totalUsd)} <span style={{ color: '#98a2b3' }}>({m[t].cantidad})</span></td>
                ))}
                <td><strong>${fmt(m.totalUsd)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Vendedores: Estadisticas ----------------

function ReporteVendedoresEstadisticas({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVendedoresEstadisticas(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresEstadisticas(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>Total vendido en el periodo: <strong>${fmt(reporte.totalGeneral)}</strong></p>

      {reporte.filas.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Vendedor</th>
              <th>Facturas</th>
              <th>Total vendido</th>
              <th>Ticket promedio</th>
              <th>Participación</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.usuario} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{f.nombreVendedor}</td>
                <td>{f.cantidadFacturas}</td>
                <td>${fmt(f.totalUsd)}</td>
                <td>${fmt(f.ticketPromedioUsd)}</td>
                <td>{fmt(f.participacionPct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Vendedores: Ventas por período (día/semana/mes) ----------------

// Igual idea que "Relacion de ventas" pero desglosado ademas por vendedor: para cada periodo
// (dia/semana/mes) dentro del rango, cuanto vendio cada quien. Se pivotea en el front (una fila
// por vendedor dentro de cada periodo) porque el backend ya entrega los datos planos.
function ReporteVendedoresPeriodo({ desde, hasta }) {
  const [agrupacion, setAgrupacion] = useState('dia');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVendedoresPeriodo(desde, hasta, agrupacion);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta, agrupacion]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !reporte) return <p>Cargando...</p>;

  const periodos = [...new Set(reporte.filas.map((f) => f.periodo))];

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[{ key: 'dia', label: 'Por día' }, { key: 'semana', label: 'Por semana' }, { key: 'mes', label: 'Por mes' }].map((a) => (
          <button
            key={a.key}
            onClick={() => setAgrupacion(a.key)}
            style={{
              padding: '0.4rem 0.9rem',
              backgroundColor: agrupacion === a.key ? '#0b4f9e' : '#e2e8f0',
              color: agrupacion === a.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {periodos.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {periodos.map((periodo) => {
            const filasPeriodo = reporte.filas.filter((f) => f.periodo === periodo).sort((a, b) => b.totalUsd - a.totalUsd);
            const totalPeriodo = filasPeriodo.reduce((acc, f) => acc + f.totalUsd, 0);
            return (
              <div key={periodo}>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>{periodo} — Total: ${fmt(totalPeriodo)}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {filasPeriodo.map((f) => (
                    <div key={f.usuario} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f9fafb', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <span>{f.nombreVendedor}</span>
                      <span>{f.cantidadFacturas} facturas — ${fmt(f.totalUsd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Vendedores: Metas y comisiones ----------------

// Meta mensual de venta y % de comision por vendedor, configurables por el administrador
// (edicion inline), con barra de progreso del mes actual y comision calculada automaticamente
// (ventas del mes x % de comision). El vendedor (no admin) solo puede ver, no editar.
function ReporteMetasComisiones({ esAdmin }) {
  const [progreso, setProgreso] = useState(null);
  const [metas, setMetas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [edicion, setEdicion] = useState({}); // { usuario: { meta_mensual_usd, comision_pct } }
  const [guardandoUsuario, setGuardandoUsuario] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [dataProgreso, dataMetas] = await Promise.all([
      window.api.getProgresoMetas(),
      esAdmin ? window.api.getMetasVendedores() : Promise.resolve(null)
    ]);
    setProgreso(dataProgreso);
    setMetas(dataMetas);
    setCargando(false);
  }, [esAdmin]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !progreso) return <p>Cargando...</p>;

  const guardar = async (usuario) => {
    const cambios = edicion[usuario];
    if (!cambios) return;
    setGuardandoUsuario(usuario);
    try {
      const res = await window.api.actualizarMetaVendedor(usuario, cambios.meta_mensual_usd, cambios.comision_pct);
      if (!res.ok) { alert(res.message || 'No se pudo guardar'); return; }
      await cargar();
      setEdicion((prev) => { const copia = { ...prev }; delete copia[usuario]; return copia; });
    } finally {
      setGuardandoUsuario(null);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <p style={{ fontSize: '0.85rem', color: '#667085' }}>Mes: <strong>{progreso.mes}</strong></p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {progreso.vendedores.length === 0 ? (
          <p>No hay vendedores activos registrados.</p>
        ) : progreso.vendedores.map((v) => {
          const enEdicion = edicion[v.usuario];
          const metaActual = enEdicion?.meta_mensual_usd ?? v.metaMensualUsd;
          const comisionActual = enEdicion?.comision_pct ?? v.comisionPct;
          return (
            <div key={v.usuario} style={{ border: '1px solid #eaecf0', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <strong>{v.nombreVendedor}</strong>
                <span style={{ fontSize: '0.85rem' }}>
                  Ventas del mes: <strong>${fmt(v.ventasMesUsd)}</strong>
                  {' '}— Comisión calculada: <strong style={{ color: '#067647' }}>${fmt(v.comisionCalculadaUsd)}</strong>
                </span>
              </div>

              {v.metaMensualUsd > 0 && (
                <div style={{ background: '#eaecf0', borderRadius: '6px', height: '10px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{
                    width: `${v.progresoPct}%`, height: '100%',
                    background: v.progresoPct >= 100 ? '#067647' : '#0b4f9e'
                  }} />
                </div>
              )}
              <p style={{ fontSize: '0.78rem', color: '#667085', margin: '0 0 8px' }}>
                {v.metaMensualUsd > 0
                  ? `${fmt(v.progresoPct)}% de la meta ($${fmt(v.metaMensualUsd)})`
                  : 'Sin meta mensual configurada'}
              </p>

              {esAdmin && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-box" style={{ maxWidth: '160px', margin: 0 }}>
                    <label>Meta mensual (USD)</label>
                    <input
                      type="number" min="0" value={metaActual}
                      onChange={(e) => setEdicion((prev) => ({ ...prev, [v.usuario]: { meta_mensual_usd: e.target.value, comision_pct: comisionActual } }))}
                    />
                  </div>
                  <div className="form-box" style={{ maxWidth: '140px', margin: 0 }}>
                    <label>% Comisión</label>
                    <input
                      type="number" min="0" max="100" value={comisionActual}
                      onChange={(e) => setEdicion((prev) => ({ ...prev, [v.usuario]: { meta_mensual_usd: metaActual, comision_pct: e.target.value } }))}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!enEdicion || guardandoUsuario === v.usuario}
                    onClick={() => guardar(v.usuario)}
                    style={{ padding: '6px 14px' }}
                  >
                    {guardandoUsuario === v.usuario ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Ventas: Transacciones (resumen diario) ----------------

function ReporteVentasTransacciones({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVentasTransacciones(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVentasTransacciones(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Facturas: <strong>{reporte.totales.cantidadFacturas}</strong>
        {' '}— Total: <strong>${fmt(reporte.totales.totalUsd)}</strong> (Bs {fmt(reporte.totales.totalBs)})
      </p>

      {reporte.filas.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Facturas</th>
              <th>Total USD</th>
              <th>Total Bs</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.fecha} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{f.fecha}</td>
                <td>{f.cantidadFacturas}</td>
                <td>${fmt(f.totalUsd)}</td>
                <td>Bs {fmt(f.totalBs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Ventas: Cierre de ventas diario ----------------

function ReporteVentasCierreDiario() {
  const [fecha, setFecha] = useState(hoyStr());
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVentasCierreDiario(fecha);
    setReporte(data);
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVentasCierreDiario(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '300px' }}>
        <label>Fecha a cerrar</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      {cargando || !reporte ? (
        <p>Cargando...</p>
      ) : (
        <>
          <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
          <p>
            Facturas: <strong>{reporte.cantidadFacturas}</strong>
            {' '}— Unidades vendidas: <strong>{reporte.totalUnidades}</strong>
            {' '}— Total: <strong>${fmt(reporte.totalUsd)}</strong> (Bs {fmt(reporte.totalBs)})
          </p>

          {reporte.filas.length === 0 ? (
            <p>No hay ventas registradas en esta fecha.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Producto</th>
                  <th>Tipo</th>
                  <th>Codigo</th>
                  <th>Unidades</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {reporte.filas.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{f.descripcion}</td>
                    <td>{TIPO_LABEL_INV[f.tipo] || f.tipo || '—'}</td>
                    <td>{f.codigo || '—'}</td>
                    <td>{f.unidades}</td>
                    <td>${fmt(f.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Ventas: Relacion de ventas ----------------

function ReporteVentasRelacion({ desde, hasta }) {
  const [agrupacion, setAgrupacion] = useState('dia');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteVentasRelacion(desde, hasta, agrupacion);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta, agrupacion]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVentasRelacion(reporte, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[{ key: 'dia', label: 'Diario' }, { key: 'mes', label: 'Mensual' }].map((a) => (
          <button
            key={a.key}
            onClick={() => setAgrupacion(a.key)}
            style={{
              padding: '0.4rem 0.9rem',
              backgroundColor: agrupacion === a.key ? '#0b4f9e' : '#e2e8f0',
              color: agrupacion === a.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />

      {reporte.filas.length === 0 ? (
        <p>No hay ventas registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Periodo</th>
              <th>Facturas</th>
              <th>Subtotal</th>
              <th>IVA</th>
              <th>Total USD</th>
              <th>Total Bs</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.periodo} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{f.periodo}</td>
                <td>{f.cantidadFacturas}</td>
                <td>${fmt(f.subtotalUsd)}</td>
                <td>${fmt(f.ivaUsd)}</td>
                <td>${fmt(f.totalUsd)}</td>
                <td>Bs {fmt(f.totalBs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Ventas: Visualizar transacciones por cliente ----------------

function ReporteVentasPorCliente({ desde, hasta }) {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState(null);
  const [todasFacturas, setTodasFacturas] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const settings = useSettings();
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => {
    window.api.listClientes().then(setClientes);
    window.api.listFacturas().then(setTodasFacturas);
  }, []);

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) || null;

  const sugerencias = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto || clienteSeleccionado) return [];
    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(texto) || (c.rif_cedula || '').toLowerCase().includes(texto))
      .slice(0, 8);
  }, [busqueda, clientes, clienteSeleccionado]);

  const facturasCliente = useMemo(() => {
    if (!clienteId) return [];
    return todasFacturas
      .filter((f) => f.cliente_id === clienteId && !f.es_devolucion)
      .filter((f) => {
        const fecha = (f.created_at || '').slice(0, 10);
        return fecha >= desde && fecha <= hasta;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [clienteId, todasFacturas, desde, hasta]);

  const verDetalle = async (id) => {
    setCargando(true);
    const res = await window.api.detalleFactura(id);
    setCargando(false);
    if (res.ok) setDetalle(res);
  };

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFVentasPorCliente(clienteSeleccionado, facturasCliente, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (detalle) {
    const { factura, items } = detalle;
    return (
      <div style={{ marginTop: '1rem' }}>
        <button onClick={() => setDetalle(null)}>&larr; Volver</button>
        <h3>Factura N° {factura.numero_factura || String(factura.id).padStart(6, '0')}</h3>
        <p><strong>Fecha:</strong> {factura.created_at} — <strong>Vendedor:</strong> {factura.usuario}</p>
        <button onClick={() => generarFacturaPDF(factura, items, settings)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Producto</th>
              <th>Codigo</th>
              <th>Cant.</th>
              <th>Precio unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{i.descripcion}</td>
                <td>{i.codigo || '—'}</td>
                <td>{i.cantidad}</td>
                <td>${fmt(i.precio_unitario_usd)}</td>
                <td>${fmt(i.subtotal_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '420px', position: 'relative' }}>
        <label>Buscar cliente por nombre o cedula/RIF</label>
        <input
          value={clienteSeleccionado ? clienteSeleccionado.nombre : busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setClienteId(null); }}
          placeholder="Escribe para buscar..."
        />
        {sugerencias.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #d0d5dd', borderRadius: '6px', marginTop: '4px' }}>
            {sugerencias.map((c) => (
              <div
                key={c.id}
                onClick={() => { setClienteId(c.id); setBusqueda(''); }}
                style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}
              >
                {c.nombre} {c.rif_cedula ? `(${c.rif_cedula})` : ''}
              </div>
            ))}
          </div>
        )}
        {clienteSeleccionado && (
          <button type="button" onClick={() => { setClienteId(null); setBusqueda(''); }} style={{ marginTop: '0.5rem' }}>
            Cambiar cliente
          </button>
        )}
      </div>

      {!clienteSeleccionado ? (
        <p style={{ marginTop: '1rem', color: '#667085' }}>Busca y selecciona un cliente para ver sus transacciones.</p>
      ) : (
        <>
          <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
          <p>
            Facturas de <strong>{clienteSeleccionado.nombre}</strong> en el periodo: <strong>{facturasCliente.length}</strong>
          </p>
          {cargando && <p>Cargando detalle...</p>}
          {facturasCliente.length === 0 ? (
            <p>Este cliente no tiene facturas en el rango de fechas seleccionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th>N° factura</th>
                  <th>Vendedor</th>
                  <th>Total USD</th>
                  <th>Total Bs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {facturasCliente.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{f.created_at}</td>
                    <td>{f.numero_factura || String(f.id).padStart(6, '0')}</td>
                    <td>{f.usuario || '—'}</td>
                    <td>${fmt(f.total_usd)}</td>
                    <td>Bs {fmt(f.total_bs)}</td>
                    <td><button onClick={() => verDetalle(f.id)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Clientes ----------------

const FILTROS_CLIENTE = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'cedula', label: 'Cedula/RIF' },
  { key: 'telefono', label: 'Telefono' },
  { key: 'email', label: 'Correo electronico' },
  { key: 'fecha', label: 'Fecha de facturacion' }
];

function ReporteClientes() {
  const [clientes, setClientes] = useState(null);
  const [facturas, setFacturas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState('todos'); // todos | emails | telefonos
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Filtro: por nombre, cedula, telefono, correo o fecha de facturacion
  const [filtroTipo, setFiltroTipo] = useState('nombre');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(primerDiaDelMesStr());
  const [filtroHasta, setFiltroHasta] = useState(hoyStr());

  const cargar = useCallback(async () => {
    setCargando(true);
    const [dataClientes, dataFacturas] = await Promise.all([
      window.api.listClientes(),
      window.api.listFacturas()
    ]);
    setClientes(dataClientes);
    setFacturas(dataFacturas);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const clientesFiltrados = useMemo(() => {
    if (!clientes) return [];
    if (filtroTipo === 'fecha') {
      if (!facturas) return [];
      const idsConFactura = new Set(
        facturas
          .filter((f) => {
            const fecha = (f.created_at || '').slice(0, 10);
            return fecha && fecha >= filtroDesde && fecha <= filtroHasta;
          })
          .map((f) => f.cliente_id)
      );
      return clientes.filter((c) => idsConFactura.has(c.id));
    }

    const texto = filtroTexto.trim().toLowerCase();
    if (!texto) return clientes;

    const campoPorTipo = {
      nombre: 'nombre',
      cedula: 'rif_cedula',
      telefono: 'telefono',
      email: 'email'
    };
    const campo = campoPorTipo[filtroTipo];
    return clientes.filter((c) => (c[campo] || '').toLowerCase().includes(texto));
  }, [clientes, facturas, filtroTipo, filtroTexto, filtroDesde, filtroHasta]);

  if (cargando) return <p>Cargando...</p>;
  if (!clientes) return null;

  const emails = clientesFiltrados.map((c) => (c.email || '').trim()).filter(Boolean);
  const telefonos = clientesFiltrados.map((c) => (c.telefono || '').trim()).filter(Boolean);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFClientes(clientesFiltrados, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  const copiarAlPortapapeles = async (lista) => {
    try {
      await navigator.clipboard.writeText(lista.join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      alert('No se pudo copiar: ' + (err?.message || String(err)));
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Clientes registrados: <strong>{clientes.length}</strong>
        {' '}— Filtrados: <strong>{clientesFiltrados.length}</strong>
      </p>

      <div className="form-box" style={{ maxWidth: '620px' }}>
        <label>Filtrar por</label>
        <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setFiltroTexto(''); }}>
          {FILTROS_CLIENTE.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>

        {filtroTipo === 'fecha' ? (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Desde</label><br />
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Hasta</label><br />
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
            </div>
          </div>
        ) : (
          <input
            placeholder={`Buscar por ${FILTROS_CLIENTE.find((f) => f.key === filtroTipo)?.label.toLowerCase()}`}
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => setVista('todos')}
          style={{
            padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            backgroundColor: vista === 'todos' ? '#0b4f9e' : '#e2e8f0', color: vista === 'todos' ? '#fff' : '#111'
          }}
        >
          Todos los datos
        </button>
        <button
          onClick={() => setVista('emails')}
          style={{
            padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            backgroundColor: vista === 'emails' ? '#0b4f9e' : '#e2e8f0', color: vista === 'emails' ? '#fff' : '#111'
          }}
        >
          Solo emails ({emails.length})
        </button>
        <button
          onClick={() => setVista('telefonos')}
          style={{
            padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            backgroundColor: vista === 'telefonos' ? '#0b4f9e' : '#e2e8f0', color: vista === 'telefonos' ? '#fff' : '#111'
          }}
        >
          Solo telefonos ({telefonos.length})
        </button>
      </div>

      {vista === 'todos' && (
        clientesFiltrados.length === 0 ? (
          <p>No hay clientes que coincidan con el filtro.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.5rem' }}>Nombre</th>
                <th>Cedula/RIF</th>
                <th>Telefono</th>
                <th>Direccion</th>
                <th>Email</th>
                <th>Registrado</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{c.nombre}</td>
                  <td>{c.rif_cedula || '—'}</td>
                  <td>{c.telefono || '—'}</td>
                  <td>{c.direccion || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {vista === 'emails' && (
        <div>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            Lista de emails registrados, uno por linea, lista para copiar y pegar en tu herramienta de envio de publicidad.
          </p>
          <textarea
            readOnly
            value={emails.join('\n')}
            style={{ width: '100%', minHeight: '220px', fontFamily: 'monospace', padding: '0.5rem' }}
          />
          <button type="button" onClick={() => copiarAlPortapapeles(emails)} style={{ marginTop: '0.5rem' }}>
            {copiado ? 'Copiado ✓' : 'Copiar todos los emails'}
          </button>
        </div>
      )}

      {vista === 'telefonos' && (
        <div>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            Lista de telefonos registrados, uno por linea, lista para copiar y pegar en tu herramienta de envio de publicidad.
          </p>
          <textarea
            readOnly
            value={telefonos.join('\n')}
            style={{ width: '100%', minHeight: '220px', fontFamily: 'monospace', padding: '0.5rem' }}
          />
          <button type="button" onClick={() => copiarAlPortapapeles(telefonos)} style={{ marginTop: '0.5rem' }}>
            {copiado ? 'Copiado ✓' : 'Copiar todos los telefonos'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- Ventas: Clientes frecuentes / historial de compras ----------------

// Ranking de clientes (por monto gastado o por cantidad de compras) y aviso de clientes que
// llevan mucho tiempo sin volver (umbral en meses, configurable en pantalla). Al hacer clic en
// un cliente se abre su ficha completa con TODO su historial de facturas.
function ReporteClientesFrecuentes() {
  const [clientes, setClientes] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState('monto'); // 'monto' o 'frecuencia'
  const [umbralMeses, setUmbralMeses] = useState(3);
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteClientesResumen();
    setClientes(data.clientes || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !clientes) return <p>Cargando...</p>;

  const conCompras = clientes.filter((c) => c.cantidadCompras > 0);
  const ordenados = [...conCompras].sort((a, b) =>
    orden === 'frecuencia' ? b.cantidadCompras - a.cantidadCompras : b.totalGastadoUsd - a.totalGastadoUsd
  );
  const umbralDias = umbralMeses * 30;
  const paraRecuperar = conCompras
    .filter((c) => c.diasSinComprar !== null && c.diasSinComprar >= umbralDias)
    .sort((a, b) => b.diasSinComprar - a.diasSinComprar);

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="form-box" style={{ maxWidth: '220px' }}>
          <label>Ordenar top clientes por</label>
          <select value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="monto">Monto gastado</option>
            <option value="frecuencia">Frecuencia de compra</option>
          </select>
        </div>
        <div className="form-box" style={{ maxWidth: '220px' }}>
          <label>Avisar si no compra hace (meses)</label>
          <input
            type="number"
            min="1"
            value={umbralMeses}
            onChange={(e) => setUmbralMeses(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>
      </div>

      <h4 style={{ marginBottom: '6px' }}>Top clientes</h4>
      {ordenados.length === 0 ? (
        <p>Todavía no hay clientes con compras registradas.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1.2rem' }}>
          {ordenados.slice(0, 20).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: '#f9fafb' }}>
              <span style={{ fontSize: '0.85rem', color: '#344054' }}>
                <strong>{c.nombre}</strong>
                <span style={{ color: '#98a2b3' }}>{c.rif_cedula ? ` · ${c.rif_cedula}` : ''}{c.telefono ? ` · ${c.telefono}` : ''}</span>
              </span>
              <span style={{ fontSize: '0.78rem', color: '#667085', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <span>Compras: {c.cantidadCompras}</span>
                <span style={{ fontWeight: 600, color: '#067647' }}>Gastado: ${fmt(c.totalGastadoUsd)}</span>
                <button
                  type="button"
                  onClick={() => setClienteSeleccionadoId(c.id)}
                  style={{ fontSize: '0.78rem', padding: '4px 10px', border: '1px solid #d0d5dd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                >
                  Ver historial
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ marginBottom: '6px' }}>Clientes para recuperar (sin comprar hace {umbralMeses}+ meses)</h4>
      {paraRecuperar.length === 0 ? (
        <p>Ningún cliente con compras previas lleva tanto tiempo sin volver.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {paraRecuperar.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: '#fffaeb' }}>
              <span style={{ fontSize: '0.85rem', color: '#344054' }}>
                <strong>{c.nombre}</strong>
                <span style={{ color: '#98a2b3' }}>{c.telefono ? ` · ${c.telefono}` : ''}</span>
              </span>
              <span style={{ fontSize: '0.78rem', color: '#b54708', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                <span style={{ fontWeight: 600 }}>{c.diasSinComprar} días sin comprar</span>
                <button
                  type="button"
                  onClick={() => setClienteSeleccionadoId(c.id)}
                  style={{ fontSize: '0.78rem', padding: '4px 10px', border: '1px solid #d0d5dd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                >
                  Ver historial
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {clienteSeleccionadoId && (
        <ClienteFichaModal clienteId={clienteSeleccionadoId} onClose={() => setClienteSeleccionadoId(null)} />
      )}
    </div>
  );
}

// Ficha de un solo cliente: TODO su historial de facturas (compras y devoluciones), con el
// detalle de productos de cada una. Se muestra como modal simple (no un componente aparte en
// archivo propio) para no multiplicar archivos por una sola pantalla de solo lectura.
function ClienteFichaModal({ clienteId, onClose }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    window.api.getReporteClienteHistorial(clienteId).then((res) => {
      if (activo) { setDatos(res); setCargando(false); }
    });
    return () => { activo = false; };
  }, [clienteId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '10px', padding: '1.2rem', width: '640px', maxHeight: '80vh', overflowY: 'auto' }}>
        {cargando || !datos ? (
          <p>Cargando...</p>
        ) : !datos.ok ? (
          <p>{datos.message}</p>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>{datos.cliente.nombre}</h3>
            <p style={{ fontSize: '0.85rem', color: '#667085' }}>
              {datos.cliente.rif_cedula ? `${datos.cliente.rif_cedula} · ` : ''}{datos.cliente.telefono || 'Sin teléfono'}{datos.cliente.email ? ` · ${datos.cliente.email}` : ''}
            </p>
            <p>
              Compras realizadas: <strong>{datos.totales.cantidadCompras}</strong>
              {' '}— Total gastado: <strong style={{ color: '#067647' }}>${fmt(datos.totales.totalGastadoUsd)}</strong>
            </p>

            {datos.facturas.length === 0 ? (
              <p>Este cliente no tiene facturas registradas todavía.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {datos.facturas.map((f) => (
                  <div key={f.id} style={{ border: '1px solid #eaecf0', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>
                        {f.es_devolucion ? '↩️ Devolución' : '🧾 Factura'} {f.numero_factura ? `#${f.numero_factura}` : ''}
                        <span style={{ color: '#98a2b3' }}> — {f.created_at}</span>
                      </span>
                      <strong>${fmt(f.total_usd)}</strong>
                    </div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#667085' }}>
                      {f.items.map((it, i) => (
                        <li key={i}>{it.cantidad}x {it.descripcion} — ${fmt(it.subtotal_usd)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Boton reutilizable: generar, guardar y abrir PDF ----------------

// ---------------- Impuestos: Libro de Ventas IVA ----------------

function ReporteLibroVentasIva({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getLibroVentasIva(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFLibroVentasIva(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Documentos: <strong>{reporte.cantidad}</strong>{' '}
        — Base imponible: <strong>${fmt(reporte.totalBaseUsd)}</strong>{' '}
        — IVA: <strong>${fmt(reporte.totalIvaUsd)}</strong>{' '}
        — Total: <strong>${fmt(reporte.totalGeneralUsd)}</strong>
      </p>
      {reporte.filas.length === 0 ? (
        <p>No hay facturas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Documento</th>
              <th>Cliente</th>
              <th>RIF / Cédula</th>
              <th>Base imponible</th>
              <th>IVA</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee', color: f.es_devolucion ? '#b42318' : '#111' }}>
                <td style={{ padding: '0.5rem' }}>{f.created_at}</td>
                <td>
                  {f.numero_factura || String(f.id).padStart(6, '0')}
                  {f.es_devolucion === 1 && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      Nota de crédito — Dev. de N° {f.numero_factura_original || f.devuelve_a_factura_id}
                    </div>
                  )}
                </td>
                <td>{f.cliente_nombre}</td>
                <td>{f.cliente_rif}</td>
                <td>${fmt(f.subtotal_usd)}</td>
                <td>${fmt(f.iva_usd)}</td>
                <td>${fmt(f.total_usd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
              <td style={{ padding: '0.5rem' }} colSpan={4}>Totales del periodo</td>
              <td>${fmt(reporte.totalBaseUsd)}</td>
              <td>${fmt(reporte.totalIvaUsd)}</td>
              <td>${fmt(reporte.totalGeneralUsd)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ---------------- Impuestos: Libro de Compras IVA ----------------

function ReporteLibroComprasIva({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getLibroComprasIva(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarPDF = async (imprimir = false) => {
    setGenerandoPDF(true);
    try {
      await generarPDFLibroComprasIva(reporte, desde, hasta, { imprimir });
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Documentos: <strong>{reporte.cantidad}</strong>{' '}
        — Base imponible: <strong>${fmt(reporte.totalBaseUsd)}</strong>{' '}
        — IVA: <strong>${fmt(reporte.totalIvaUsd)}</strong>{' '}
        — Total: <strong>${fmt(reporte.totalGeneralUsd)}</strong>
      </p>
      <p style={{ fontSize: '0.85rem', color: '#667085' }}>
        El IVA se calcula con el porcentaje que estaba configurado al momento de cada compra
        (o el porcentaje actual, si la compra es anterior a que se empezara a guardar este dato).
      </p>
      {reporte.filas.length === 0 ? (
        <p>No hay compras en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Documento</th>
              <th>Proveedor</th>
              <th>RIF</th>
              <th>Base imponible</th>
              <th>IVA (%)</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee', color: f.es_devolucion ? '#b42318' : '#111' }}>
                <td style={{ padding: '0.5rem' }}>{f.created_at}</td>
                <td>
                  {f.numero_factura_compra}
                  {f.es_devolucion === 1 && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      Nota de crédito — Dev. de N° {f.numero_factura_compra_original || f.devuelve_a_encabezado_id}
                    </div>
                  )}
                </td>
                <td>{f.proveedor}</td>
                <td>{f.proveedor_rif}</td>
                <td>${fmt(f.base_usd)}</td>
                <td>${fmt(f.iva_usd)} ({fmt(f.iva_porcentaje_usado, 0)}%)</td>
                <td>${fmt(f.total_con_iva_usd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
              <td style={{ padding: '0.5rem' }} colSpan={4}>Totales del periodo</td>
              <td>${fmt(reporte.totalBaseUsd)}</td>
              <td>${fmt(reporte.totalIvaUsd)}</td>
              <td>${fmt(reporte.totalGeneralUsd)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function BotonPDF({ onClick, generando }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
      <button
        onClick={() => onClick(false)}
        disabled={generando}
        style={{
          backgroundColor: '#0b4f9e',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          padding: '0.5rem 1rem',
          cursor: generando ? 'default' : 'pointer'
        }}
      >
        {generando ? 'Generando...' : '📄 Descargar PDF'}
      </button>
      <button
        onClick={() => onClick(true)}
        disabled={generando}
        style={{
          backgroundColor: '#fff',
          color: '#0b4f9e',
          border: '1px solid #0b4f9e',
          borderRadius: '4px',
          padding: '0.5rem 1rem',
          cursor: generando ? 'default' : 'pointer'
        }}
      >
        {generando ? 'Generando...' : '🖨️ Imprimir'}
      </button>
    </div>
  );
}
