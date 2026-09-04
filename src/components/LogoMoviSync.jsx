import React from 'react';

// Logo real de MoviSync (icono + texto), tal como en la imagen de referencia del negocio.
// Vive como imagen estatica en /public/logo-movisync.png (fondo transparente) para que se use
// exactamente igual en todos los sitios del sistema: sidebar, Login, pantalla de Activacion,
// etc., sin duplicar el archivo.
//
// El logo original esta pensado para fondos claros (azul oscuro/teal sobre blanco). Sobre el
// sidebar, que es azul oscuro, se pierde el contraste -por eso "onDark" lo envuelve en una
// placa blanca redondeada en vez de intentar recolorearlo-.
export default function LogoMoviSync({ height = 40, onDark = false, style = {} }) {
  const imagen = (
    <img
      src="/logo-movisync.png"
      alt="MoviSync"
      style={{ height, display: 'block', ...style }}
    />
  );

  if (!onDark) return imagen;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', borderRadius: '8px', padding: '6px 10px' }}>
      {imagen}
    </div>
  );
}
