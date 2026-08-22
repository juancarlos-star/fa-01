import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, fechaParaNombreArchivo, dibujarEncabezadoEmpresa } from './pdfUtils.js';
import { fmt } from './format.js';

// Genera el PDF de UN solo cargo o descargo (documento individual), en el mismo estilo que
// el resto de comprobantes del sistema (encabezado con datos de la tienda + tabla de datos).
export async function generarCargoDescargoPDF(registro, tipoDocumento, settings, opciones = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? [2, 122, 72] : [180, 35, 24];
  const titulo = esCargo ? 'COMPROBANTE DE CARGO DE INVENTARIO' : 'COMPROBANTE DE DESCARGO DE INVENTARIO';
  const prefijo = esCargo ? 'CAR' : 'DES';
  const numeroDocumento = registro.secuencia != null ? registro.secuencia : registro.id;

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

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

// Genera UN solo PDF consolidado para un lote de cargos o descargos (varios codigos de una sola
// vez, ej: un rango completo de SIM cards). En vez de imprimir un documento por cada codigo (lo
// que abriria decenas de dialogos de impresion), se genera un solo comprobante con la lista
// completa de codigos incluidos en el lote.
export async function generarCargoDescargoLotePDF(registros, tipoDocumento, settings, opciones = {}) {
  if (!registros || registros.length === 0) return;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? [2, 122, 72] : [180, 35, 24];
  const titulo = esCargo ? 'COMPROBANTE DE CARGO POR LOTE' : 'COMPROBANTE DE DESCARGO POR LOTE';

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...colorAcento);
  doc.text(titulo, 200, 15, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const primero = registros[0] || {};
  const producto = primero.producto_nombre || primero.descripcion || '—';
  const tipoProducto = primero.tipo || primero.producto_tipo || '—';
  const [fechaParte, horaParte] = (primero.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 21, { align: 'right' });
  doc.text(`Cantidad de codigos: ${registros.length}`, 200, 26, { align: 'right' });

  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Realizado por:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(primero.usuario || 'No especificado', 40, 35);

  let y = 43;
  const filasCabecera = [
    ['Producto', producto],
    ['Tipo', tipoProducto]
  ];
  if (esCargo) {
    filasCabecera.push(['Costo unitario', `$${fmt(primero.costo_unitario_usd)}`]);
    const total = registros.reduce((acc, r) => acc + (r.total_usd || 0), 0);
    filasCabecera.push(['Total del lote', `$${fmt(total)}`]);
  } else {
    filasCabecera.push(['Motivo del descargo', primero.motivo || '—']);
  }

  filasCabecera.forEach(([etiqueta, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${etiqueta}:`, 10, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(valor), 130);
    doc.text(lineas, 65, y);
    y += 6 * Math.max(1, lineas.length);
  });

  y += 3;
  const codigos = registros.map((r) => r.unidad_codigo).filter(Boolean);
  autoTable(doc, {
    startY: y,
    head: [['#', 'Codigo / IMEI']],
    body: codigos.map((c, i) => [String(i + 1), c]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: colorAcento, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 15, halign: 'center' } },
    margin: { left: 10, right: 10 }
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Documento generado por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 285);

  const nombreArchivo = `${esCargo ? 'CAR' : 'DES'}-LOTE-${fechaParaNombreArchivo()}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  }
}

// Genera UN solo PDF consolidado para un DOCUMENTO de cargo o descargo que puede incluir
// varios productos/tipos distintos a la vez (ej: 4 iPhones + 3 SIM cards + 3 estuches en un
// mismo procedimiento). A diferencia de generarCargoDescargoLotePDF (pensado para un solo
// producto repetido muchas veces), aqui cada fila de la tabla muestra tambien a que producto
// corresponde.
export async function generarCargoDescargoDocumentoPDF(encabezadoId, registros, tipoDocumento, settings, opciones = {}) {
  if (!registros || registros.length === 0) return;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? [2, 122, 72] : [180, 35, 24];
  const titulo = esCargo ? 'COMPROBANTE DE CARGO DE INVENTARIO' : 'COMPROBANTE DE DESCARGO DE INVENTARIO';
  const prefijo = esCargo ? 'CAR' : 'DES';

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...colorAcento);
  doc.text(titulo, 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: ${prefijo}-${String(encabezadoId).padStart(5, '0')}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const primero = registros[0] || {};
  const [fechaParte, horaParte] = (primero.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 26, { align: 'right' });

  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Realizado por:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(primero.usuario || 'No especificado', 40, 35);

  let y = 42;
  if (!esCargo && primero.motivo) {
    doc.setFont('helvetica', 'bold');
    doc.text('Motivo:', 10, y);
    doc.setFont('helvetica', 'normal');
    const lineasMotivo = doc.splitTextToSize(String(primero.motivo), 150);
    doc.text(lineasMotivo, 35, y);
    y += 6 * Math.max(1, lineasMotivo.length);
  }
  y += 3;

  const filasTabla = registros.map((r) => {
    const producto = r.producto_nombre || r.descripcion || '—';
    const tipoProducto = r.tipo || r.producto_tipo || '—';
    const codigo = r.unidad_codigo || '—';
    const cantidad = String(r.cantidad ?? 1);
    if (esCargo) {
      return [producto, tipoProducto, codigo, cantidad, `$${fmt(r.costo_unitario_usd)}`, `$${fmt(r.total_usd)}`];
    }
    return [producto, tipoProducto, codigo, cantidad];
  });

  const head = esCargo
    ? [['Producto', 'Tipo', 'Codigo / IMEI', 'Cant.', 'Costo unit.', 'Total']]
    : [['Producto', 'Tipo', 'Codigo / IMEI', 'Cant.']];

  autoTable(doc, {
    startY: y,
    head,
    body: filasTabla,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: colorAcento, textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 10, right: 10 }
  });

  if (esCargo) {
    const total = registros.reduce((acc, r) => acc + (r.total_usd || 0), 0);
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Total del documento: $${fmt(total)}`, 200, finalY, { align: 'right' });
  }

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Documento generado por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 285);

  const nombreArchivo = `${prefijo}-${String(encabezadoId).padStart(5, '0')}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Cargos y Descargos');
  }
}
