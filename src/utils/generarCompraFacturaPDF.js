import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF } from './pdfUtils.js';
import { fmt } from './format.js';

const IVA_TASA = 0.16;

export async function generarCompraFacturaPDF(encabezado, items, settings, opciones = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

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
  doc.setFontSize(10);
  doc.text('COMPRA N°', 145, 15);
  doc.text('FECHA:', 145, 21);
  doc.text('N° FACTURA PROVEEDOR:', 145, 27);

  doc.setFont('helvetica', 'normal');
  doc.text(String(encabezado.id), 178, 15);
  const [fechaParte, horaParte] = (encabezado.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.text(`${fecha}${horaParte ? '  ' + horaParte : ''}`, 165, 21);
  doc.text(encabezado.numero_factura_compra || '-', 145, 32);

  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor || '-', 40, 35);

  const filas = items.map((i) => [
    i.descripcion,
    String(i.cantidad),
    `$${fmt(i.costo_unitario_usd)}`,
    `$${fmt(i.total_usd)}`
  ]);

  autoTable(doc, {
    startY: 45,
    head: [['CONCEPTO', 'CANTIDAD', 'PRECIO UNITARIO', 'MONTO TOTAL']],
    body: filas,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 10, right: 10 }
  });

  let y = doc.lastAutoTable.finalY + 6;

  const itemsConCodigos = items.filter((i) => Array.isArray(i.codigos) && i.codigos.length > 0);
  if (itemsConCodigos.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Detalle de IMEI / codigos por producto:', 10, y);
    y += 5;
    itemsConCodigos.forEach((item) => {
      if (y > 260) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.descripcion} (${item.codigos.length}):`, 10, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const texto = item.codigos.join(', ');
      const lineas = doc.splitTextToSize(texto, 190);
      lineas.forEach((linea) => {
        if (y > 275) { doc.addPage(); y = 15; }
        doc.text(linea, 10, y);
        y += 4;
      });
      doc.setFontSize(9);
      y += 2;
    });
  }

  const baseImponible = encabezado.total_usd;
  const iva = baseImponible * IVA_TASA;
  const subtotal = baseImponible + iva;

  if (y > 250) { doc.addPage(); y = 15; }
  y += 4;
  doc.setDrawColor(200);
  doc.line(120, y, 200, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('BASE IMPONIBLE:', 130, y);
  doc.text(`I.V.A (${fmt((IVA_TASA * 100), 0)}%):`, 130, y + 5);
  doc.text('SUBTOTAL:', 130, y + 10);
  doc.text('TOTAL:', 130, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.text(`$${fmt(baseImponible)}`, 195, y, { align: 'right' });
  doc.text(`$${fmt(iva)}`, 195, y + 5, { align: 'right' });
  doc.text(`$${fmt(subtotal)}`, 195, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`$${fmt(subtotal)}`, 195, y + 16, { align: 'right' });

  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, `Compra-${encabezado.id}`, 'Compras');
  } else {
    await guardarYAbrirPDF(doc, `Compra-${encabezado.id}`, 'Compras');
  }
}
