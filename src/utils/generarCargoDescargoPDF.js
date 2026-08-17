import { jsPDF } from 'jspdf';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF } from './pdfUtils.js';
import { fmt } from './format.js';

// Genera el PDF de UN solo cargo o descargo (documento individual), en el mismo estilo que
// el resto de comprobantes del sistema (encabezado con datos de la tienda + tabla de datos).
export async function generarCargoDescargoPDF(registro, tipoDocumento, settings, opciones = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? [2, 122, 72] : [180, 35, 24];
  const titulo = esCargo ? 'COMPROBANTE DE CARGO DE INVENTARIO' : 'COMPROBANTE DE DESCARGO DE INVENTARIO';
  const prefijo = esCargo ? 'CAR' : 'DES';
  const numeroDocumento = registro.secuencia != null ? registro.secuencia : registro.id;

  if (settings?.nombre_tienda) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(settings.nombre_tienda, 10, 15);
    if (settings.rif_tienda) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`R.I.F.: ${settings.rif_tienda}`, 10, 20);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...colorAcento);
  doc.text(titulo, 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: ${prefijo}-${String(numeroDocumento).padStart(5, '0')}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const [fechaParte, horaParte] = (registro.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 26, { align: 'right' });

  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  // Usuario que realizo la operacion, siempre visible justo debajo del encabezado.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Realizado por:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(registro.usuario || 'No especificado', 40, 35);

  const producto = registro.producto_nombre || registro.descripcion || '—';
  const tipoProducto = registro.tipo || registro.producto_tipo || '—';
  const codigo = registro.unidad_codigo || 'No aplica (sin unidad individual)';

  const filas = [
    ['Producto', producto],
    ['Tipo', tipoProducto],
    ['Codigo / IMEI', codigo],
    ['Cantidad', String(registro.cantidad)]
  ];

  if (esCargo) {
    filas.push(['Costo unitario', `$${fmt(registro.costo_unitario_usd)}`]);
    filas.push(['Total', `$${fmt(registro.total_usd)}`]);
  } else {
    filas.push(['Motivo del descargo', registro.motivo || '—']);
  }

  let y = 45;
  doc.setFontSize(10);
  filas.forEach(([etiqueta, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${etiqueta}:`, 10, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(valor), 130);
    doc.text(lineas, 65, y);
    y += 6 * Math.max(1, lineas.length);
    doc.setDrawColor(230);
    doc.line(10, y - 3, 200, y - 3);
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Documento generado por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 280);

  const nombreArchivo = `${prefijo}-${String(numeroDocumento).padStart(5, '0')}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  }
}
