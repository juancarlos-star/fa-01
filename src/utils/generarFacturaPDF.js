import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF } from './pdfUtils.js';

export async function generarFacturaPDF(factura, items) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FACTURA N°', 145, 15);
  doc.text('FECHA:', 145, 21);

  doc.setFont('helvetica', 'normal');
  doc.text(factura.numero_factura || String(factura.id).padStart(6, '0'), 172, 15);
  const fecha = (factura.created_at || '').split(' ')[0].split('-').reverse().join('/');
  doc.text(fecha, 165, 21);

  doc.setTextColor(200, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTADO', 145, 27);
  doc.setTextColor(0, 0, 0);

  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE/RAZON SOCIAL:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(factura.cliente_nombre || 'Consumidor final', 55, 35);

  doc.setFont('helvetica', 'bold');
  doc.text('CEDULA/R.I.F.:', 10, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(factura.cliente_rif || '-', 55, 41);

  doc.setFont('helvetica', 'bold');
  doc.text('DIRECCION:', 10, 47);
  doc.setFont('helvetica', 'normal');
  const direccion = factura.cliente_direccion || '-';
  const lineasDireccion = doc.splitTextToSize(direccion, 140);
  doc.text(lineasDireccion, 55, 47);

  const filas = items.map((i) => [
    String(i.cantidad),
    i.descripcion + (i.codigo ? ` (${i.codigo})` : ''),
    `${i.precio_unitario_usd.toFixed(2)}`,
    `${i.subtotal_usd.toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 58,
    head: [['CANTIDAD', 'DESCRIPCION', 'PRECIO U.', 'TOTAL']],
    body: filas,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 108 },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' }
    },
    margin: { left: 10, right: 10 }
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL NETO:', 130, finalY);
  doc.text('BASE IMPONIBLE:', 130, finalY + 5);
  doc.text(`I.V.A ${factura.iva_porcentaje.toFixed(2)}%:`, 130, finalY + 10);
  doc.text('TOTAL FACTURA:', 130, finalY + 15);

  doc.setFont('helvetica', 'normal');
  doc.text(factura.subtotal_usd.toFixed(2), 195, finalY, { align: 'right' });
  doc.text(factura.subtotal_usd.toFixed(2), 195, finalY + 5, { align: 'right' });
  doc.text(factura.iva_usd.toFixed(2), 195, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(factura.total_usd.toFixed(2), 195, finalY + 15, { align: 'right' });

  await guardarYAbrirPDF(doc, `Factura-${factura.numero_factura || factura.id}`, 'Facturas');
}
