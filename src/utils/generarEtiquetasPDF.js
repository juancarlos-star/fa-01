import { jsPDF } from 'jspdf';
import { guardarYAbrirPDF, guardarAbrirEImprimirPDF } from './pdfUtils.js';
import { fmt } from './format.js';

// ---------------------------------------------------------------------------
// Codigo de barras Code 39 dibujado a mano con rectangulos (doc.rect), sin
// librerias externas. Code 39 es el mas simple de implementar sin dependencia:
// cada caracter tiene un patron FIJO de 9 barras (5 negras + 4 blancas,
// alternadas), donde cada barra es "angosta" (n) o "ancha" (w). Soporta
// A-Z, 0-9 y algunos simbolos; los codigos internos de este sistema son
// alfanumericos en mayusculas, asi que encajan bien. No requiere digito
// verificador para ser leido por la gran mayoria de lectores de pistola.
// ---------------------------------------------------------------------------
const PATRONES_CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
  'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
  'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
  'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnwn', 'N': 'nnnnwnnww',
  'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn',
  'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
  'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn'
};

// Deja solo caracteres que Code 39 soporta (letras, numeros, guion, punto y
// espacio); todo lo demas (por ejemplo minusculas) se convierte a mayuscula o
// se descarta, para que el codigo de barras no quede incompleto/invalido.
function limpiarParaCode39(texto) {
  return String(texto || '')
    .toUpperCase()
    .split('')
    .filter((ch) => PATRONES_CODE39[ch])
    .join('');
}

// Dibuja el codigo de barras dentro del rectangulo (x, y, w, h) indicado.
// anchoAngosto es el grosor en mm de una barra "angosta"; una barra "ancha"
// mide 3 veces eso, como manda el estandar de Code 39.
function dibujarCode39(doc, textoOriginal, x, y, w, h) {
  const contenido = limpiarParaCode39(textoOriginal);
  if (!contenido) return false;
  const conGuardas = `*${contenido}*`;

  // Cada caracter = 9 barras (5n+4w de ancho real: 6 angostas + 3 anchas por
  // caracter en total) + 1 espacio angosto de separacion entre caracteres.
  let unidadesTotales = 0;
  for (const ch of conGuardas) {
    const patron = PATRONES_CODE39[ch];
    for (const barra of patron) unidadesTotales += barra === 'w' ? 3 : 1;
    unidadesTotales += 1; // separador angosto entre caracteres
  }
  unidadesTotales -= 1; // el ultimo caracter no lleva separador despues

  const anchoAngosto = w / unidadesTotales;
  if (anchoAngosto < 0.15) return false; // el codigo no entra legible en el espacio disponible

  doc.setFillColor(0, 0, 0);
  let cursorX = x;
  for (let i = 0; i < conGuardas.length; i++) {
    const patron = PATRONES_CODE39[conGuardas[i]];
    let esBarra = true; // Code 39 siempre empieza en barra (negro)
    for (const modulo of patron) {
      const ancho = (modulo === 'w' ? 3 : 1) * anchoAngosto;
      if (esBarra) doc.rect(cursorX, y, ancho, h, 'F');
      cursorX += ancho;
      esBarra = !esBarra;
    }
    if (i < conGuardas.length - 1) cursorX += anchoAngosto; // separador
  }
  return true;
}

// Corta un texto para que quepa en un ancho maximo (en mm) con el tamano de
// fuente actual, agregando "…" si tuvo que recortarlo.
function truncarAncho(doc, texto, anchoMaximoMm) {
  if (doc.getTextWidth(texto) <= anchoMaximoMm) return texto;
  let recortado = texto;
  while (recortado.length > 1 && doc.getTextWidth(recortado + '…') > anchoMaximoMm) {
    recortado = recortado.slice(0, -1);
  }
  return recortado + '…';
}

