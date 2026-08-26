import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, dibujarEncabezadoEmpresa, dibujarPiePaginaEmpresa } from './pdfUtils.js';
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

  // Logo + nombre + RIF + direccion + telefono de LA TIENDA (no del proveedor), arriba a la
  // izquierda. El bloque de datos del PROVEEDOR se corre hacia abajo dinamicamente segun
  // cuanto espacio ocupe esto.
  const yEncabezadoEmpresa = dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });
  const yProveedor = Math.max(35, yEncabezadoEmpresa + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(encabezado.es_devolucion ? 'DEVOLUCIÓN N°' : 'COMPRA N°', 145, 15);
  doc.text('FECHA:', 145, 21);
  doc.text('DOCUMENTO:', 145, 27);
  doc.text('MONEDA:', 145, 33);
  doc.text('TASA DEL DIA:', 145, 39);
  doc.text('VENDEDOR:', 145, 45);

  // El numero mostrado y el del nombre del archivo son distintos segun el tipo de documento:
  // una compra usa su propio id consecutivo, pero una devolucion usa su numero_devolucion
  // (un consecutivo APARTE, exclusivo de las devoluciones, independiente del id interno).
  const numeroMostrado = encabezado.es_devolucion ? encabezado.numero_devolucion : encabezado.id;

  // Todos los valores de este bloque quedan alineados en la misma columna (x=182), con
  // suficiente separacion del titulo mas largo ("DOCUMENTO:"), para que no queden pegados
  // como "DOCUMENTO765436879".
  const xValor = 182;
  doc.setFont('helvetica', 'normal');
  doc.text(String(numeroMostrado).padStart(6, '0'), xValor, 15);
  const [fechaParte, horaParte] = (encabezado.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.text(`${fecha}${horaParte ? '  ' + horaParte : ''}`, xValor, 21);
  doc.text(encabezado.numero_factura_compra || '-', xValor, 27);
  const monedaTexto = encabezado.moneda === 'Dolares' ? 'Dólares' : encabezado.moneda === 'Mixta' ? 'Mixta ($ y Bs.)' : 'Bs.';
  doc.text(monedaTexto, xValor, 33);
  doc.text(encabezado.tasa_cambio ? `${fmt(encabezado.tasa_cambio)} Bs/USD` : '-', xValor, 39);
  doc.text(encabezado.usuario || '-', xValor, 45);

  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR:', 10, yProveedor);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor || '-', 45, yProveedor);

  doc.setFont('helvetica', 'bold');
  doc.text('RIF:', 10, yProveedor + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor_rif || '-', 45, yProveedor + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('TELÉFONO:', 10, yProveedor + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(encabezado.proveedor_telefono || '-', 45, yProveedor + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('DIRECCIÓN:', 10, yProveedor + 18);
  doc.setFont('helvetica', 'normal');
  const direccion = encabezado.proveedor_direccion || '-';
  const lineasDireccion = doc.splitTextToSize(direccion, 140);
  doc.text(lineasDireccion, 45, yProveedor + 18);

  const yTabla = Math.max(62, yProveedor + 18 + 5 * lineasDireccion.length + 6);

  // Cada item ya trae sus codigos/IMEI (cuando aplica) desde compras:detalleEncabezado, asi
  // que se listan debajo de la descripcion dentro de la misma celda, igual que en la factura
  // de venta. Este mismo generador de PDF lo usan tanto "Compras" (SimCard/USIM, que se
  // compran en Bs.) como "Compras Telf/Acces" (Equipos/Accesorios, en dolares), asi que el
  // equivalente en Bs. debajo del costo/total en $ SOLO se agrega cuando la compra de verdad
  // se hizo en Bs. (o mixta) -si no, mostrar "Bs. 0,00" en una compra que es 100% en dolares
  // no tendria sentido y confundiria mas de lo que ayuda.
  const esEnBs = encabezado.moneda === 'Bs' || encabezado.moneda === 'Mixta';
  const tasaCambio = esEnBs ? (parseFloat(encabezado.tasa_cambio) || 0) : 0;
  const filas = items.map((i) => [
    String(i.cantidad),
    Array.isArray(i.codigos) && i.codigos.length > 0 ? `${i.descripcion}\n${i.codigos.join('\n')}` : i.descripcion,
    tasaCambio ? `$${fmt(i.costo_unitario_usd)}\nBs. ${fmt(i.costo_unitario_usd * tasaCambio)}` : `$${fmt(i.costo_unitario_usd)}`,
    tasaCambio ? `$${fmt(i.total_usd)}\nBs. ${fmt(i.total_usd * tasaCambio)}` : `$${fmt(i.total_usd)}`
  ]);

  autoTable(doc, {
    startY: yTabla,
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

  let y = doc.lastAutoTable.finalY + 10;
  if (y > 210) { doc.addPage(); y = 20; }

  const baseImponible = encabezado.total_usd;
  const iva = baseImponible * ivaTasa;
  const total = baseImponible + iva;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('BASE IMPONIBLE:', 130, y);
  doc.text(`I.V.A (${fmt(ivaTasa * 100, 0)}%):`, 130, y + 10);
  doc.text('TOTAL COMPRA:', 130, y + 22);

  if (tasaCambio) {
    // El monto principal de cada renglon es en Bs. (asi se compraron estos productos), y
    // debajo, mas chico y en gris, su equivalente en $ (el valor que de verdad se usa para
    // costo promedio, inventario y reportes de ganancias). Se deja bastante espacio entre
    // renglones (10/12mm) para que la linea chica de abajo nunca se encime con el siguiente.
    doc.setFont('helvetica', 'normal');
    doc.text(`Bs. ${fmt(baseImponible * tasaCambio)}`, 195, y, { align: 'right' });
    doc.text(`Bs. ${fmt(iva * tasaCambio)}`, 195, y + 10, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Bs. ${fmt(total * tasaCambio)}`, 195, y + 22, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`$${fmt(baseImponible)}`, 195, y + 4, { align: 'right' });
    doc.text(`$${fmt(iva)}`, 195, y + 14, { align: 'right' });
    doc.setFontSize(9);
    doc.text(`$${fmt(total)}`, 195, y + 26, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`(tasa del día usada: ${fmt(tasaCambio)} Bs/USD)`, 130, y + 30);
    doc.setTextColor(0, 0, 0);
  } else {
    // Compra 100% en dolares (Equipos/Accesorios): solo se muestra $, sin ninguna linea de Bs.
    doc.setFont('helvetica', 'normal');
    doc.text(`$${fmt(baseImponible)}`, 195, y, { align: 'right' });
    doc.text(`$${fmt(iva)}`, 195, y + 10, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`$${fmt(total)}`, 195, y + 22, { align: 'right' });
  }

  dibujarPiePaginaEmpresa(doc, settings);

  const nombreArchivo = `${encabezado.es_devolucion ? 'Devolucion' : 'Compra'}-${String(numeroMostrado).padStart(6, '0')}`;
  if (opciones.imprimir) {
    await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Compras');
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Compras');
  }
}
