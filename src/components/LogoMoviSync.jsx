import React from 'react';
import logoUrl from '../assets/logo-movisync.png';
import iconoUrl from '../assets/icono-movisync.png';

// Logo real de MoviSync. Hay dos variantes:
// - Version normal (logo-movisync.png): icono + texto "MOVISYNC TECHNOLOGIES" en azul oscuro,
//   ya pensada para fondos claros/blancos (se usa en el sidebar, reportes impresos, etc.).
// - Version "onDark" (icono-movisync.png + texto propio en blanco/celeste): para fondos
//   oscuros como el panel azul de la pantalla de acceso, donde el texto oscuro de la version
//   normal no se leeria. El icono (las flechas) es el mismo recorte en ambas, solo cambia el
//   texto que lo acompaña.
//
// Ambas imagenes viven en src/assets/ (NO en /public) e importadas como modulo -esto es
// importante: la app corre empaquetada dentro de Electron via "file://", donde una ruta
// absoluta como "/logo.png" apuntaria a la raiz del disco duro, no a la carpeta de la app. Al
// importarlas como modulo, Vite genera la ruta relativa correcta para cualquier contexto.
export default function LogoMoviSync({ height = 40, onDark = false, style = {} }) {
  if (onDark) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.18, ...style }}>
        <img src={iconoUrl} alt="" style={{ height, display: 'block' }} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ fontSize: height * 0.42, fontWeight: 800, letterSpacing: '0.02em' }}>
            <span style={{ color: '#ffffff' }}>MOVI</span>
            <span style={{ color: '#5fd0e3' }}>SYNC</span>
          </span>
          <span style={{ fontSize: height * 0.16, fontWeight: 600, letterSpacing: '0.18em', color: '#c7d9ec', marginTop: height * 0.08 }}>
            TECHNOLOGIES
          </span>
        </div>
      </div>
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
