import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, fechaParaNombreArchivo, dibujarEncabezadoEmpresa } from './pdfUtils.js';
import { fmt } from './format.js';

// Genera el PDF del "Recibo de Abono" de un Apartado: datos del cliente, producto(s)
// apartado(s), precio de cada uno, el monto abonado en ESTE recibo puntual, la fecha, y el
// saldo que queda pendiente despues de este abono. Se imprime/guarda automaticamente cada vez
// que se registra un abono (ver ApartadoDetalle en Apartados.jsx), igual que la Factura o el
// Cargo/Descargo -- SI lleva el logo de la tienda (a diferencia de la Factura/Nota de Venta,
// que a proposito no lo lleva), porque este es un comprobante interno de la tienda, no la
// factura fiscal final.
export async function generarReciboAbonoPDF(apartado, items, abono, settings, opciones = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const colorAcento = [11, 143, 78]; // verde: comprobante de dinero recibido

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...colorAcento);
  doc.text('RECIBO DE ABONO', 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: REC-${String(abono.numero_recibo).padStart(6, '0')}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const [fechaParte, horaParte] = (abono.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 26, { align: 'right' });

  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Cliente:', 10, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(apartado.cliente_nombre || '—', 32, 36);
  if (apartado.cliente_telefono) {
    doc.setFont('helvetica', 'bold');
    doc.text('Teléfono:', 120, 36);
    doc.setFont('helvetica', 'normal');
    doc.text(apartado.cliente_telefono, 145, 36);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Apartado N°:', 10, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(String(apartado.numero), 38, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Atendido por:', 120, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(abono.usuario || 'No especificado', 150, 42);

  // Tabla de productos apartados (para dejar constancia de que se esta abonando, sin importar
  // que el abono se aplique al total del apartado y no a un producto puntual).
  const filas = items.map((it) => [
    it.descripcion,
    String(it.cantidad),
    `$${fmt(it.precio_unitario_usd)}`,
    `$${fmt(it.cantidad * it.precio_unitario_usd)}`
  ]);

  autoTable(doc, {
    startY: 48,
    head: [['Producto apartado', 'Cant.', 'Precio', 'Subtotal']],
    body: filas,
    theme: 'grid',
    headStyles: { fillColor: colorAcento, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2 },
    margin: { left: 10, right: 10 }
  });

  let y = (doc.lastAutoTable?.finalY || 60) + 8;

  const totalApartado = apartado.total_usd;
  const abonadoAntes = Math.round((apartado.abonado_usd - abono.monto_usd) * 100) / 100;
  const saldoPendiente = Math.round((totalApartado - apartado.abonado_usd) * 100) / 100;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Total del apartado: $${fmt(totalApartado)}`, 130, y);
  y += 6;
  doc.text(`Abonado antes de este recibo: $${fmt(abonadoAntes)}`, 130, y);
  y += 8;

  doc.setFillColor(...colorAcento);
  doc.rect(130, y - 5, 70, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`MONTO ABONADO HOY: $${fmt(abono.monto_usd)}`, 133, y + 1);
  y += 12;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    saldoPendiente > 0.005 ? `Saldo pendiente: $${fmt(saldoPendiente)}` : 'APARTADO PAGADO POR COMPLETO',
    130,
    y
  );
  doc.setTextColor(saldoPendiente > 0.005 ? [180, 35, 24] : [11, 143, 78]);

  const nombreArchivo = `Recibo_Abono_${String(abono.numero_recibo).padStart(6, '0')}_${fechaParaNombreArchivo()}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Apartados');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Apartados');
  }
}
