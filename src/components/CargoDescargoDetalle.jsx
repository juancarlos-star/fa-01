import React, { useEffect, useState } from 'react';
import { generarCargoDescargoPDF } from '../utils/generarCargoDescargoPDF.js';
import { fmt } from '../utils/format.js';

// Muestra el comprobante individual de UN solo cargo o descargo de inventario (no un lote),
// con el mismo patron de "documento imprimible" que ya usa CompraFacturaDetalle: un
// print-area con los datos, y botones (fuera del area imprimible via .no-print) para
// Imprimir y Descargar PDF de ese documento puntual.
//
// Props:
//   registro: la fila devuelta por reportes:cargosDescargos (un cargo o un descargo)
//   tipoDocumento: 'cargo' | 'descargo'
//   onVolver: callback para regresar al listado
export default function CargoDescargoDetalle({ registro, tipoDocumento, onVolver }) {
  const [settings, setSettings] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? '#027a48' : '#b42318';
  const titulo = esCargo ? 'Comprobante de Cargo de Inventario' : 'Comprobante de Descargo de Inventario';

  // El numero de documento visible es el numero de secuencia individual (uno por renglon,
  // ya sea un cargo o un descargo), con el mismo formato de folio que se usa en el resto
  // del sistema (relleno con ceros a la izquierda).
  const numeroDocumento = registro.secuencia != null ? registro.secuencia : registro.id;
  const prefijo = esCargo ? 'CAR' : 'DES';

  const [fechaParte, horaParte] = (registro.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  const producto = registro.producto_nombre || registro.descripcion || '—';
  const tipoProducto = registro.tipo || registro.producto_tipo || '—';
  const codigo = registro.unidad_codigo || null;

  const descargarPDF = async () => {
    setGenerandoPDF(true);
    try {
      await generarCargoDescargoPDF(registro, tipoDocumento, settings);
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

      <div className="print-area" style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', maxWidth: '620px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', borderBottom: `2px solid ${colorAcento}`, paddingBottom: '0.75rem' }}>
          <div>
            {settings?.nombre_tienda && <h2 style={{ margin: 0 }}>{settings.nombre_tienda}</h2>}
            {settings?.rif_tienda && <p style={{ margin: '0.2rem 0', color: '#555' }}>R.I.F.: {settings.rif_tienda}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: colorAcento }}>{titulo.toUpperCase()}</p>
            <p style={{ margin: '0.2rem 0' }}>
              <strong>N°:</strong> {prefijo}-{String(numeroDocumento).padStart(5, '0')}
            </p>
            <p style={{ margin: '0.1rem 0' }}>
              <strong>Fecha:</strong> {fecha} {horaParte || ''}
            </p>
          </div>
        </div>

        {/* Usuario que realizo la operacion, siempre visible justo debajo del encabezado,
            igual que "Registrado por" en el comprobante de compras. */}
        <p style={{ margin: '0 0 1rem 0', color: '#555' }}>
          <strong>Realizado por:</strong> {registro.usuario || 'No especificado'}
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0.5rem 0 1rem 0' }}>
          <tbody>
            <FilaDato etiqueta="Producto" valor={producto} />
            <FilaDato etiqueta="Tipo" valor={tipoProducto} />
            <FilaDato etiqueta="Codigo / IMEI" valor={codigo || 'No aplica (sin unidad individual)'} destacado={!!codigo} />
            <FilaDato etiqueta="Cantidad" valor={String(registro.cantidad)} />
            {esCargo ? (
              <>
                <FilaDato etiqueta="Costo unitario" valor={`$${fmt(registro.costo_unitario_usd)}`} />
                <FilaDato etiqueta="Total" valor={`$${fmt(registro.total_usd)}`} destacado />
              </>
            ) : (
              <FilaDato etiqueta="Motivo del descargo" valor={registro.motivo || '—'} />
            )}
          </tbody>
        </table>

        <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>
          Documento generado por el sistema el {new Date().toLocaleString('es-VE')}.
        </p>
      </div>
    </div>
  );
}

function FilaDato({ etiqueta, valor, destacado = false }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', width: '40%', color: '#555' }}>{etiqueta}</td>
      <td style={{ padding: '0.4rem 0', fontWeight: destacado ? 'bold' : 'normal' }}>{valor}</td>
    </tr>
  );
}
