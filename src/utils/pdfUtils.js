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

export async function guardarYAbrirPDF(doc, nombreArchivo, subcarpeta) {
  try {
    const arrayBuffer = doc.output('arraybuffer');
    const base64 = arrayBufferToBase64(arrayBuffer);
    const res = await window.api.guardarYAbrirPDF(nombreArchivo, base64, subcarpeta);
    if (!res.ok) {
      alert(res.message || 'No se pudo guardar el PDF');
    }
    return res;
  } catch (err) {
    alert('Error generando el PDF: ' + (err?.message || String(err)));
    return { ok: false };
  }
}

// Igual que guardarYAbrirPDF, pero ademas dispara la impresion automaticamente (sin que el
// usuario tenga que abrir el archivo manualmente y buscar la opcion de imprimir).
export async function guardarAbrirEImprimirPDF(doc, nombreArchivo, subcarpeta) {
  try {
    const arrayBuffer = doc.output('arraybuffer');
    const base64 = arrayBufferToBase64(arrayBuffer);
    const res = await window.api.guardarAbrirEImprimirPDF(nombreArchivo, base64, subcarpeta);
    if (!res.ok) {
      alert(res.message || 'No se pudo guardar el PDF');
    }
    return res;
  } catch (err) {
    alert('Error generando el PDF: ' + (err?.message || String(err)));
    return { ok: false };
  }
}

export function fechaParaNombreArchivo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
