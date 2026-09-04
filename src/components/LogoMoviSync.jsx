import React from 'react';
import logoUrl from '../assets/logo-movisync.png';
import logoOscuroUrl from '../assets/logo-movisync-nuevo.png';

// Logo real de MoviSync. Hay dos variantes:
// - Version normal (logo-movisync.png): icono + texto "MOVISYNC TECHNOLOGIES" en azul oscuro,
//   sobre fondo transparente -para fondos claros (sidebar antiguo, reportes impresos, etc.).
// - Version "onDark" (logo-movisync-nuevo.png): el logo oficial para fondo azul oscuro (icono +
//   "MOVISYNC" en blanco/celeste + "TECHNOLOGIES"). Es la imagen que nos diste, con su fondo
//   azul solido original quitado (recortado a transparente con Pillow) para que combine con
//   CUALQUIER fondo oscuro donde se use -no solo con el azul exacto original- sin dejar un
//   rectangulo de color distinto alrededor.
export default function LogoMoviSync({ height = 40, onDark = false, style = {} }) {
  if (onDark) {
    return (
      <img
        src={logoOscuroUrl}
        alt="MoviSync"
        style={{ height, width: height * (1739 / 482), display: 'block', objectFit: 'contain', ...style }}
      />
    );
  }

  return (
    <img
      src={logoUrl}
      alt="MoviSync"
      style={{ height, display: 'block', ...style }}
    />
  );
}
