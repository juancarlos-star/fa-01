import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF } from './pdfUtils.js';
import { fmt } from './format.js';

const IVA_TASA_DEFECTO = 0.16;

// PDF de Compra, con el mismo estilo que generarFacturaPDF.js (encabezado a la derecha con
// numero/fecha, bloque de datos a la izquierda -aqui del PROVEEDOR en vez del cliente-, tabla
// agrupada con los codigos/IMEI debajo de la descripcion, y totales al final).
export async function generarCompraFacturaPDF(encabezado, items, settings, opciones = {}) {
  // El IVA se toma de la configuracion de la tienda (igual que en la pantalla de Compras y en
  // la factura de venta), no de un 16% fijo, para que el PDF siempre coincida con lo que se
  // vio en pantalla al registrar la compra.
  const ivaTasa = settings && settings.iva_porcentaje != null ? parseFloat(settings.iva_porcentaje) / 100 : IVA_TASA_DEFECTO;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('COMPRA N°', 145, 15);
  doc.text('FECHA:', 145, 21);
  doc.text('DOCUMENTO:', 145, 27);
  doc.text('MONEDA:', 145, 33);

  doc.setFont('helvetica', 'normal');
  doc.text(String(encabezado.id).padStart(6, '0'), 178, 15);
  const [fechaParte, horaParte] = (encabezado.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.text(`${fecha}${horaParte ? '  ' + horaParte : ''}`, 165, 21);
  doc.text(encabezado.numero_factura_compra || '-', 168, 27);
  doc.text(encabezado.moneda === 'Dolares' ? 'Dólares' : 'Bs.', 168, 33);

  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor || '-', 45, 35);

  doc.setFont('helvetica', 'bold');
  doc.text('RIF:', 10, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor_rif || '-', 45, 41);

  doc.setFont('helvetica', 'bold');
  doc.text('TELÉFONO:', 10, 47);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor_telefono || '-', 45, 47);

  doc.setFont('helvetica', 'bold');
  doc.text('DIRECCIÓN:', 10, 53);
  doc.setFont('helvetica', 'normal');
  const direccion = encabezado.proveedor_direccion || '-';
  const lineasDireccion = doc.splitTextToSize(direccion, 140);
  doc.text(lineasDireccion, 45, 53);

  // Cada item ya trae sus codigos/IMEI (cuando aplica) desde compras:detalleEncabezado, asi
  // que se listan debajo de la descripcion dentro de la misma celda, igual que en la factura
  // de venta.
  const filas = items.map((i) => [
    String(i.cantidad),
    Array.isArray(i.codigos) && i.codigos.length > 0 ? `${i.descripcion}\n${i.codigos.join('\n')}` : i.descripcion,
    fmt(i.costo_unitario_usd),
    fmt(i.total_usd)
  ]);

  autoTable(doc, {
    startY: 62,
    head: [['CANTIDAD', 'DESCRIPCION', 'COSTO U.', 'TOTAL']],
    body: filas,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', valign: 'top' },
      1: { cellWidth: 108, valign: 'top' },
      2: { cellWidth: 32, halign: 'right', valign: 'top' },
      3: { cellWidth: 32, halign: 'right', valign: 'top' }
    },
    margin: { left: 10, right: 10 }
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (y > 260) { doc.addPage(); y = 15; }

  const baseImponible = encabezado.total_usd;
  const iva = baseImponible * ivaTasa;
  const total = baseImponible + iva;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('BASE IMPONIBLE:', 130, y);
  doc.text(`I.V.A (${fmt(ivaTasa * 100, 0)}%):`, 130, y + 5);
  doc.text('TOTAL COMPRA:', 130, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.text(fmt(baseImponible), 195, y, { align: 'right' });
  doc.text(fmt(iva), 195, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fmt(total), 195, y + 10, { align: 'right' });

  const nombreArchivo = `Compra-${String(encabezado.id).padStart(6, '0')}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Compras');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Compras');
  }
}
