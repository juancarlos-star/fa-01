// ---------------------------------------------------------------------------------------
// Generadores de PDF "de fondo": version en CommonJS (require, no import) pensada para
// correr en el proceso principal de Electron, SIN React ni navegador (nada de window,
// document, btoa, etc.), porque el correo automatico se arma al cerrar el programa, en un
// momento en el que ya no hay ninguna ventana ni proceso de renderizado activo.
//
// El diseno visual de cada PDF (Factura/Nota de Venta, Compra, Cargo/Descargo) es el MISMO
// que ya usan src/utils/generarFacturaPDF.js, generarCompraFacturaPDF.js y
// generarCargoDescargoPDF.js -- se porto la logica de dibujo tal cual, para que un PDF
// generado por el cierre automatico se vea identico al que se imprime a mano desde la
// pantalla. No se toco ninguno de esos archivos originales: siguen siendo los que usan las
// pantallas de React, este archivo es una copia paralela pensada para Node puro.
//
// Cada funcion "generarPDF...Fondo" devuelve directamente un Buffer (no abre dialogos, no
// guarda en disco, no imprime) para poder usarse como adjunto de correo.
// ---------------------------------------------------------------------------------------

const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;

// ---- Formato numerico (copia de src/utils/format.js) ----
function fmt(valor, decimales = 2) {
  const num = Number(valor);
  if (Number.isNaN(num)) {
    return (0).toLocaleString('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }
  return num.toLocaleString('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

// ---- Agrupar items de factura por producto (copia de src/utils/agruparFacturaItems.js) ----
function agruparItemsPorProducto(items) {
  const grupos = [];
  const indicePorProducto = new Map();
  for (const item of items || []) {
    const key = item.product_id;
    let grupo = indicePorProducto.get(key);
    if (!grupo) {
      grupo = {
        product_id: item.product_id,
        descripcion: item.descripcion,
        precio_unitario: item.precio_unitario_usd ?? item.precio_unitario ?? 0,
        cantidad: 0,
        codigos: [],
        subtotal: 0
      };
      indicePorProducto.set(key, grupo);
      grupos.push(grupo);
    }
    const cantidadItem = item.cantidad || 0;
    grupo.cantidad += cantidadItem;
    const subtotalItem = item.subtotal_usd ?? cantidadItem * (item.precio_unitario_usd ?? item.precio_unitario ?? 0);
    grupo.subtotal += subtotalItem;
    if (item.codigo) grupo.codigos.push(item.codigo);
  }
  return grupos;
}

// ---- Encabezado/pie con datos de la empresa (copia de src/utils/pdfUtils.js) ----
function dibujarEncabezadoEmpresa(doc, settings, opciones = {}) {
  const x = opciones.x ?? 10;
  const yInicial = opciones.y ?? 15;
  const maxWidth = opciones.maxWidth ?? 90;
  let xTexto = x;

  if (settings && settings.logo_base64) {
    try {
      const formato = settings.logo_base64.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(settings.logo_base64, formato, x, yInicial - 9, 16, 16);
      xTexto = x + 20;
    } catch (err) {
      xTexto = x;
    }
  }

  let y = yInicial;
  let huboContenido = false;

  if (settings && settings.nombre_tienda) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(settings.nombre_tienda, xTexto, y);
    y += 4.5;
    huboContenido = true;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (settings && settings.rif_tienda) {
    doc.text(`R.I.F.: ${settings.rif_tienda}`, xTexto, y);
    y += 4;
    huboContenido = true;
  }
  if (settings && settings.direccion_tienda) {
    const lineas = doc.splitTextToSize(settings.direccion_tienda, maxWidth);
    doc.text(lineas, xTexto, y);
    y += 4 * lineas.length;
    huboContenido = true;
  }
  if (settings && settings.telefono_tienda) {
    doc.text(`Tel: ${settings.telefono_tienda}`, xTexto, y);
    y += 4;
    huboContenido = true;
  }

  return huboContenido ? y : yInicial;
}

function dibujarPiePaginaEmpresa(doc, settings, opciones = {}) {
  if (!settings || !settings.pie_pagina_pdf) return;
  const alturaPagina = doc.internal.pageSize.getHeight();
  const y = opciones.y ?? (alturaPagina - 12);
  const x = opciones.x ?? 10;
  const maxWidth = opciones.maxWidth ?? 190;

  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x, y - 4, x + maxWidth, y - 4);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(110);
  const lineas = doc.splitTextToSize(settings.pie_pagina_pdf, maxWidth);
  doc.text(lineas, x, y);
  doc.setTextColor(0, 0, 0);
}

function docABuffer(doc) {
  return Buffer.from(doc.output('arraybuffer'));
}

// =========================================================================================
// FACTURA / NOTA DE VENTA -- mismo layout que src/utils/generarFacturaPDF.js
// =========================================================================================
function generarPDFFacturaFondo(factura, items, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });

  const yEncabezadoEmpresa = dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });
  const yCliente = Math.max(35, yEncabezadoEmpresa + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(factura.es_nota_venta ? 'NOTA DE VENTA N°' : 'FACTURA N°', 145, 15);
  doc.text('FECHA:', 145, 21);

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
  if (finalY > 245) { doc.addPage(); finalY = 20; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL NETO:', 130, finalY);
  doc.text('BASE IMPONIBLE:', 130, finalY + 5);
  doc.text(`I.V.A ${fmt(factura.iva_porcentaje)}%:`, 130, finalY + 10);
  doc.text(`TOTAL ${factura.es_nota_venta ? 'NOTA' : 'FACTURA'} ($):`, 130, finalY + 15);
  doc.text(`TOTAL ${factura.es_nota_venta ? 'NOTA' : 'FACTURA'} (Bs. ${fmt(factura.tasa_cambio)}):`, 130, finalY + 20);

  doc.setFont('helvetica', 'normal');
  doc.text(fmt(factura.subtotal_usd), 195, finalY, { align: 'right' });
  doc.text(fmt(factura.subtotal_usd), 195, finalY + 5, { align: 'right' });
  doc.text(fmt(factura.iva_usd), 195, finalY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(factura.total_usd), 195, finalY + 15, { align: 'right' });
  doc.text(`Bs ${fmt(factura.total_usd * (factura.tasa_cambio || 1))}`, 195, finalY + 20, { align: 'right' });

  dibujarPiePaginaEmpresa(doc, settings);

  const nombreArchivo = `${factura.es_nota_venta ? 'NotaVenta' : 'Factura'}-${factura.numero_factura || factura.id}.pdf`;
  return { nombre: nombreArchivo, buffer: docABuffer(doc) };
}

// =========================================================================================
// COMPRA / DEVOLUCION DE COMPRA -- mismo layout que src/utils/generarCompraFacturaPDF.js
// =========================================================================================
const IVA_TASA_DEFECTO = 0.16;

function generarPDFCompraFondo(encabezado, items, settings) {
  const ivaTasa = settings && settings.iva_porcentaje != null ? parseFloat(settings.iva_porcentaje) / 100 : IVA_TASA_DEFECTO;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });

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

  const numeroMostrado = encabezado.es_devolucion ? encabezado.numero_devolucion : encabezado.id;

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

  const esEnBs = encabezado.moneda === 'Bs' || encabezado.moneda === 'Mixta';
  const tasaCambio = esEnBs ? (parseFloat(encabezado.tasa_cambio) || 0) : 0;
  const filas = (items || []).map((i) => [
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
  } else {
    doc.setFont('helvetica', 'normal');
    doc.text(`$${fmt(baseImponible)}`, 195, y, { align: 'right' });
    doc.text(`$${fmt(iva)}`, 195, y + 10, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`$${fmt(total)}`, 195, y + 22, { align: 'right' });
  }

  dibujarPiePaginaEmpresa(doc, settings);

  const nombreArchivo = `${encabezado.es_devolucion ? 'Devolucion' : 'Compra'}-${String(numeroMostrado).padStart(6, '0')}.pdf`;
  return { nombre: nombreArchivo, buffer: docABuffer(doc) };
}

