import React, { useEffect, useState } from 'react';
import { generarCargoDescargoDocumentoPDF } from '../utils/generarCargoDescargoPDF.js';
import { fmt } from '../utils/format.js';

// Muestra el comprobante de UN documento COMPLETO de Cargo o Descargo (todos los renglones que
// se registraron juntos en una misma gestion, bajo el mismo encabezado_id), agrupados por
// producto -exactamente el mismo agrupamiento que ya usa generarCargoDescargoDocumentoPDF para el
// PDF que se imprime automaticamente al registrar el documento-. Antes, el historial de Reportes
// abria un comprobante distinto (CargoDescargoDetalle) por CADA renglon suelto, asi que una
// gestion de 4 telefonos generaba 4 documentos en vez de 1.
//
// Props:
//   grupo: un elemento de reporte.cargos / reporte.descargos (viene de reportes:cargosDescargos),
//          con { renglones, numeroDocumento, secuencia, motivo, usuario, created_at, totalUsd, ... }
//   tipoDocumento: 'cargo' | 'descargo'
//   onVolver: callback para regresar al listado
export default function CargoDescargoDocumentoDetalle({ grupo, tipoDocumento, onVolver }) {
  const [settings, setSettings] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? '#027a48' : '#b42318';
  const titulo = esCargo ? 'Comprobante de Cargo de Inventario' : 'Comprobante de Descargo de Inventario';
  const prefijo = esCargo ? 'CAR' : 'DES';

  // El numero de documento visible es el numero de folio consecutivo (numero_documento); solo
  // para documentos muy viejos que nunca lo recibieron se usa la secuencia calculada como respaldo.
  const numeroDocumento = grupo.numeroDocumento != null ? grupo.numeroDocumento : grupo.secuencia;

  const primero = grupo.renglones[0] || {};
  const [fechaParte, horaParte] = (grupo.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  // Mismo agrupamiento por producto + tipo (+ costo unitario en cargos) que usa el PDF, para que
  // lo que se ve en pantalla sea identico a lo que se descarga/imprime.
  const gruposProducto = [];
  const indicePorClave = new Map();
  grupo.renglones.forEach((r) => {
    const producto = r.producto_nombre || r.descripcion || '—';
    const tipoProducto = r.tipo || r.producto_tipo || '—';
    const costoUnitario = esCargo ? (r.costo_unitario_usd || 0) : 0;
    const clave = `${producto}\u0001${tipoProducto}\u0001${costoUnitario}`;
    let gp = indicePorClave.get(clave);
    if (!gp) {
      gp = { producto, tipoProducto, costoUnitario, cantidad: 0, total: 0, codigos: [] };
      indicePorClave.set(clave, gp);
      gruposProducto.push(gp);
    }
    gp.cantidad += r.cantidad != null ? r.cantidad : 1;
    gp.total += r.total_usd || (r.costo_unitario_usd || 0) * (r.cantidad || 1);
    if (r.unidad_codigo) gp.codigos.push(r.unidad_codigo);
  });

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarCargoDescargoDocumentoPDF(grupo.encabezadoId || grupo.id, grupo.renglones, tipoDocumento, settings, { numeroDocumento });
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

      <div className="print-area" style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', maxWidth: '760px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', borderBottom: `2px solid ${colorAcento}`, paddingBottom: '0.75rem' }}>
          <div>
            {settings?.nombre_tienda && <h2 style={{ margin: 0 }}>{settings.nombre_tienda}</h2>}
            {settings?.rif_tienda && <p style={{ margin: '0.2rem 0', color: '#555' }}>R.I.F.: {settings.rif_tienda}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: colorAcento }}>{titulo.toUpperCase()}</p>
            <p style={{ margin: '0.2rem 0' }}>
              <strong>N°:</strong> {prefijo}-{String(numeroDocumento).padStart(6, '0')}
            </p>
            <p style={{ margin: '0.1rem 0' }}>
              <strong>Fecha:</strong> {fecha} {horaParte || ''}
            </p>
          </div>
        </div>

        <p style={{ margin: '0 0 0.5rem 0', color: '#555' }}>
          <strong>Realizado por:</strong> {grupo.usuario || primero.usuario || 'No especificado'}
        </p>
        {!esCargo && (grupo.motivo || primero.motivo) && (
          <p style={{ margin: '0 0 1rem 0', color: '#555' }}>
            <strong>Motivo:</strong> {grupo.motivo || primero.motivo}
          </p>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5rem 0 1rem 0' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #333' }}>
              <th style={{ padding: '0.5rem' }}>Producto</th>
              <th>Tipo</th>
              <th>Cant.</th>
              {esCargo && <th>Costo unit.</th>}
              {esCargo && <th>Total</th>}
            </tr>
          </thead>
          <tbody>
            {gruposProducto.map((gp, i) => (
              <React.Fragment key={i}>
                <tr style={{ borderBottom: gp.codigos.length ? 'none' : '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{gp.producto}</td>
                  <td>{gp.tipoProducto}</td>
                  <td>{gp.cantidad}</td>
                  {esCargo && <td>${fmt(gp.costoUnitario)}</td>}
                  {esCargo && <td>${fmt(gp.total)}</td>}
                </tr>
                {gp.codigos.length > 0 && (
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td colSpan={esCargo ? 5 : 3} style={{ padding: '0 0.5rem 0.5rem', fontSize: '0.78rem', color: '#667085', fontStyle: 'italic', background: '#fafbfc' }}>
                      Codigos / IMEI: {[...gp.codigos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join(', ')}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {esCargo ? (
          <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem' }}>
            Total del documento: ${fmt(grupo.totalUsd)}
          </p>
        ) : (
          <p style={{ textAlign: 'right', color: '#98a2b3', fontSize: '0.85rem' }}>
            {grupo.totalRenglones} renglon(es) — {grupo.totalPiezas} pieza(s) dadas de baja
          </p>
        )}

        <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>
          Documento generado por el sistema el {new Date().toLocaleString('es-VE')}.
        </p>
      </div>
    </div>
  );
}
