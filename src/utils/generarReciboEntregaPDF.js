import { jsPDF } from 'jspdf';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF, fechaParaNombreArchivo, dibujarEncabezadoEmpresa } from './pdfUtils.js';

const ETIQUETA_TIPO = { reparacion: 'REPARACIÓN', garantia: 'GARANTÍA' };
const PREFIJO_TIPO = { reparacion: 'REP', garantia: 'GAR' };

const ETIQUETA_RESOLUCION = {
  reparado: 'Reparado — se entrega el mismo equipo ya arreglado',
  reemplazado: 'Reemplazado — se entrega un equipo nuevo del inventario',
  rechazado: 'Rechazado / sin arreglo — se devuelve el equipo tal cual se recibió'
};

function formatearFecha(fechaHora) {
  if (!fechaHora) return '—';
  const [fechaParte, horaParte] = fechaHora.split(' ');
  const fecha = (fechaParte || '').split('-').reverse().join('/');
  return `${fecha}${horaParte ? '  ' + horaParte : ''}`;
}

// Genera el "Recibo de Entrega" de un caso de Garantía/Reparación ya cerrado (estado
// 'entregado'): deja constancia por escrito de como quedo resuelto el caso y que equipo se le
// entrego de vuelta al cliente (el mismo ya reparado, o uno de reemplazo si fue garantia). Se
// imprime automaticamente al cerrar el caso (ver Reparaciones.jsx), y tambien se puede volver
// a imprimir despues desde el detalle del caso, igual que el Recibo de Abono de Apartados.
export async function generarReciboEntregaPDF(reparacion, product, unit, unitReemplazo, settings, opciones = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const colorAcento = [11, 87, 163]; // azul: comprobante de entrega/servicio, no de dinero

  dibujarEncabezadoEmpresa(doc, settings, { x: 10, y: 15, maxWidth: 88 });

  const etiquetaTipo = ETIQUETA_TIPO[reparacion.tipo] || reparacion.tipo.toUpperCase();
  const numeroFormateado = `${PREFIJO_TIPO[reparacion.tipo] || 'CASO'}-${String(reparacion.numero).padStart(6, '0')}`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...colorAcento);
  doc.text(`RECIBO DE ENTREGA — ${etiquetaTipo}`, 200, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: ${numeroFormateado}`, 200, 21, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha de entrega: ${formatearFecha(reparacion.entregado_at)}`, 200, 26, { align: 'right' });

  doc.setDrawColor(...colorAcento);
  doc.setLineWidth(0.6);
  doc.line(10, 29, 200, 29);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Cliente:', 10, 37);
  doc.setFont('helvetica', 'normal');
  doc.text(reparacion.cliente_nombre || '—', 32, 37);
  if (reparacion.cliente_telefono) {
    doc.setFont('helvetica', 'bold');
    doc.text('Teléfono:', 120, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(reparacion.cliente_telefono, 145, 37);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Equipo:', 10, 44);
  doc.setFont('helvetica', 'normal');
  doc.text(`${product?.nombre || '—'}  (${unit?.codigo || '—'})`, 32, 44);

  doc.setFont('helvetica', 'bold');
  doc.text('Recibido el:', 10, 51);
  doc.setFont('helvetica', 'normal');
  doc.text(formatearFecha(reparacion.created_at), 38, 51);
  doc.setFont('helvetica', 'bold');
  doc.text('Entregado por:', 120, 51);
  doc.setFont('helvetica', 'normal');
  doc.text(reparacion.usuario_entrego || 'No especificado', 152, 51);

  doc.setFont('helvetica', 'bold');
  doc.text('Falla reportada:', 10, 60);
  doc.setFont('helvetica', 'normal');
  const fallaLineas = doc.splitTextToSize(reparacion.falla_reportada || '—', 180);
  doc.text(fallaLineas, 10, 66);
  let y = 66 + fallaLineas.length * 5 + 3;

  if (reparacion.diagnostico) {
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnóstico:', 10, y);
    doc.setFont('helvetica', 'normal');
    const diagLineas = doc.splitTextToSize(reparacion.diagnostico, 180);
    doc.text(diagLineas, 10, y + 6);
    y += 6 + diagLineas.length * 5 + 3;
  }

  y += 4;
  doc.setFillColor(...colorAcento);
  doc.rect(10, y - 5, 190, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`RESOLUCIÓN: ${ETIQUETA_RESOLUCION[reparacion.resolucion] || reparacion.resolucion || '—'}`, 13, y + 1);
  doc.setTextColor(0, 0, 0);
  y += 12;

  if (reparacion.resolucion === 'reemplazado' && unitReemplazo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Equipo de reemplazo entregado: ${unitReemplazo.codigo}`, 10, y);
    y += 8;
  }

  y += 14;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(15, y, 95, y);
  doc.line(115, y, 195, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Firma de conformidad del cliente', 15, y + 5);
  doc.text('Entregado por', 115, y + 5);

  const nombreArchivo = `Recibo_Entrega_${numeroFormateado}_${fechaParaNombreArchivo()}`;
  if (opciones.imprimir) {
    const res = await guardarAbrirEImprimirPDF(doc, nombreArchivo, 'Garantias y Reparaciones');
    if (res.ok && res.impreso === false && res.path) {
      window.api.verPdfConVisorExterno(res.path);
    }
  } else {
    await guardarYAbrirPDF(doc, nombreArchivo, 'Garantias y Reparaciones');
  }
}
