import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FiltroFecha, { hoyStr, primerDiaDelMesStr } from '../components/FiltroFecha.jsx';
import CompraFacturaDetalle from '../components/CompraFacturaDetalle.jsx';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import Facturas from './Facturas.jsx';
import SelectorProducto from '../components/SelectorProducto.jsx';
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
  generarPDFVendedoresEstadisticas
} from '../utils/generarReportesPDF.js';
import { fmt } from '../utils/format.js';

// Reportes organizados por categorias (Inventario, Vendedores, Ventas, Compras...), cada una
// con su propio sub-menu de reportes. Los reportes de Impuestos y Etiquetas se agregan en
// partes siguientes; por ahora solo se muestran las categorias que ya tienen contenido.
const CATEGORIAS = [
  {
    key: 'inventario',
    label: 'Inventario',
    items: [
      { key: 'inventarioProductos', label: 'Productos' },
      { key: 'inventarioFisico', label: 'Inventario Físico' },
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
      { key: 'productosVendidos', label: 'Ventas de productos' },
      { key: 'vendedoresEstadisticas', label: 'Estadísticas' }
    ]
  },
  {
    key: 'ventas',
    label: 'Ventas',
    items: [
      { key: 'historial', label: 'Historial de facturas' },
      { key: 'ganancias', label: 'Ventas y ganancias' },
      { key: 'facturas', label: 'Transacciones procesadas' },
      { key: 'devolucionesFacturas', label: 'Devoluciones de Facturas' },
      { key: 'clientes', label: 'Clientes' }
    ]
  },
  {
    key: 'compras',
    label: 'Compras',
    items: [
      { key: 'compras', label: 'Compras' },
      { key: 'devolucionesCompras', label: 'Devoluciones de Compras' }
    ]
  }
];

// Pestañas que no usan el filtro de rango de fechas global (manejan su propia carga de datos).
const SIN_FILTRO_FECHA = ['clientes', 'historial', 'inventarioProductos', 'inventarioFisico', 'vendedoresUltimasVentas'];