// =========================================================================================
// CARGO / DESCARGO -- mismo layout que generarCargoDescargoDocumentoPDF de
// src/utils/generarCargoDescargoPDF.js (documento consolidado, agrupado por producto)
// =========================================================================================
function generarPDFCargoDescargoFondo(encabezado, registros, settings) {
  const tipoDocumento = encabezado.tipo_documento;
  const numeroDocumento = encabezado.numero_documento != null ? encabezado.numero_documento : encabezado.id;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const esCargo = tipoDocumento === 'cargo';
  const colorAcento = esCargo ? [11, 79, 158] : [180, 35, 24];
  const titulo = esCargo ? 'COMPROBANTE DE CARGO DE INVENTARIO' : 'COMPROBANTE DE DESCARGO DE INVENTARIO';
  const prefijo = esCargo ? 'CAR' : 'DES';

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(colorAcento[0], colorAcento[1], colorAcento[2]);
  doc.text(titulo, 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: ${prefijo}-${String(numeroDocumento).padStart(6, '0')}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const primero = (registros || [])[0] || {};
  const [fechaParte, horaParte] = (primero.created_at || encabezado.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 26, { align: 'right' });

  doc.setDrawColor(colorAcento[0], colorAcento[1], colorAcento[2]);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Realizado por:', 10, 35);
  doc.setFont('helvetica', 'normal');
  doc.text(primero.usuario || encabezado.usuario || 'No especificado', 40, 35);

  let y = 42;
  if (!esCargo && (primero.motivo || encabezado.motivo)) {
    doc.setFont('helvetica', 'bold');
    doc.text('Motivo:', 10, y);
    doc.setFont('helvetica', 'normal');
    const lineasMotivo = doc.splitTextToSize(String(primero.motivo || encabezado.motivo), 150);
    doc.text(lineasMotivo, 35, y);
    y += 6 * Math.max(1, lineasMotivo.length);
  }
  y += 3;

  const grupos = [];
  const indicePorClave = new Map();
  (registros || []).forEach((r) => {
    const producto = r.producto_nombre || r.descripcion || '—';
    const tipoProducto = r.tipo || r.producto_tipo || '—';
    const costoUnitario = esCargo ? (r.costo_unitario_usd || 0) : 0;
    const clave = `${producto}\u0001${tipoProducto}\u0001${costoUnitario}`;
    let grupo = indicePorClave.get(clave);
    if (!grupo) {
      grupo = { producto, tipoProducto, costoUnitario, cantidad: 0, total: 0, codigos: [] };
      indicePorClave.set(clave, grupo);
      grupos.push(grupo);
    }
    grupo.cantidad += r.cantidad != null ? r.cantidad : 1;
    grupo.total += r.total_usd || 0;
    if (r.unidad_codigo) grupo.codigos.push(r.unidad_codigo);
  });

  const numColumnas = esCargo ? 5 : 3;
  const filasTabla = [];
  grupos.forEach((g) => {
    if (esCargo) {
      filasTabla.push([g.producto, g.tipoProducto, String(g.cantidad), `$${fmt(g.costoUnitario)}`, `$${fmt(g.total)}`]);
    } else {
      filasTabla.push([g.producto, g.tipoProducto, String(g.cantidad)]);
    }
    if (g.codigos.length > 0) {
      const codigosOrdenados = [...g.codigos].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      filasTabla.push([
        {
          content: `Codigos / IMEI: ${codigosOrdenados.join(', ')}`,
          colSpan: numColumnas,
          styles: { fontStyle: 'italic', fontSize: 7, textColor: [90, 90, 90], fillColor: [248, 249, 251] }
        }
      ]);
    }
  });

  const head = esCargo ? [['Producto', 'Tipo', 'Cant.', 'Costo unit.', 'Total']] : [['Producto', 'Tipo', 'Cant.']];

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
    const total = (registros || []).reduce((acc, r) => acc + (r.total_usd || 0), 0);
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Total del documento: $${fmt(total)}`, 200, finalY, { align: 'right' });
  }

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Documento generado por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 285);

  const nombreArchivo = `${prefijo}-${String(numeroDocumento).padStart(6, '0')}.pdf`;
  return { nombre: nombreArchivo, buffer: docABuffer(doc) };
}

// =========================================================================================
// GASTO -- comprobante individual nuevo (no existia ninguna version, ni en pantalla)
// =========================================================================================
function generarPDFGastoFondo(gasto, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const colorAcento = [180, 120, 0];

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(colorAcento[0], colorAcento[1], colorAcento[2]);
  doc.text('COMPROBANTE DE GASTO', 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: GAS-${String(gasto.id).padStart(6, '0')}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const [fechaParte, horaParte] = (gasto.created_at || '').split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fecha}${horaParte ? '  ' + horaParte : ''}`, 200, 26, { align: 'right' });

  doc.setDrawColor(colorAcento[0], colorAcento[1], colorAcento[2]);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  const filas = [
    ['Concepto', gasto.concepto || '—'],
    ['Categoría', gasto.categoria || '—'],
    ['Registrado por', gasto.usuario || 'No especificado'],
    ['Monto', `$${fmt(gasto.monto_usd)}`]
  ];

  let y = 40;
  doc.setFontSize(10);
  filas.forEach(([etiqueta, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${etiqueta}:`, 10, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(valor), 140);
    doc.text(lineas, 55, y);
    y += 6 * Math.max(1, lineas.length);
    doc.setDrawColor(230);
    doc.line(10, y - 3, 200, y - 3);
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Documento generado por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 280);

  const nombreArchivo = `Gasto-${String(gasto.id).padStart(6, '0')}.pdf`;
  return { nombre: nombreArchivo, buffer: docABuffer(doc) };
}

// =========================================================================================
// RESUMEN DIARIO DETALLADO -- un solo PDF con 5 secciones (Notas de Venta, Facturas,
// Compras, Cargos/Descargos, Gastos), cada una con TODAS las transacciones del dia, su
// numero de documento y el detalle de lo que incluyo.
//
// "datos" espera: { fecha, notasVenta, facturas, compras, cargosDescargos, gastos }
// donde cada uno de esos 5 es un array ya armado por quien llama (Parte 3), con forma:
//   notasVenta / facturas: [{ numero, hora, cliente, detalle, totalUsd }]
//   compras:               [{ numero, hora, proveedor, detalle, totalUsd }]
//   cargosDescargos:       [{ numero, hora, tipo ('Cargo'/'Descargo'), detalle, totalUsd }]
//   gastos:                [{ numero, hora, concepto, categoria, totalUsd }]
// "detalle" es un string ya armado (ej: "2x Samsung S24, 1x Funda iPhone 15") para que este
// generador no tenga que conocer la forma exacta de cada tipo de item.
// =========================================================================================
function generarPDFResumenDiarioFondo(datos, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const colorAcento = [11, 79, 158];

  const yEmpresa = dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 90 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(colorAcento[0], colorAcento[1], colorAcento[2]);
  doc.text('RESUMEN DIARIO DETALLADO', 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Fecha: ${datos.fecha || new Date().toLocaleDateString('es-VE')}`, 200, 21, { align: 'right' });

  let y = Math.max(32, yEmpresa + 8);

  const secciones = [
    { titulo: 'NOTAS DE VENTA', items: datos.notasVenta || [], cols: ['N°', 'Hora', 'Cliente', 'Detalle', 'Total'], campo: 'cliente' },
    { titulo: 'FACTURAS', items: datos.facturas || [], cols: ['N°', 'Hora', 'Cliente', 'Detalle', 'Total'], campo: 'cliente' },
    { titulo: 'COMPRAS', items: datos.compras || [], cols: ['N°', 'Hora', 'Proveedor', 'Detalle', 'Total'], campo: 'proveedor' },
    { titulo: 'CARGOS Y DESCARGOS', items: datos.cargosDescargos || [], cols: ['N°', 'Hora', 'Tipo', 'Detalle', 'Total'], campo: 'tipo' },
    { titulo: 'GASTOS', items: datos.gastos || [], cols: ['N°', 'Hora', 'Concepto', 'Categoría', 'Total'], campo: 'concepto' }
  ];

  secciones.forEach((seccion) => {
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(colorAcento[0], colorAcento[1], colorAcento[2]);
    doc.text(seccion.titulo, 10, y);
    doc.setTextColor(0, 0, 0);
    y += 2;

    if (seccion.items.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text('Sin movimientos hoy.', 10, y + 5);
      doc.setTextColor(0, 0, 0);
      y += 12;
      return;
    }

    const totalSeccion = seccion.items.reduce((acc, it) => acc + (it.totalUsd || 0), 0);

    const body = seccion.items.map((it) => {
      const columnaTres = seccion.titulo === 'CARGOS Y DESCARGOS' ? it.tipo
        : seccion.titulo === 'GASTOS' ? it.concepto
        : (it[seccion.campo] || '—');
      const columnaCuatro = seccion.titulo === 'GASTOS' ? (it.categoria || '—') : (it.detalle || '—');
      return [
        it.numero || '—',
        it.hora || '—',
        columnaTres,
        columnaCuatro,
        `$${fmt(it.totalUsd)}`
      ];
    });

    autoTable(doc, {
      startY: y + 3,
      head: [seccion.cols],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: colorAcento, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 16 },
        2: { cellWidth: 35 },
        3: { cellWidth: 82 },
        4: { cellWidth: 22, halign: 'right' }
      },
      margin: { left: 10, right: 10 }
    });

    y = doc.lastAutoTable.finalY + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Subtotal ${seccion.titulo.toLowerCase()}: $${fmt(totalSeccion)}  (${seccion.items.length} documento${seccion.items.length === 1 ? '' : 's'})`, 200, y, { align: 'right' });
    y += 12;
  });

  dibujarPiePaginaEmpresa(doc, settings);

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Resumen generado automáticamente por el sistema el ${new Date().toLocaleString('es-VE')}.`, 10, 285);

  const fechaArchivo = (datos.fecha || new Date().toISOString().slice(0, 10)).replace(/\//g, '-');
  return { nombre: `Resumen-${fechaArchivo}.pdf`, buffer: docABuffer(doc) };
}

module.exports = {
  fmt,
  agruparItemsPorProducto,
  dibujarEncabezadoEmpresa,
  dibujarPiePaginaEmpresa,
  generarPDFFacturaFondo,
  generarPDFCompraFondo,
  generarPDFCargoDescargoFondo,
  generarPDFGastoFondo,
  generarPDFResumenDiarioFondo
};
