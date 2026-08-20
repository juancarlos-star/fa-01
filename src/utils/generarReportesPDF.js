import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, fechaParaNombreArchivo } from './pdfUtils.js';
import { fmt } from './format.js';

function encabezado(doc, titulo, desde, hasta) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titulo, 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Periodo: ${desde} al ${hasta}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);
}

// ---------------- Ventas y ganancias ----------------

export async function generarPDFGanancias(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Reporte de Ventas y Ganancias', desde, hasta);

  doc.setFontSize(10);
  const lineas = [
    ['Facturas emitidas', String(reporte.cantidadFacturas)],
    ['Ventas (sin IVA)', `$${fmt(reporte.ventasSubtotalUsd)}`],
    ['IVA cobrado', `$${fmt(reporte.ivaCobradoUsd)}`],
    ['Costo de lo vendido', `$${fmt(reporte.costoVendidoUsd)}`],
    ['Ganancia bruta', `$${fmt(reporte.gananciaBrutaUsd)}`],
    ['Gastos del periodo', `$${fmt(reporte.gastosTotalUsd)}`],
    ['Ganancia neta', `$${fmt(reporte.gananciaNetaUsd)}`]
  ];
  let y = 34;
  lineas.forEach(([label, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text(valor, 70, y);
    y += 6;
  });

  autoTable(doc, {
    startY: y + 4,
    head: [['Fecha', 'Concepto', 'Categoria', 'Monto']],
    body: reporte.gastos.map((g) => [g.created_at, g.concepto, g.categoria || '—', `$${fmt(g.monto_usd)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Ventas-Ganancias_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Compras ----------------

export async function generarPDFCompras(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Reporte de Compras', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Compras registradas: ${reporte.cantidad}   —   Total: $${fmt(reporte.totalUsd)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Proveedor', 'N° factura', 'Total']],
    body: reporte.compras.map((c) => [c.created_at, c.proveedor, c.numero_factura_compra, `$${fmt(c.total_usd)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Compras_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Facturas ----------------

export async function generarPDFFacturas(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Reporte de Facturas', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Facturas emitidas: ${reporte.cantidad}   —   Total: $${fmt(reporte.totalUsd)} (Bs ${fmt(reporte.totalBs)})`,
    10,
    34
  );

  autoTable(doc, {
    startY: 40,
    head: [['N°', 'Fecha', 'Cliente', 'Total USD', 'Total Bs']],
    body: reporte.facturas.map((f) => [
      f.numero_factura || String(f.id).padStart(6, '0'),
      f.created_at,
      f.cliente_nombre,
      `$${fmt(f.total_usd)}`,
      `Bs ${fmt(f.total_bs)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Facturas_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Productos vendidos ----------------

export async function generarPDFProductosVendidos(reporte, desde, hasta, tipoLabel) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, `Reporte de Productos Vendidos — ${tipoLabel}`, desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Unidades vendidas: ${reporte.cantidadTotal}   —   Total: $${fmt(reporte.totalUsd)}`,
    10,
    34
  );

  autoTable(doc, {
    startY: 40,
    head: [['Producto', 'Cantidad vendida', 'Total vendido']],
    body: reporte.resumen.map((r) => [r.descripcion, String(r.cantidad), `$${fmt(r.totalUsd)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 40) + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Detalle de ventas', 10, finalY);

  autoTable(doc, {
    startY: finalY + 6,
    head: [['Fecha', 'N° factura', 'Cliente', 'Producto', 'Codigo', 'Cant.', 'Subtotal']],
    body: reporte.items.map((i) => [
      i.fecha,
      i.numero_factura || '—',
      i.cliente_nombre,
      i.descripcion,
      i.codigo || '—',
      String(i.cantidad),
      `$${fmt(i.subtotal_usd)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [2, 122, 72], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Productos-Vendidos_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Cargos y descargos de inventario ----------------

export async function generarPDFCargosDescargos(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Reporte de Cargos y Descargos de Inventario', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cargos: ${reporte.cantidadCargos}   —   Total cargado: $${fmt(reporte.totalCargosUsd)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Costo unit.', 'Total', 'Usuario']],
    body: reporte.cargos.map((c) => [
      c.created_at,
      c.producto_nombre || c.descripcion,
      c.tipo,
      String(c.cantidad),
      `$${fmt(c.costo_unitario_usd)}`,
      `$${fmt(c.total_usd)}`,
      c.usuario || '—'
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [2, 122, 72], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 40) + 10;
  doc.setFont('helvetica', 'bold');
  doc.text(`Descargos: ${reporte.cantidadDescargos}`, 10, finalY);

  autoTable(doc, {
    startY: finalY + 6,
    head: [['N°', 'Fecha', 'Producto', 'Tipo', 'Codigo', 'Cantidad', 'Motivo', 'Usuario']],
    body: reporte.descargos.map((d) => [
      `#${String(d.id).padStart(5, '0')}`,
      d.created_at,
      d.producto_nombre,
      d.producto_tipo,
      d.unidad_codigo || '—',
      String(d.cantidad),
      d.motivo,
      d.usuario || '—'
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [180, 35, 24], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Cargos-Descargos_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Clientes ----------------

export async function generarPDFClientes(clientes) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Reporte de Clientes', 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total de clientes registrados: ${clientes.length}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  autoTable(doc, {
    startY: 32,
    head: [['Nombre', 'Cedula/RIF', 'Telefono', 'Direccion', 'Email', 'Registrado']],
    body: clientes.map((c) => [
      c.nombre,
      c.rif_cedula || '—',
      c.telefono || '—',
      c.direccion || '—',
      c.email || '—',
      c.created_at
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Clientes_${fechaParaNombreArchivo()}`, 'Reportes');
}
