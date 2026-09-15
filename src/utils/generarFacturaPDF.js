import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, dibujarEncabezadoEmpresa, dibujarPiePaginaEmpresa } from './pdfUtils.js';
import { fmt } from './format.js';
import { agruparItemsPorProducto } from './agruparFacturaItems.js';
import { formatearLineaPago } from './metodosPago.js';

export async function generarFacturaPDF(factura, items, settings, opciones = {}) {
  // compress:true genera un PDF con streams comprimidos (mas chico y con una estructura
  // mas estandar). Junto con la actualizacion de jsPDF/jspdf-autotable a una version mas
  // reciente, esto corrige que la factura se viera "toda negra" al abrirla con Adobe
  // Acrobat (el PDF se veia bien en Chrome/otros lectores, pero Acrobat es mas estricto
  // leyendo la estructura interna que generaban las versiones viejas de jsPDF).
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });

  // Nombre + RIF + direccion + telefono de la tienda, arriba a la izquierda (SIN logo a
  // proposito: el logo configurado en Datos de Tienda ahora se muestra solo en la pantalla de
  // Inicio, no en la Factura/Nota de Venta). El bloque de datos del CLIENTE se corre hacia
  // abajo dinamicamente segun cuanto espacio ocupe esto, para no superponerse si se usan las 4
  // lineas completas.
  const yEncabezadoEmpresa = dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88, sinLogo: true });
  const yCliente = Math.max(35, yEncabezadoEmpresa + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(factura.es_nota_venta ? 'NOTA DE VENTA N°' : 'FACTURA N°', 145, 15);
  doc.text('FECHA:', 145, 21);

  // Todos los valores de este bloque quedan alineados en la misma columna (x=182), con
  // suficiente separacion de la etiqueta mas larga ("NOTA DE VENTA N°"), para que nunca queden
  // pegados como "NOTA DE VENTA N°000002" (el mismo problema que ya se habia resuelto para el
  // encabezado de Compras).
  const xValor = 182;
  doc.setFont('helvetica', 'normal');
  doc.text(factura.numero_factura || String(factura.id).padStart(6, '0'), xValor, 15);
  const fecha = (factura.created_at || '').split(' ')[0].split('-').reverse().join('/');
  doc.text(fecha, xValor, 21);

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
    `$${fmt(g.precio_unitario)}`,
    `$${fmt(g.subtotal)}`
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
  if (finalY > 245) { doc.addPage(); finalY = 20; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL NETO:', 130, finalY);
  doc.text('BASE IMPONIBLE:', 130, finalY + 5);
  doc.text(`I.V.A ${fmt(factura.iva_porcentaje)}%:`, 130, finalY + 10);
  doc.text(`TOTAL ${factura.es_nota_venta ? 'NOTA' : 'FACTURA'} ($):`, 130, finalY + 15);
  doc.text(`TOTAL ${factura.es_nota_venta ? 'NOTA' : 'FACTURA'} (Bs. ${fmt(factura.tasa_cambio)}):`, 130, finalY + 20);

  doc.setFont('helvetica', 'normal');
  doc.text(`$${fmt(factura.subtotal_usd)}`, 195, finalY, { align: 'right' });
  doc.text(`$${fmt(factura.subtotal_usd)}`, 195, finalY + 5, { align: 'right' });
  doc.text(`$${fmt(factura.iva_usd)}`, 195, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(`$${fmt(factura.total_usd)}`, 195, finalY + 15, { align: 'right' });
  // El monto en Bs. es solo una conversion de referencia con la tasa del dia en que se emitio
  // ESTA factura (factura.tasa_cambio, guardada en el momento de facturar) - no con la tasa de
  // hoy, para que una factura vieja impresa de nuevo siga mostrando el monto correcto de su dia.
  doc.text(`Bs ${fmt(factura.total_usd * (factura.tasa_cambio || 1))}`, 195, finalY + 20, { align: 'right' });

  // Desglose de como se cobro (metodo + moneda de cada linea, cubre tambien pagos mixtos).
  // opciones.pagos llega desde facturas:detalle (columna factura_pagos); facturas viejas,
  // emitidas antes de que existiera este desglose, no tendran lineas y este bloque simplemente
  // no se dibuja, sin romper la impresion de esos documentos antiguos.
  const pagos = opciones.pagos || [];
  let yPagos = finalY + 28;
  if (pagos.length > 0) {
    if (yPagos + pagos.length * 5 > 270) { doc.addPage(); yPagos = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FORMA DE PAGO:', 10, yPagos);
    doc.setFont('helvetica', 'normal');
    pagos.forEach((pago, i) => {
      doc.text(formatearLineaPago(pago, fmt), 10, yPagos + 5 + i * 5);
    });
  }

  // Si el cliente pago de mas en efectivo y se le dio vuelto (factura.vuelto_monto,
  // factura.vuelto_moneda -ver PagoModal.jsx y facturas:crear), se deja constancia de cuanto
  // recibio en total y cuanto se le devolvio, en la moneda en que efectivamente se le entrego.
  // factura.tasa_cambio es la del DIA en que se emitio esta factura (no la de hoy), para que
  // una factura vieja reimpresa siga mostrando el monto correcto.
  let yVuelto = yPagos + (pagos.length > 0 ? 5 + pagos.length * 5 + 3 : 0);
  if (factura.vuelto_monto) {
    if (yVuelto + 5 > 270) { doc.addPage(); yVuelto = 20; }
    const vueltoEsUsd = factura.vuelto_moneda === 'USD';
    const vueltoUsdEquiv = vueltoEsUsd ? factura.vuelto_monto : factura.vuelto_monto / (factura.tasa_cambio || 1);
    const recibidoUsd = (factura.total_usd || 0) + vueltoUsdEquiv;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(
      `Recibido: $${fmt(recibidoUsd)}  —  Vuelto entregado: ${vueltoEsUsd ? '$' : 'Bs '}${fmt(factura.vuelto_monto)}`,
      10,
      yVuelto
    );
    doc.setFont('helvetica', 'normal');
  }

  dibujarPiePaginaEmpresa(doc, settings);

  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, `${factura.es_nota_venta ? 'NotaVenta' : 'Factura'}-${factura.numero_factura || factura.id}`, 'Facturas');
  } else {
    await guardarYAbrirPDF(doc, `${factura.es_nota_venta ? 'NotaVenta' : 'Factura'}-${factura.numero_factura || factura.id}`, 'Facturas');
  }
}
