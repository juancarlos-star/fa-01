// Convierte un documento jsPDF en base64 y le pide al proceso principal de Electron
// que lo guarde en disco (Documentos/Facturacion Movistar/<subcarpeta>) y lo abra
// automaticamente con el visor de PDF por defecto del sistema.

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Aviso flotante NO bloqueante (un div comun dentro de la propia pagina), en vez de alert().
// Los alert()/confirm() nativos de Electron son ventanas del sistema operativo: le quitan el
// foco a la ventana principal, y Electron no avisa cuando se cierran, asi que no hay forma
// confiable de devolver el foco despues -eso era la causa real de que, tras facturar sin
// impresora conectada, el programa dejara de aceptar lo que se escribia en cualquier campo-.
// Este aviso, al ser solo HTML dentro de la misma pagina, nunca toca el foco del sistema.
function mostrarAvisoFlotante(mensaje, tipo = 'info') {
  try {
    const contenedorId = 'movisync-avisos-flotantes';
    let contenedor = document.getElementById(contenedorId);
    if (!contenedor) {
      contenedor = document.createElement('div');
      contenedor.id = contenedorId;
      contenedor.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
      document.body.appendChild(contenedor);
    }
    const aviso = document.createElement('div');
    aviso.textContent = mensaje;
    const colores = tipo === 'error'
      ? { bg: '#fef3f2', border: '#fda29b', texto: '#b42318' }
      : { bg: '#eff8ff', border: '#84caff', texto: '#175cd3' };
    aviso.style.cssText = `background:${colores.bg};color:${colores.texto};border:1px solid ${colores.border};padding:10px 14px;border-radius:8px;font-size:0.85rem;line-height:1.4;box-shadow:0 4px 14px rgba(16,24,40,0.15);`;
    contenedor.appendChild(aviso);
    setTimeout(() => aviso.remove(), 7000);
  } catch (err) {
    console.error(mensaje);
  }
}

export async function guardarYAbrirPDF(doc, nombreArchivo, subcarpeta) {
  try {
    const arrayBuffer = doc.output('arraybuffer');
    const base64 = arrayBufferToBase64(arrayBuffer);
    const res = await window.api.guardarYAbrirPDF(nombreArchivo, base64, subcarpeta);
    if (!res.ok) {
      mostrarAvisoFlotante(res.message || 'No se pudo guardar el PDF', 'error');
    }
    return res;
  } catch (err) {
    mostrarAvisoFlotante('Error generando el PDF: ' + (err?.message || String(err)), 'error');
    return { ok: false };
  }
}

// Igual que guardarYAbrirPDF, pero ademas dispara la impresion automaticamente (sin que el
// usuario tenga que abrir el archivo manualmente y buscar la opcion de imprimir). Si no hay
// ninguna impresora fisica conectada, el proceso principal ya NO abre el Explorador de Windows
// ni intenta imprimir (ver electron/main.js) -solo guarda el archivo en silencio-, y aqui se
// avisa con un mensaje flotante no bloqueante en vez de un alert() nativo.
export async function guardarAbrirEImprimirPDF(doc, nombreArchivo, subcarpeta) {
  try {
    const arrayBuffer = doc.output('arraybuffer');
    const base64 = arrayBufferToBase64(arrayBuffer);
    const res = await window.api.guardarAbrirEImprimirPDF(nombreArchivo, base64, subcarpeta);
    if (!res.ok) {
      mostrarAvisoFlotante(res.message || 'No se pudo guardar el PDF', 'error');
    } else if (res.impreso === false && res.message) {
      mostrarAvisoFlotante(res.message, 'info');
    }
    return res;
  } catch (err) {
    mostrarAvisoFlotante('Error generando el PDF: ' + (err?.message || String(err)), 'error');
    return { ok: false };
  }
}

export function fechaParaNombreArchivo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Dibuja el bloque de identidad de la empresa (logo + nombre + RIF + direccion + telefono) en
// la esquina indicada del documento (por defecto arriba a la izquierda), usando lo que el
// usuario configuro en Configuracion. Es tolerante a datos faltantes: cada linea solo se
// dibuja si el dato existe, y si el logo viene corrupto o en un formato no soportado por
// jsPDF simplemente se omite en vez de romper la generacion de todo el PDF.
// Devuelve el Y final ocupado por el bloque, para que el resto del documento se acomode
// debajo sin superponerse (los documentos existentes tenian posiciones fijas calculadas a
// mano para una tienda SIN logo/direccion/telefono).
export function dibujarEncabezadoEmpresa(doc, settings, opciones = {}) {
  const x = opciones.x ?? 10;
  const yInicial = opciones.y ?? 15;
  const maxWidth = opciones.maxWidth ?? 90;
  let xTexto = x;

  if (settings?.logo_base64) {
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

  if (settings?.nombre_tienda) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(settings.nombre_tienda, xTexto, y);
    y += 4.5;
    huboContenido = true;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (settings?.rif_tienda) {
    doc.text(`R.I.F.: ${settings.rif_tienda}`, xTexto, y);
    y += 4;
    huboContenido = true;
  }
  if (settings?.direccion_tienda) {
    const lineas = doc.splitTextToSize(settings.direccion_tienda, maxWidth);
    doc.text(lineas, xTexto, y);
    y += 4 * lineas.length;
    huboContenido = true;
  }
  if (settings?.telefono_tienda) {
    doc.text(`Tel: ${settings.telefono_tienda}`, xTexto, y);
    y += 4;
    huboContenido = true;
  }

  // Si no habia ningun dato de la empresa configurado, no se ocupo espacio real; se devuelve
  // yInicial tal cual para que el llamador no deje un hueco en blanco de mas.
  return huboContenido ? y : yInicial;
}

// Dibuja el pie de pagina configurable (garantia, terminos, agradecimiento, etc.) cerca del
// fondo de la pagina actual. No hace nada si no hay texto configurado, para no dejar una linea
// vacia en documentos que no lo usan.
export function dibujarPiePaginaEmpresa(doc, settings, opciones = {}) {
  if (!settings?.pie_pagina_pdf) return;
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
