import React, { useEffect, useState, useCallback } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';

export default function Facturas({ currentUser }) {
  const [facturas, setFacturas] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const esAdmin = currentUser?.role === 'administrador';

  const cargar = useCallback(async () => {
    const data = await window.api.listFacturas();
    setFacturas(data);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleFactura(id);
    if (res.ok) setDetalle(res);
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta factura? Esto devuelve el IMEI/stock al inventario disponible. Esta accion no se puede deshacer.')) return;
    const res = await window.api.eliminarFactura(id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    setDetalle(null);
    cargar();
  };

  if (detalle) {
    const { factura, items } = detalle;
    return (
      <div>
        <button onClick={() => setDetalle(null)}>&larr; Volver</button>
        <h1>Factura N° {factura.numero_factura || String(factura.id).padStart(6, '0')}</h1>
        <p><strong>Cliente:</strong> {factura.cliente_nombre} {factura.cliente_rif ? `(${factura.cliente_rif})` : ''}</p>
        <p><strong>Fecha:</strong> {factura.created_at}</p>
        <p><strong>Vendedor:</strong> {factura.usuario}</p>
        <button onClick={() => generarFacturaPDF(factura, items)} style={{ marginBottom: '1rem' }}>Imprimir PDF</button>
        {esAdmin && (
          <button onClick={() => handleEliminar(factura.id)} style={{ marginBottom: '1rem', marginLeft: '8px', color: '#b42318' }}>
            Eliminar factura
          </button>
        )}
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
    <div>
      <h1>Historial de facturas</h1>
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
              <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>#{f.numero_factura || String(f.id).padStart(6, '0')}</td>
                <td>{f.created_at}</td>
                <td>{f.cliente_nombre}</td>
                <td>${f.total_usd.toFixed(2)}</td>
                <td>Bs {f.total_bs.toFixed(2)}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => verDetalle(f.id)}>Ver</button>
                  {esAdmin && (
                    <button onClick={() => handleEliminar(f.id)} style={{ color: '#b42318' }}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