export default function Reportes({ currentUser }) {
  const [categoria, setCategoria] = useState('ventas');
  const [tab, setTab] = useState('ganancias');
  const [desde, setDesde] = useState(primerDiaDelMesStr());
  const [hasta, setHasta] = useState(hoyStr());

  const categoriaActiva = CATEGORIAS.find((c) => c.key === categoria) || CATEGORIAS[0];

  const irACategoria = (catKey) => {
    setCategoria(catKey);
    const cat = CATEGORIAS.find((c) => c.key === catKey);
    if (cat && cat.items.length > 0) setTab(cat.items[0].key);
  };

  return (
    <div>
      <h1>Reportes</h1>

      <div className="reportes-categorias">
        {CATEGORIAS.map((c) => (
          <button
            key={c.key}
            className={categoria === c.key ? 'active' : ''}
            onClick={() => irACategoria(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

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

      {tab === 'historial' && <Facturas currentUser={currentUser} />}
      {tab === 'ganancias' && <ReporteGanancias desde={desde} hasta={hasta} />}
      {tab === 'compras' && <ReporteCompras desde={desde} hasta={hasta} />}
      {tab === 'devolucionesCompras' && <ReporteDevolucionesCompras desde={desde} hasta={hasta} />}
      {tab === 'facturas' && <ReporteFacturas desde={desde} hasta={hasta} />}
      {tab === 'devolucionesFacturas' && <ReporteDevolucionesFacturas desde={desde} hasta={hasta} />}
      {tab === 'productosVendidos' && <ReporteProductosVendidos desde={desde} hasta={hasta} />}
      {tab === 'cargosDescargos' && <ReporteCargosDescargos desde={desde} hasta={hasta} />}
      {tab === 'clientes' && <ReporteClientes />}
      {tab === 'inventarioProductos' && <ReporteInventarioProductos />}
      {tab === 'inventarioFisico' && <ReporteInventarioFisico />}
      {tab === 'vendedoresEfectividad' && <ReporteVendedoresEfectividad desde={desde} hasta={hasta} />}
      {tab === 'vendedoresUltimasVentas' && <ReporteVendedoresUltimasVentas />}
      {tab === 'vendedoresPorCategoria' && <ReporteVendedoresPorCategoria desde={desde} hasta={hasta} />}
      {tab === 'vendedoresEstadisticas' && <ReporteVendedoresEstadisticas desde={desde} hasta={hasta} />}
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFGanancias(reporte, desde, hasta);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFCompras(reporte, desde, hasta);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFFacturas(reporte, desde, hasta);
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
        <button onClick={() => generarFacturaPDF(factura, items)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
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
        <button onClick={() => generarFacturaPDF(factura, items)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
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
  { key: 'equipo', label: 'Equipos (IMEI)' },
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      const tipoLabel = TIPOS_PRODUCTO.find((t) => t.key === tipo)?.label || tipo;
      await generarPDFProductosVendidos(reporte, desde, hasta, tipoLabel);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFCargosDescargos(reporte, desde, hasta);
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

const TIPO_LABEL_INV = { equipo: 'Equipo', simcard: 'SIM', usim: 'USIM', accesorio: 'Accesorio' };

function ReporteInventarioProductos() {
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFInventarioProductos(reporte, depositoLabel);
    } finally {
      setGenerandoPDF(false);
    }
  };

  if (cargando || !reporte) return <p>Cargando...</p>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="form-box" style={{ maxWidth: '360px' }}>
        <label>Deposito</label>
        <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
          <option value="">-- Todos los depositos --</option>
          {depositos.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      <BotonPDF onClick={descargarPDF} generando={generandoPDF} />
      <p>
        Stock total: <strong>{reporte.totales.stock}</strong>
        {' '}— Valor al costo: <strong>${fmt(reporte.totales.valorCostoUsd)}</strong>
        {' '}— Valor a precio de venta: <strong>${fmt(reporte.totales.valorPrecioUsd)}</strong>
      </p>

      {reporte.productos.length === 0 ? (
        <p>No hay productos cargados.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Tipo</th>
              <th>Codigo</th>
              <th>Producto</th>
              <th>Stock</th>
              <th>Costo prom.</th>
              <th>Valor costo</th>
              <th>Precio</th>
              <th>Valor precio</th>
            </tr>
          </thead>
          <tbody>
            {reporte.productos.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{TIPO_LABEL_INV[p.tipo] || p.tipo}</td>
                <td>{p.codigo_producto || '—'}</td>
                <td>{p.nombre}</td>
                <td>{p.stock}</td>
                <td>${fmt(p.costo_promedio_usd)}</td>
                <td>${fmt(p.valorCostoUsd)}</td>
                <td>${fmt(p.precio)}</td>
                <td>${fmt(p.valorPrecioUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Inventario: Fisico (hoja de conteo) ----------------

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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFInventarioFisico(reporte);
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

          <h3>Accesorios (por cantidad) — {reporte.totalAccesorios} unidades en sistema</h3>
          {reporte.accesorios.length === 0 ? (
            <p>No hay accesorios cargados.</p>
          ) : (
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
            </table>
          )}

          <h3>Equipos, SIM y USIM (por unidad) — {reporte.totalUnidades} unidades en sistema</h3>
          {reporte.unidades.length === 0 ? (
            <p>No hay unidades disponibles en este deposito.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Tipo</th>
                  <th>Producto</th>
                  <th>Codigo / IMEI</th>
                </tr>
              </thead>
              <tbody>
                {reporte.unidades.map((u) => (
                  <tr key={u.unit_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{TIPO_LABEL_INV[u.tipo] || u.tipo}</td>
                    <td>{u.nombre}</td>
                    <td>{u.codigo}</td>
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresEfectividad(reporte);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresUltimasVentas(reporte.filas);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresPorCategoria(reporte);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFVendedoresEstadisticas(reporte);
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

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarPDFClientes(clientesFiltrados);
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

// ---------------- Boton reutilizable: generar, guardar y abrir PDF ----------------

function BotonPDF({ onClick, generando }) {
  return (
    <button
      onClick={onClick}
      disabled={generando}
      style={{
        marginBottom: '0.75rem',
        backgroundColor: '#0b4f9e',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '0.5rem 1rem',
        cursor: generando ? 'default' : 'pointer'
      }}
    >
      {generando ? 'Generando PDF...' : '📄 Descargar PDF'}
    </button>
  );
}
