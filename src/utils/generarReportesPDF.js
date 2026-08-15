import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { guardarYAbrirPDF, fechaParaNombreArchivo } from './pdfUtils.js';

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
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  encabezado(doc, 'Reporte de Ventas y Ganancias', desde, hasta);

  doc.setFontSize(10);
  const lineas = [
    ['Facturas emitidas', String(reporte.cantidadFacturas)],
    ['Ventas (sin IVA)', `$${reporte.ventasSubtotalUsd.toFixed(2)}`],
    ['IVA cobrado', `$${reporte.ivaCobradoUsd.toFixed(2)}`],
    ['Costo de lo vendido', `$${reporte.costoVendidoUsd.toFixed(2)}`],
    ['Ganancia bruta', `$${reporte.gananciaBrutaUsd.toFixed(2)}`],
    ['Gastos del periodo', `$${reporte.gastosTotalUsd.toFixed(2)}`],
    ['Ganancia neta', `$${reporte.gananciaNetaUsd.toFixed(2)}`]
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
    body: reporte.gastos.map((g) => [g.created_at, g.concepto, g.categoria || '—', `$${g.monto_usd.toFixed(2)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Ventas-Ganancias_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Compras ----------------

export async function generarPDFCompras(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  encabezado(doc, 'Reporte de Compras', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Compras registradas: ${reporte.cantidad}   —   Total: $${reporte.totalUsd.toFixed(2)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Proveedor', 'N° factura', 'Total']],
    body: reporte.compras.map((c) => [c.created_at, c.proveedor, c.numero_factura_compra, `$${c.total_usd.toFixed(2)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Compras_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Facturas ----------------

export async function generarPDFFacturas(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  encabezado(doc, 'Reporte de Facturas', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Facturas emitidas: ${reporte.cantidad}   —   Total: $${reporte.totalUsd.toFixed(2)} (Bs ${reporte.totalBs.toFixed(2)})`,
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
      `$${f.total_usd.toFixed(2)}`,
      `Bs ${f.total_bs.toFixed(2)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Facturas_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Cargos y descargos de inventario ----------------

export async function generarPDFCargosDescargos(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  encabezado(doc, 'Reporte de Cargos y Descargos de Inventario', desde, hasta);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cargos: ${reporte.cantidadCargos}   —   Total cargado: $${reporte.totalCargosUsd.toFixed(2)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Costo unit.', 'Total', 'Usuario']],
    body: reporte.cargos.map((c) => [
      c.created_at,
      c.producto_nombre || c.descripcion,
      c.tipo,
      String(c.cantidad),
      `$${c.costo_unitario_usd.toFixed(2)}`,
      `$${c.total_usd.toFixed(2)}`,
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