// Dibuja UNA etiqueta (nombre + precio + codigo de barras + codigo legible)
// dentro del rectangulo (x, y, w, h) dado, en milimetros.
function dibujarEtiqueta(doc, etiqueta, x, y, w, h, { tasaCambio, mostrarBs }) {
  const margen = 1.2;
  const anchoUtil = w - margen * 2;
  let cursorY = y + margen + 2.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(truncarAncho(doc, etiqueta.nombre, anchoUtil), x + w / 2, cursorY, { align: 'center' });

  cursorY += 4;
  doc.setFontSize(9);
  const precioTexto = `$ ${fmt(etiqueta.precio)}`;
  doc.text(precioTexto, x + w / 2, cursorY, { align: 'center' });
  if (mostrarBs && tasaCambio) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`Bs ${fmt(etiqueta.precio * tasaCambio)}`, x + w / 2, cursorY + 3, { align: 'center' });
    cursorY += 3;
  }

  const altoBarras = Math.max(4, h - (cursorY - y) - margen - 3);
  const anchoBarras = Math.min(anchoUtil, w * 0.9);
  const dibujado = dibujarCode39(doc, etiqueta.codigo, x + (w - anchoBarras) / 2, cursorY + 1.5, anchoBarras, altoBarras);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const yCodigoTexto = y + h - margen - 0.5;
  doc.text(truncarAncho(doc, etiqueta.codigo, anchoUtil), x + w / 2, yCodigoTexto, { align: 'center' });

  if (!dibujado) {
    // Codigo vacio o el espacio quedo demasiado angosto para dibujar barras legibles: se deja
    // solo el texto (arriba) en vez de un codigo de barras ilegible o roto.
  }
}

// Layouts disponibles. 'hojaCarta' imprime varias etiquetas por hoja tamano
// carta (para hojas autoadhesivas tipo A4/Carta cortadas en grilla).
// 'rolloTermico' genera una pagina por etiqueta, del tamano exacto de la
// etiqueta, pensado para impresoras termicas de etiquetas en rollo continuo.
const LAYOUTS = {
  hojaCarta: { columnas: 3, filas: 10, anchoEtiqueta: 66.7, altoEtiqueta: 25.4, margenX: 4.7, margenY: 12.7, separacionX: 2.5, separacionY: 0 },
  rolloTermico: { anchoEtiqueta: 50, altoEtiqueta: 30 }
};

// etiquetas: array de { nombre, precio, codigo } YA expandido (una entrada por
// cada etiqueta fisica a imprimir; si un producto pidio cantidad 5, debe venir
// repetido 5 veces en el array).
export async function generarEtiquetasPDF(etiquetas, { layout = 'hojaCarta', tasaCambio = 0, mostrarBs = true, imprimir = false } = {}) {
  if (!etiquetas || etiquetas.length === 0) return;
  const guardar = imprimir ? guardarAbrirEImprimirPDF : guardarYAbrirPDF;

  if (layout === 'rolloTermico') {
    const { anchoEtiqueta, altoEtiqueta } = LAYOUTS.rolloTermico;
    const doc = new jsPDF({ unit: 'mm', format: [anchoEtiqueta, altoEtiqueta], compress: true });
    etiquetas.forEach((etq, i) => {
      if (i > 0) doc.addPage([anchoEtiqueta, altoEtiqueta]);
      dibujarEtiqueta(doc, etq, 0, 0, anchoEtiqueta, altoEtiqueta, { tasaCambio, mostrarBs });
    });
    await guardar(doc, `etiquetas_${Date.now()}.pdf`, 'Etiquetas');
    return;
  }

  const cfg = LAYOUTS.hojaCarta;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const porPagina = cfg.columnas * cfg.filas;

  etiquetas.forEach((etq, i) => {
    const posicionEnPagina = i % porPagina;
    if (i > 0 && posicionEnPagina === 0) doc.addPage();
    const col = posicionEnPagina % cfg.columnas;
    const fila = Math.floor(posicionEnPagina / cfg.columnas);
    const x = cfg.margenX + col * (cfg.anchoEtiqueta + cfg.separacionX);
    const y = cfg.margenY + fila * (cfg.altoEtiqueta + cfg.separacionY);
    dibujarEtiqueta(doc, etq, x, y, cfg.anchoEtiqueta, cfg.altoEtiqueta, { tasaCambio, mostrarBs });
  });

  await guardar(doc, `etiquetas_${Date.now()}.pdf`, 'Etiquetas');
}
