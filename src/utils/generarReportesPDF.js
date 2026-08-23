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

// ---------------- Inventario: Productos (valorizado) ----------------

const TIPO_LABEL = { equipo: 'Equipo', simcard: 'SIM', usim: 'USIM', accesorio: 'Accesorio' };

export async function generarPDFInventarioProductos(reporte, depositoLabel) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Reporte de Inventario — Productos', 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Deposito: ${depositoLabel}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  doc.setFont('helvetica', 'bold');
  doc.text(
    `Stock total: ${reporte.totales.stock}   —   Valor al costo: $${fmt(reporte.totales.valorCostoUsd)}   —   Valor Total $: $${fmt(reporte.totales.valorTotalUsd)}   —   Tasa del dia: ${fmt(reporte.tasaCambio)} Bs/USD`,
    10,
    32
  );

  autoTable(doc, {
    startY: 38,
    head: [['Tipo', 'Codigo', 'Producto', 'Stock', 'Costo', 'Precio Bs.', 'Precio $.', 'Valor Total $.']],
    body: reporte.productos.map((p) => [
      TIPO_LABEL[p.tipo] || p.tipo,
      p.codigo_producto || '—',
      p.nombre,
      String(p.stock),
      `$${fmt(p.costo_promedio_usd)}`,
      `Bs. ${fmt(p.precioBs)}`,
      `$${fmt(p.precioUsd)}`,
      `$${fmt(p.valorTotalUsd)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Reporte-Inventario-Productos_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Inventario: Fisico (hoja de conteo) ----------------

export async function generarPDFInventarioFisico(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Hoja de Conteo Fisico de Inventario', 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Deposito: ${reporte.deposito.nombre}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  doc.setFont('helvetica', 'bold');
  doc.text('Accesorios (por cantidad)', 10, 33);

  autoTable(doc, {
    startY: 37,
    head: [['Codigo', 'Producto', 'Cant. en sistema', 'Conteo fisico']],
    body: reporte.accesorios.map((a) => [a.codigo_producto || '—', a.nombre, String(a.cantidadSistema), '']),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  const y2 = (doc.lastAutoTable?.finalY || 40) + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Equipos, SIM y USIM (por unidad — IMEI / codigo)', 10, y2);

  autoTable(doc, {
    startY: y2 + 4,
    head: [['Tipo', 'Producto', 'Codigo/IMEI', 'Contado (Si/No)']],
    body: reporte.unidades.map((u) => [TIPO_LABEL[u.tipo] || u.tipo, u.nombre, u.codigo, '']),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Inventario-Fisico_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Vendedores: Efectividad ----------------

const AGRUPACION_LABEL = { dia: 'Diario', mes: 'Mensual', anio: 'Anual' };

export async function generarPDFVendedoresEfectividad(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, `Efectividad de Vendedores — ${AGRUPACION_LABEL[reporte.agrupacion] || ''}`, reporte.desde, reporte.hasta);

  doc.setFont('helvetica', 'bold');
  doc.text(`Total vendido en el periodo: $${fmt(reporte.totalGeneral)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Periodo', 'Vendedor', 'Facturas', 'Total vendido']],
    body: reporte.filas.map((f) => [f.periodo, f.nombreVendedor, String(f.cantidadFacturas), `$${fmt(f.totalUsd)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Vendedores-Efectividad_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Vendedores: Ultimas ventas a clientes ----------------

export async function generarPDFVendedoresUltimasVentas(filas) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Ultimas Ventas a Clientes', 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Clientes con al menos una compra: ${filas.length}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  autoTable(doc, {
    startY: 32,
    head: [['Cliente', 'Cedula/RIF', 'Ultima compra', 'N° factura', 'Total', 'Vendedor']],
    body: filas.map((f) => [
      f.cliente_nombre,
      f.rif_cedula || '—',
      f.created_at,
      f.numero_factura || '—',
      `$${fmt(f.total_usd)}`,
      f.nombreVendedor
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Vendedores-Ultimas-Ventas_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Vendedores: Ventas por categoria ----------------

const TIPO_LABEL_CAT = { equipo: 'Equipo', simcard: 'SIM', usim: 'USIM', accesorio: 'Accesorio' };

export async function generarPDFVendedoresPorCategoria(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Ventas por Categoria de Producto (por Vendedor)', reporte.desde, reporte.hasta);

  autoTable(doc, {
    startY: 34,
    head: [['Vendedor', ...reporte.tipos.map((t) => TIPO_LABEL_CAT[t] || t), 'Total']],
    body: reporte.matriz.map((m) => [
      m.nombreVendedor,
      ...reporte.tipos.map((t) => `$${fmt(m[t].totalUsd)} (${m[t].cantidad})`),
      `$${fmt(m.totalUsd)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Vendedores-Por-Categoria_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Vendedores: Estadisticas ----------------

export async function generarPDFVendedoresEstadisticas(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Estadisticas de Vendedores', reporte.desde, reporte.hasta);

  doc.setFont('helvetica', 'bold');
  doc.text(`Total vendido en el periodo: $${fmt(reporte.totalGeneral)}`, 10, 34);

  autoTable(doc, {
    startY: 40,
    head: [['Vendedor', 'Facturas', 'Total vendido', 'Ticket promedio', 'Participacion']],
    body: reporte.filas.map((f) => [
      f.nombreVendedor,
      String(f.cantidadFacturas),
      `$${fmt(f.totalUsd)}`,
      `$${fmt(f.ticketPromedioUsd)}`,
      `${fmt(f.participacionPct)}%`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Vendedores-Estadisticas_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Ventas: Transacciones ----------------

export async function generarPDFVentasTransacciones(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Transacciones — Resumen Diario', reporte.desde, reporte.hasta);

  doc.setFont('helvetica', 'bold');
  doc.text(
    `Facturas: ${reporte.totales.cantidadFacturas}   —   Total: $${fmt(reporte.totales.totalUsd)} (Bs ${fmt(reporte.totales.totalBs)})`,
    10,
    34
  );

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Facturas', 'Total USD', 'Total Bs']],
    body: reporte.filas.map((f) => [f.fecha, String(f.cantidadFacturas), `$${fmt(f.totalUsd)}`, `Bs ${fmt(f.totalBs)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Ventas-Transacciones_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Ventas: Cierre diario ----------------

export async function generarPDFVentasCierreDiario(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Cierre de Ventas Diario', 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Fecha: ${reporte.fecha}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  doc.setFont('helvetica', 'bold');
  doc.text(
    `Facturas: ${reporte.cantidadFacturas}   —   Unidades vendidas: ${reporte.totalUnidades}   —   Total: $${fmt(reporte.totalUsd)} (Bs ${fmt(reporte.totalBs)})`,
    10,
    32
  );

  autoTable(doc, {
    startY: 38,
    head: [['Producto', 'Tipo', 'Codigo', 'Unidades', 'Total']],
    body: reporte.filas.map((f) => [f.descripcion, TIPO_LABEL[f.tipo] || f.tipo || '—', f.codigo || '—', String(f.unidades), `$${fmt(f.totalUsd)}`]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Cierre-Ventas-Diario_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Ventas: Relacion de ventas ----------------

export async function generarPDFVentasRelacion(reporte) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, `Relación de Ventas — ${AGRUPACION_LABEL[reporte.agrupacion] || ''}`, reporte.desde, reporte.hasta);

  autoTable(doc, {
    startY: 34,
    head: [['Periodo', 'Facturas', 'Subtotal', 'IVA', 'Total USD', 'Total Bs']],
    body: reporte.filas.map((f) => [
      f.periodo,
      String(f.cantidadFacturas),
      `$${fmt(f.subtotalUsd)}`,
      `$${fmt(f.ivaUsd)}`,
      `$${fmt(f.totalUsd)}`,
      `Bs ${fmt(f.totalBs)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Ventas-Relacion_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Ventas: Transacciones por cliente ----------------

export async function generarPDFVentasPorCliente(cliente, facturas) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Transacciones de ${cliente.nombre}`, 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Cedula/RIF: ${cliente.rif_cedula || '—'}   —   Facturas encontradas: ${facturas.length}`, 10, 22);
  doc.setDrawColor(200);
  doc.line(10, 26, 200, 26);

  autoTable(doc, {
    startY: 32,
    head: [['Fecha', 'N° factura', 'Vendedor', 'Total USD', 'Total Bs']],
    body: facturas.map((f) => [
      f.created_at,
      f.numero_factura || String(f.id).padStart(6, '0'),
      f.usuario || '—',
      `$${fmt(f.total_usd)}`,
      `Bs ${fmt(f.total_bs)}`
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Transacciones-Cliente_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Impuestos: Libro de Ventas IVA ----------------

export async function generarPDFLibroVentasIva(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Libro de Ventas IVA', desde, hasta);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Documentos: ${reporte.cantidad}   —   Base: $${fmt(reporte.totalBaseUsd)}   —   IVA: $${fmt(reporte.totalIvaUsd)}   —   Total: $${fmt(reporte.totalGeneralUsd)}`,
    10,
    34
  );

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Documento', 'Cliente', 'RIF/Cédula', 'Base imponible', 'IVA', 'Total']],
    body: reporte.filas.map((f) => [
      f.created_at,
      (f.numero_factura || String(f.id).padStart(6, '0')) + (f.es_devolucion ? ` (N/C dev. ${f.numero_factura_original || ''})` : ''),
      f.cliente_nombre || '—',
      f.cliente_rif || '—',
      `$${fmt(f.subtotal_usd)}`,
      `$${fmt(f.iva_usd)}`,
      `$${fmt(f.total_usd)}`
    ]),
    foot: [['', '', '', 'Totales', `$${fmt(reporte.totalBaseUsd)}`, `$${fmt(reporte.totalIvaUsd)}`, `$${fmt(reporte.totalGeneralUsd)}`]],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Libro-Ventas-IVA_${fechaParaNombreArchivo()}`, 'Reportes');
}

// ---------------- Impuestos: Libro de Compras IVA ----------------

export async function generarPDFLibroComprasIva(reporte, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  encabezado(doc, 'Libro de Compras IVA', desde, hasta);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Documentos: ${reporte.cantidad}   —   Base: $${fmt(reporte.totalBaseUsd)}   —   IVA: $${fmt(reporte.totalIvaUsd)}   —   Total: $${fmt(reporte.totalGeneralUsd)}`,
    10,
    34
  );

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Documento', 'Proveedor', 'RIF', 'Base imponible', 'IVA', 'Total']],
    body: reporte.filas.map((f) => [
      f.created_at,
      f.numero_factura_compra + (f.es_devolucion ? ` (N/C dev. ${f.numero_factura_compra_original || ''})` : ''),
      f.proveedor || '—',
      f.proveedor_rif || '—',
      `$${fmt(f.base_usd)}`,
      `$${fmt(f.iva_usd)} (${fmt(f.iva_porcentaje_usado, 0)}%)`,
      `$${fmt(f.total_con_iva_usd)}`
    ]),
    foot: [['', '', '', 'Totales', `$${fmt(reporte.totalBaseUsd)}`, `$${fmt(reporte.totalIvaUsd)}`, `$${fmt(reporte.totalGeneralUsd)}`]],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [11, 79, 158], textColor: [255, 255, 255] },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
    margin: { left: 10, right: 10 }
  });

  await guardarYAbrirPDF(doc, `Libro-Compras-IVA_${fechaParaNombreArchivo()}`, 'Reportes');
}
