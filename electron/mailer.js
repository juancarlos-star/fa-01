// Cliente SMTP minimo, escrito a mano con el modulo "tls" que ya trae Node.js, para no tener
// que agregar una libreria externa (nodemailer) al proyecto -evitando que haya que correr
// "npm install" despues de cada entrega de codigo. Solo soporta TLS implicito (el puerto 465,
// que es justo el que usa Gmail) y autenticacion AUTH LOGIN, que es lo que hace falta para el
// caso pedido (enviar el resumen diario + respaldo desde una cuenta de Gmail con "contrasena de
// aplicacion"). No es un cliente SMTP completo ni sirve para todos los proveedores de correo
// (por ejemplo, no soporta STARTTLS/puerto 587, que usan Outlook/Hotmail).
const tls = require('tls');

// Lee la respuesta del servidor SMTP hasta encontrar una linea "final" (las respuestas de
// varias lineas usan un guion despues del codigo, ej. "250-...", y la ultima linea del bloque
// usa un espacio en vez de guion, ej. "250 ..."). Devuelve el codigo numerico y el texto crudo.
function leerRespuesta(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lineas = buffer.split('\r\n').filter(Boolean);
      const ultima = lineas[lineas.length - 1];
      // Una respuesta esta completa cuando la ultima linea tiene el patron "NNN " (con espacio,
      // no guion) despues del codigo de 3 digitos.
      if (ultima && /^\d{3} /.test(ultima)) {
        socket.removeListener('data', onData);
        const codigo = parseInt(ultima.slice(0, 3), 10);
        resolve({ codigo, texto: buffer });
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

function enviarComando(socket, comando) {
  return new Promise((resolve, reject) => {
    socket.write(comando + '\r\n', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function comandoYRespuesta(socket, comando) {
  await enviarComando(socket, comando);
  return leerRespuesta(socket);
}

// Codifica el texto del asunto para que los acentos/eñes no se rompan en el cliente de correo
// del destinatario (formato estandar "encoded-word" de MIME).
function codificarAsunto(asunto) {
  return `=?UTF-8?B?${Buffer.from(asunto, 'utf8').toString('base64')}?=`;
}

// Corta un string base64 largo en lineas de 76 caracteres, como pide el estandar MIME.
function envolverBase64(base64) {
  return base64.match(/.{1,76}/g).join('\r\n');
}

// Arma el correo en formato MIME: un cuerpo de texto plano y, si se indican, uno o varios
// archivos adjuntos, cada uno como su propia parte separada por un "boundary" (delimitador)
// unico compartido por todo el mensaje.
function construirMensajeMime({ remitente, destino, asunto, textoBody, adjuntos }) {
  const boundary = `----MoviSync${Date.now()}`;
  const partes = [];
  partes.push(`From: ${remitente}`);
  partes.push(`To: ${destino}`);
  partes.push(`Subject: ${codificarAsunto(asunto)}`);
  partes.push('MIME-Version: 1.0');
  partes.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  partes.push('');
  partes.push(`--${boundary}`);
  partes.push('Content-Type: text/plain; charset="utf-8"');
  partes.push('Content-Transfer-Encoding: base64');
  partes.push('');
  partes.push(envolverBase64(Buffer.from(textoBody, 'utf8').toString('base64')));

  (adjuntos || []).forEach((adjunto) => {
    partes.push('');
    partes.push(`--${boundary}`);
    partes.push(`Content-Type: application/octet-stream; name="${adjunto.nombre}"`);
    partes.push('Content-Transfer-Encoding: base64');
    partes.push(`Content-Disposition: attachment; filename="${adjunto.nombre}"`);
    partes.push('');
    partes.push(envolverBase64(adjunto.buffer.toString('base64')));
  });

  partes.push('');
  partes.push(`--${boundary}--`);
  partes.push('');
  return partes.join('\r\n');
}

// Envia un correo con (opcionalmente) uno o varios archivos adjuntos, usando SMTP con TLS
// implicito (puerto 465 de Gmail). Lanza un error con un mensaje entendible si algo falla en
// cualquier paso de la conversacion SMTP (conexion, login, envio), para que quien llama pueda
// mostrarlo tal cual al usuario.
//
// "adjuntos" acepta un array de { nombre, buffer }. Por compatibilidad con el codigo que ya
// llamaba a esta funcion con un unico "adjunto" (singular), tambien se acepta ese nombre viejo
// y se convierte solo internamente a la nueva forma de array.
async function enviarCorreoConAdjunto({ host, port, usuario, password, remitente, destino, asunto, textoBody, adjunto, adjuntos }) {
  const listaAdjuntos = adjuntos || (adjunto ? [adjunto] : []);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: port || 465, rejectUnauthorized: true }, async () => {
      try {
        let r = await leerRespuesta(socket); // saludo inicial (220)
        if (r.codigo !== 220) throw new Error('El servidor de correo no respondio como se esperaba al conectar.');

        r = await comandoYRespuesta(socket, `EHLO localhost`);
        if (r.codigo !== 250) throw new Error('El servidor de correo rechazo el saludo EHLO.');

        r = await comandoYRespuesta(socket, 'AUTH LOGIN');
        if (r.codigo !== 334) throw new Error('El servidor no ofrece autenticacion AUTH LOGIN.');

        r = await comandoYRespuesta(socket, Buffer.from(usuario, 'utf8').toString('base64'));
        if (r.codigo !== 334) throw new Error('El correo remitente no fue aceptado.');

        r = await comandoYRespuesta(socket, Buffer.from(password, 'utf8').toString('base64'));
        if (r.codigo !== 235) throw new Error('No se pudo iniciar sesion: revisa que la contraseña sea una "contraseña de aplicación" de Gmail (no la contraseña normal de la cuenta).');

        r = await comandoYRespuesta(socket, `MAIL FROM:<${remitente}>`);
        if (r.codigo !== 250) throw new Error('El servidor rechazo el remitente.');

        r = await comandoYRespuesta(socket, `RCPT TO:<${destino}>`);
        if (r.codigo !== 250 && r.codigo !== 251) throw new Error('El servidor rechazo el destinatario. Revisa que el correo de destino este bien escrito.');

        r = await comandoYRespuesta(socket, 'DATA');
        if (r.codigo !== 354) throw new Error('El servidor no acepto empezar a recibir el mensaje.');

        const mensaje = construirMensajeMime({ remitente, destino, asunto, textoBody, adjuntos: listaAdjuntos });
        r = await comandoYRespuesta(socket, mensaje + '\r\n.');
        if (r.codigo !== 250) throw new Error('El servidor no confirmo la recepcion del correo.');

        await enviarComando(socket, 'QUIT');
        socket.end();
        resolve();
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
    socket.once('error', (err) => reject(new Error('No se pudo conectar al servidor de correo: ' + err.message)));
  });
}

module.exports = { enviarCorreoConAdjunto };
