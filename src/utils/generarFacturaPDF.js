import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, dibujarEncabezadoEmpresa, dibujarPiePaginaEmpresa } from './pdfUtils.js';
import { fmt } from './format.js';
import { agruparItemsPorProducto } from './agruparFacturaItems.js';

export async function generarFacturaPDF(factura, items, settings, opciones = {}) {
  // compress:true genera un PDF con streams comprimidos (mas chico y con una estructura
  // mas estandar). Junto con la actualizacion de jsPDF/jspdf-autotable a una version mas
  // reciente, esto corrige que la factura se viera "toda negra" al abrirla con Adobe
  // Acrobat (el PDF se veia bien en Chrome/otros lectores, pero Acrobat es mas estricto
  // leyendo la estructura interna que generaban las versiones viejas de jsPDF).
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });

  // Logo + nombre + RIF + direccion + telefono de la tienda, arriba a la izquierda. Antes esta
  // esquina quedaba vacia (la factura no mostraba ningun dato de la propia tienda). El bloque
  // de datos del CLIENTE se corre hacia abajo dinamicamente segun cuanto espacio ocupe esto,
  // para no superponerse si se usan las 4 lineas completas.
  const yEncabezadoEmpresa = dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });
  const yCliente = Math.max(35, yEncabezadoEmpresa + 6);

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
  doc.text('CLIENTE/RAZON SOCIAL:', 10, yCliente);
  doc.setFont('helvetica', 'normal');
  doc.text(factura.cliente_nombre || 'Consumidor final', 55, yCliente);

  doc.setFont('helvetica', 'bold');
  doc.text('CEDULA/R.I.F.:', 10, yCliente + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(factura.cliente_rif || '-', 55, yCliente + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('DIRECCION:', 10, yCliente + 12);
  doc.setFont('helvetica', 'normal');
  const direccion = factura.cliente_direccion || '-';
  const lineasDireccion = doc.splitTextToSize(direccion, 140);
  doc.text(lineasDireccion, 55, yCliente + 12);

  const yTabla = yCliente + 12 + 5 * lineasDireccion.length + 6;

  // Se agrupan por producto para que, si se vendieron varias unidades del
  // mismo producto (ej. 3 Redmi Note 15), aparezca una sola fila con la
  // cantidad total y los codigos (IMEI/ICCID) listados en columna dentro de
  // la misma celda, sin sobreponerse con el resto de la informacion.
  const grupos = agruparItemsPorProducto(items);
  const filas = grupos.map((g) => [
    String(g.cantidad),
    g.codigos.length > 0 ? `${g.descripcion}\n${g.codigos.join('\n')}` : g.descripcion,
    `${fmt(g.precio_unitario)}`,
    `${fmt(g.subtotal)}`
  ]);

  autoTable(doc, {
    startY: yTabla,
    head: [['CANTIDAD', 'DESCRIPCION', 'PRECIO U.', 'TOTAL']],
    body: filas,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.3, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', valign: 'top' },
      1: { cellWidth: 108, valign: 'top' },
      2: { cellWidth: 32, halign: 'right', valign: 'top' },
      3: { cellWidth: 32, halign: 'right', valign: 'top' }
    },
    margin: { left: 10, right: 10 }
  });

  let finalY = doc.lastAutoTable.finalY + 8;
  if (finalY > 250) { doc.addPage(); finalY = 20; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL NETO:', 130, finalY);
  doc.text('BASE IMPONIBLE:', 130, finalY + 5);
  doc.text(`I.V.A ${fmt(factura.iva_porcentaje)}%:`, 130, finalY + 10);
  doc.text('TOTAL FACTURA:', 130, finalY + 15);

  doc.setFont('helvetica', 'normal');
  doc.text(fmt(factura.subtotal_usd), 195, finalY, { align: 'right' });
  doc.text(fmt(factura.subtotal_usd), 195, finalY + 5, { align: 'right' });
  doc.text(fmt(factura.iva_usd), 195, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(factura.total_usd), 195, finalY + 15, { align: 'right' });

  dibujarPiePaginaEmpresa(doc, settings);

  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, `Factura-${factura.numero_factura || factura.id}`, 'Facturas');
  } else {
    await guardarYAbrirPDF(doc, `Factura-${factura.numero_factura || factura.id}`, 'Facturas');
  }
}
