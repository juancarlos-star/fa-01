import React from 'react';

// Logo "MS" + celular. Se parametriza el color para poder usarlo tanto en blanco (sobre el
// fondo azul oscuro del sidebar) como en el azul de marca (sobre el fondo blanco de la
// pantalla de login), sin duplicar el SVG en los dos lugares.
export default function LogoMoviSync({ color = '#fff', size = 30, fontSize = '2.1rem' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>MS</span>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="20" rx="2.2" />
        <line x1="11" y1="18.3" x2="13" y2="18.3" />
      </svg>
    </div>
  );
}
