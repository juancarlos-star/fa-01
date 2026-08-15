import React, { useEffect, useState } from 'react';
import { generarCompraFacturaPDF } from '../utils/generarCompraFacturaPDF.js';

const IVA_TASA = 0.16;

export default function CompraFacturaDetalle({ encabezado, items, onVolver }) {
  const [settings, setSettings] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const baseImponible = encabezado.total_usd;
  const iva = baseImponible * IVA_TASA;
  const subtotal = baseImponible + iva;

  const [fechaParte, horaParte] = (encabezado.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarCompraFacturaPDF(encabezado, items, settings);
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        <button onClick={onVolver}>&larr; Volver al listado</button>
        <button onClick={() => window.print()}>Imprimir</button>
        <button onClick={descargarPDF} disabled={generandoPDF}>
          {generandoPDF ? 'Generando...' : 'Descargar PDF'}
        </button>
      </div>

      <div className="print-area" style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            {settings?.nombre_tienda && <h2 style={{ margin: 0 }}>{settings.nombre_tienda}</h2>}
            {settings?.rif_tienda && <p style={{ margin: '0.2rem 0', color: '#555' }}>R.I.F.: {settings.rif_tienda}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '0.1rem 0' }}><strong>COMPRA N°:</strong> {encabezado.id}</p>
            <p style={{ margin: '0.1rem 0' }}><strong>FECHA:</strong> {fecha} {horaParte}</p>
            <p style={{ margin: '0.1rem 0' }}><strong>N° FACTURA PROVEEDOR:</strong> {encabezado.numero_factura_compra}</p>
          </div>
        </div>

        <p><strong>PROVEEDOR:</strong> {encabezado.proveedor}</p>
        {encabezado.usuario && <p style={{ color: '#555', fontSize: '0.9rem' }}><strong>Registrado por:</strong> {encabezado.usuario}</p>}

        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '1rem 0' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
              <th style={{ padding: '0.5rem' }}>Concepto</th>
              <th>Cantidad</th>
              <th>Precio unitario</th>
              <th>Monto total</th>
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

        {items.some((i) => i.codigos && i.codigos.length > 0) && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '0.4rem' }}>Detalle de IMEI / codigos por producto</h4>
            {items.filter((i) => i.codigos && i.codigos.length > 0).map((i) => (
              <div key={i.id} style={{ marginBottom: '0.6rem' }}>
                <p style={{ margin: '0 0 0.2rem 0', fontWeight: '600' }}>{i.descripcion} ({i.codigos.length}):</p>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#333', wordBreak: 'break-word' }}>
                  {i.codigos.join(', ')}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: '260px' }}>
            <p style={{ display: 'flex', justifyContent: 'space-between', margin: '0.2rem 0' }}>
              <span>Base imponible:</span> <strong>${baseImponible.toFixed(2)}</strong>
            </p>
            <p style={{ display: 'flex', justifyContent: 'space-between', margin: '0.2rem 0' }}>
              <span>I.V.A. ({(IVA_TASA * 100).toFixed(0)}%):</span> <strong>${iva.toFixed(2)}</strong>
            </p>
            <p style={{ display: 'flex', justifyContent: 'space-between', margin: '0.2rem 0' }}>
              <span>Subtotal:</span> <strong>${subtotal.toFixed(2)}</strong>
            </p>
            <p style={{ display: 'flex', justifyContent: 'space-between', margin: '0.3rem 0', fontSize: '1.1rem', borderTop: '1px solid #333', paddingTop: '0.3rem' }}>
              <span>TOTAL:</span> <strong>${subtotal.toFixed(2)}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
