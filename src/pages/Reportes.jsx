import React, { useState, useEffect, useCallback } from 'react';
import FiltroFecha, { hoyStr, primerDiaDelMesStr } from '../components/FiltroFecha.jsx';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';

const TABS = [
  { key: 'ganancias', label: 'Ventas y ganancias' },
  { key: 'compras', label: 'Compras' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'cargosDescargos', label: 'Cargos y descargos de inventario' }
];

export default function Reportes() {
  const [tab, setTab] = useState('ganancias');
  const [desde, setDesde] = useState(primerDiaDelMesStr());
  const [hasta, setHasta] = useState(hoyStr());

  return (
    <div>
      <h1>Reportes</h1>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: tab === t.key ? 'bold' : 'normal',
              backgroundColor: tab === t.key ? '#0b4f9e' : '#e2e8f0',
              color: tab === t.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FiltroFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />

      {tab === 'ganancias' && <ReporteGanancias desde={desde} hasta={hasta} />}
      {tab === 'compras' && <ReporteCompras desde={desde} hasta={hasta} />}
      {tab === 'facturas' && <ReporteFacturas desde={desde} hasta={hasta} />}
      {tab === 'cargosDescargos' && <ReporteCargosDescargos desde={desde} hasta={hasta} />}
    </div>
  );
}

// ---------------- Ventas y ganancias ----------------

function ReporteGanancias({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteGanancias(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  return (
    <>
      <div className="form-box" style={{ maxWidth: '460px', marginTop: '1rem' }}>
        <p>Facturas emitidas: <strong>{reporte.cantidadFacturas}</strong></p>
        <p>Ventas (sin IVA): <strong>${reporte.ventasSubtotalUsd.toFixed(2)}</strong></p>
        <p>IVA cobrado: <strong>${reporte.ivaCobradoUsd.toFixed(2)}</strong></p>
        <p>Costo de lo vendido: <strong>${reporte.costoVendidoUsd.toFixed(2)}</strong></p>
        <p style={{ color: '#027a48' }}>Ganancia bruta: <strong>${reporte.gananciaBrutaUsd.toFixed(2)}</strong></p>
        <p>Gastos del periodo: <strong>${reporte.gastosTotalUsd.toFixed(2)}</strong></p>
        <p style={{ color: reporte.gananciaNetaUsd >= 0 ? '#027a48' : '#b42318', fontSize: '1.1rem' }}>
          <strong>Ganancia neta: ${reporte.gananciaNetaUsd.toFixed(2)}</strong>
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
                <td>${g.monto_usd.toFixed(2)}</td>
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

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  if (detalle) {
    const { encabezado, items } = detalle;
    return (
      <div style={{ marginTop: '1rem' }}>
        <button onClick={() => setDetalle(null)}>&larr; Volver al listado</button>
        <h3>Compra #{encabezado.id}</h3>
        <p><strong>Proveedor:</strong> {encabezado.proveedor}</p>
        <p><strong>N° factura de compra:</strong> {encabezado.numero_factura_compra}</p>
        <p><strong>Fecha:</strong> {encabezado.created_at}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', margin: '1rem 0' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Producto</th>
              <th>Cantidad</th>
              <th>Costo unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{i.descripcion}</td>
                <td>{i.cantidad}</td>
                <td>${i.costo_unitario_usd.toFixed(2)}</td>
                <td>${i.total_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><strong>Total: ${encabezado.total_usd.toFixed(2)}</strong></p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <p>
        Compras registradas: <strong>{reporte.cantidad}</strong>{' '}
        — Total: <strong>${reporte.totalUsd.toFixed(2)}</strong>
      </p>
      {reporte.compras.length === 0 ? (
        <p>No hay compras registradas en este rango de fechas.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Proveedor</th>
              <th>N° factura</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reporte.compras.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{c.created_at}</td>
                <td>{c.proveedor}</td>
                <td>{c.numero_factura_compra}</td>
                <td>${c.total_usd.toFixed(2)}</td>
                <td><button onClick={() => verDetalle(c.id)}>Ver</button></td>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', margin: '1rem 0' }}>
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
                <td>${i.precio_unitario_usd.toFixed(2)}</td>
                <td>${i.subtotal_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-box" style={{ maxWidth: '320px' }}>
          <p>Subtotal: ${factura.subtotal_usd.toFixed(2)}</p>
          <p>IVA ({factura.iva_porcentaje}%): ${factura.iva_usd.toFixed(2)}</p>
          <p><strong>Total: ${factura.total_usd.toFixed(2)}</strong></p>
          <p style={{ color: '#666' }}>Tasa usada: {factura.tasa_cambio} Bs/USD</p>
          <p><strong>Total Bs: {factura.total_bs.toFixed(2)}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <p>
        Facturas emitidas: <strong>{reporte.cantidad}</strong>{' '}
        — Total: <strong>${reporte.totalUsd.toFixed(2)}</strong> (Bs {reporte.totalBs.toFixed(2)})
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
                <td>{f.cliente_nombre}</td>
                <td>${f.total_usd.toFixed(2)}</td>
                <td>Bs {f.total_bs.toFixed(2)}</td>
                <td><button onClick={() => verDetalle(f.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Cargos y descargos de inventario ----------------

function ReporteCargosDescargos({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [subtab, setSubtab] = useState('cargos');

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteCargosDescargos(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p>Cargando...</p>;
  if (!reporte) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
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
          <p>Total cargado en el periodo: <strong>${reporte.totalCargosUsd.toFixed(2)}</strong></p>
          {reporte.cargos.length === 0 ? (
            <p>No hay cargos manuales de inventario en este rango de fechas.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Costo unit.</th>
                  <th>Total</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {reporte.cargos.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{c.created_at}</td>
                    <td>{c.producto_nombre || c.descripcion}</td>
                    <td>{c.tipo}</td>
                    <td>{c.cantidad}</td>
                    <td>${c.costo_unitario_usd.toFixed(2)}</td>
                    <td>${c.total_usd.toFixed(2)}</td>
                    <td>{c.usuario || '—'}</td>
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
              </tr>
            </thead>
            <tbody>
              {reporte.descargos.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>#{String(d.id).padStart(5, '0')}</td>
                  <td>{d.created_at}</td>
                  <td>{d.producto_nombre}</td>
                  <td>{d.producto_tipo}</td>
                  <td>{d.unidad_codigo || '—'}</td>
                  <td>{d.cantidad}</td>
                  <td>{d.motivo}</td>
                  <td>{d.usuario || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
