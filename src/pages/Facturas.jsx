import React, { useEffect, useState, useCallback } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';
import PromptModal from '../components/PromptModal.jsx';

export default function Facturas({ currentUser }) {
  const [facturas, setFacturas] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [settings, setSettings] = useState(null);
  const esAdmin = currentUser?.role === 'administrador';

  // Antes de eliminar una factura/nota de venta se pide un motivo (obligatorio) y se guarda un
  // rastro en "facturas_eliminadas" -quien, cuando, cual, y por que- para poder auditarlo despues
  // aunque la factura ya no aparezca en ningun reporte normal. facturaAEliminarId guarda cual
  // factura esta pendiente de confirmar mientras se muestra el PromptModal pidiendo el motivo.
  const [facturaAEliminarId, setFacturaAEliminarId] = useState(null);
  const [errorEliminar, setErrorEliminar] = useState('');
  const [vistaEliminadas, setVistaEliminadas] = useState(false);
  const [eliminadas, setEliminadas] = useState([]);

  const cargar = useCallback(async () => {
    const data = await window.api.listFacturas();
    setFacturas(data);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  const verDetalle = async (id) => {
    const res = await window.api.detalleFactura(id);
    if (res.ok) setDetalle(res);
  };

  const pedirMotivoEliminar = (id) => {
    setErrorEliminar('');
    setFacturaAEliminarId(id);
  };

  const confirmarEliminar = async ({ motivo }) => {
    const res = await window.api.eliminarFactura(facturaAEliminarId, motivo);
    if (!res.ok) {
      setErrorEliminar(res.message);
      return;
    }
    setFacturaAEliminarId(null);
    setDetalle(null);
    cargar();
  };

  const abrirEliminadas = async () => {
    const data = await window.api.listarFacturasEliminadas();
    setEliminadas(Array.isArray(data) ? data : []);
    setVistaEliminadas(true);
  };

  const modalEliminar = facturaAEliminarId !== null && (
    <PromptModal
      title="Motivo de la eliminación"
      fields={[
        {
          name: 'motivo',
          label: 'Escribe por qué se elimina esta factura (obligatorio, queda guardado para auditoría)',
          type: 'textarea',
          required: true,
          autoFocus: true
        }
      ]}
      onConfirm={confirmarEliminar}
      onCancel={() => { setFacturaAEliminarId(null); setErrorEliminar(''); }}
    />
  );

  if (vistaEliminadas) {
    return (
      <div>
        <button onClick={() => setVistaEliminadas(false)}>&larr; Volver</button>
        <h1>Facturas y notas de venta eliminadas</h1>
        <p style={{ color: '#666' }}>
          Registro de auditoría — estas facturas ya no cuentan en ningún reporte, pero queda
          constancia de quién las eliminó, cuándo, y por qué.
        </p>
        {eliminadas.length === 0 ? (
          <p>No se ha eliminado ninguna factura o nota de venta todavía.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.5rem' }}>N°</th>
                <th>Cliente</th>
                <th>Total USD</th>
                <th>Fecha original</th>
                <th>Eliminada por</th>
                <th>Eliminada el</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {eliminadas.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>
                    {e.es_nota_venta ? `NV-${e.numero_factura}` : `#${e.numero_factura}`}
                  </td>
                  <td>{e.cliente_nombre}</td>
                  <td>${fmt(e.total_usd)}</td>
                  <td>{e.fecha_original}</td>
                  <td>{e.usuario_elimino || '—'}</td>
                  <td>{e.eliminado_at}</td>
                  <td>{e.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  if (detalle) {
    const { factura, items } = detalle;
    return (
      <div>
        <button onClick={() => setDetalle(null)}>&larr; Volver</button>
        <h1>Factura N° {factura.es_devolucion ? `Devolución ${String(factura.numero_devolucion).padStart(6, '0')}` : (factura.numero_factura || String(factura.id).padStart(6, '0'))}</h1>
        <p><strong>Cliente:</strong> {factura.cliente_nombre} {factura.cliente_rif ? `(${factura.cliente_rif})` : ''}</p>
        <p><strong>Fecha:</strong> {factura.created_at}</p>
        <p><strong>Vendedor:</strong> {factura.usuario}</p>
        {factura.apartado_origen_id && (
          <p style={{ color: '#175cd3', background: '#eff8ff', border: '1px solid #b2ddff', borderRadius: 6, padding: '0.5rem 0.75rem', display: 'inline-block' }}>
            <strong>
              Esta {factura.es_nota_venta ? 'nota de venta' : 'factura'} corresponde al pago total del Apartado N° {factura.apartado_origen_numero ?? factura.apartado_origen_id}.
            </strong>
          </p>
        )}
        <button onClick={() => generarFacturaPDF(factura, items, settings)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
        {esAdmin && !factura.es_devolucion && (
          <button onClick={() => pedirMotivoEliminar(factura.id)} style={{ marginBottom: '1rem', marginLeft: '8px', color: '#b42318' }}>
            Eliminar factura
          </button>
        )}
        {modalEliminar}
        {errorEliminar && <p style={{ color: '#b42318' }}>{errorEliminar}</p>}
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
      {esAdmin && (
        <button onClick={abrirEliminadas} style={{ marginBottom: '0.75rem' }}>
          🗑️ Ver facturas eliminadas
        </button>
      )}
      {facturas.length === 0 ? (
        <p>Aun no se ha emitido ninguna factura.</p>
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
            {facturas.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee', color: f.es_devolucion ? '#b42318' : undefined }}>
                <td style={{ padding: '0.5rem' }}>
                  {f.es_devolucion ? `Devolución N° ${String(f.numero_devolucion).padStart(6, '0')}` : `#${f.numero_factura || String(f.id).padStart(6, '0')}`}
                  {f.apartado_origen_id && (
                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#175cd3' }}>
                      Apartado N° {f.apartado_origen_numero ?? f.apartado_origen_id}
                    </span>
                  )}
                </td>
                <td>{f.created_at}</td>
                <td>{f.cliente_nombre}</td>
                <td>${fmt(f.total_usd)}</td>
                <td>Bs {fmt(f.total_bs)}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => verDetalle(f.id)}>Ver</button>
                  {esAdmin && !f.es_devolucion && (
                    <button onClick={() => pedirMotivoEliminar(f.id)} style={{ color: '#b42318' }}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modalEliminar}
      {errorEliminar && (
        <p style={{ color: '#b42318', marginTop: 8 }}>{errorEliminar}</p>
      )}
    </div>
  );
}
