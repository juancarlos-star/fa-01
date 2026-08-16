import React, { useState, useEffect, useCallback, useMemo } from 'react';
import FiltroFecha, { hoyStr, primerDiaDelMesStr } from '../components/FiltroFecha.jsx';
import CompraFacturaDetalle from '../components/CompraFacturaDetalle.jsx';
import Facturas from './Facturas.jsx';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import {
  generarPDFGanancias,
  generarPDFCompras,
  generarPDFFacturas,
  generarPDFCargosDescargos,
  generarPDFClientes
} from '../utils/generarReportesPDF.js';
import { fmt } from '../utils/format.js';

const TABS = [
  { key: 'historial', label: 'Historial de facturas' },
  { key: 'ganancias', label: 'Ventas y ganancias' },
  { key: 'compras', label: 'Compras' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'cargosDescargos', label: 'Cargos y descargos de inventario' },
  { key: 'clientes', label: 'Clientes' }
];

// Pestañas que no usan el filtro de rango de fechas global (manejan su propia carga de datos).
const SIN_FILTRO_FECHA = ['clientes', 'historial'];

export default function Reportes({ currentUser }) {
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

      {!SIN_FILTRO_FECHA.includes(tab) && (
        <FiltroFecha desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />
      )}

      {tab === 'historial' && <Facturas currentUser={currentUser} />}
      {tab === 'ganancias' && <ReporteGanancias desde={desde} hasta={hasta} />}
      {tab === 'compras' && <ReporteCompras desde={desde} hasta={hasta} />}
      {tab === 'facturas' && <ReporteFacturas desde={desde} hasta={hasta} />}
      {tab === 'cargosDescargos' && <ReporteCargosDescargos desde={desde} hasta={hasta} />}
      {tab === 'clientes' && <ReporteClientes />}
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
    const { encabezado, items } = detalle;
    return <CompraFacturaDetalle encabezado={encabezado} items={items} onVolver={() => setDetalle(null)} />;
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
                <td>{c.numero_factura_compra}</td>
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
                <td>${fmt(i.precio_unitario_usd)}</td>
                <td>${fmt(i.subtotal_usd)}</td>
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
                <td>{f.cliente_nombre}</td>
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

// ---------------- Cargos y descargos de inventario ----------------

function ReporteCargosDescargos({ desde, hasta }) {
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [subtab, setSubtab] = useState('cargos');
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteCargosDescargos(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

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
                    <td>${fmt(c.costo_unitario_usd)}</td>
                    <td>${fmt(c.total_usd)}</td>
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
