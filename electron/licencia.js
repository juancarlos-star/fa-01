// Sistema de licencia offline (Opcion 1): cada equipo tiene un "ID de maquina" unico y
// estable, y una clave de activacion solo es valida para el ID exacto con el que se genero.
//
// *** MUY IMPORTANTE ***
// SECRETO_LICENCIA es la base de TODO este sistema: quien lo conozca puede generar claves
// validas para cualquier equipo, sin necesidad tuya. Por eso:
//   1. Cambialo por uno propio, largo y unico, antes de vender la primera licencia real.
//   2. NUNCA subas este archivo a un repositorio PUBLICO de GitHub (si tu repo es publico,
//      pasalo a privado, o saca este archivo del control de versiones).
//   3. El script para generar claves (herramientas-privadas/generar-clave.js) tampoco debe
//      compartirse con nadie ni incluirse en el instalador que le das a tus clientes.
const SECRETO_LICENCIA = 'CAMBIA-ESTE-SECRETO-POR-UNO-PROPIO-BIEN-LARGO-Y-UNICO-ANTES-DE-VENDER';

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Identifica el equipo de forma estable: usa el "MachineGuid" que Windows genera una sola vez
// por instalacion (sobrevive a reinstalar el programa, pero cambia si se reinstala Windows o
// se cambia de PC -eso es justo lo que se busca). Si por algun motivo no se puede leer (permisos,
// u otro sistema operativo), se usa un ID de respaldo generado una vez y guardado en un archivo
// local, para que igual sea siempre el mismo en ese equipo.
function obtenerMachineId(app) {
  try {
    const salida = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
    const match = salida.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
    if (match) return match[1].toUpperCase();
  } catch (err) {
    console.error('No se pudo leer el MachineGuid de Windows, se usa un ID de respaldo:', err.message);
  }
  const rutaRespaldo = path.join(app.getPath('userData'), '.machine-id');
  try {
    if (fs.existsSync(rutaRespaldo)) return fs.readFileSync(rutaRespaldo, 'utf8').trim();
    const idRespaldo = crypto.randomUUID().toUpperCase();
    fs.writeFileSync(rutaRespaldo, idRespaldo);
    return idRespaldo;
  } catch (err) {
    console.error('No se pudo generar/leer el ID de respaldo:', err.message);
    return 'DESCONOCIDO';
  }
}

// A partir del ID del equipo, calcula la UNICA clave de activacion valida para ese equipo
// (usando el secreto privado). El mismo calculo, con el mismo secreto, es lo que se usa en
// herramientas-privadas/generar-clave.js para generarle la clave a un cliente.
function calcularCodigoEsperado(machineId) {
  const hash = crypto.createHmac('sha256', SECRETO_LICENCIA).update(machineId).digest('hex').toUpperCase();
  const bloque = hash.slice(0, 16);
  return bloque.match(/.{1,4}/g).join('-');
}

function verificarCodigo(machineId, codigoIngresado) {
  const esperado = calcularCodigoEsperado(machineId);
  const limpio = (codigoIngresado || '').trim().toUpperCase().replace(/\s+/g, '');
  return limpio === esperado;
}

module.exports = { obtenerMachineId, calcularCodigoEsperado, verificarCodigo };
