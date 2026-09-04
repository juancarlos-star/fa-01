import React from 'react';
import logoUrl from '../assets/logo-movisync.png';

// Logo real de MoviSync (icono + texto "MOVISYNC TECHNOLOGIES" ya incluido en la imagen). Vive
// en src/assets/ (NO en /public) e importado como modulo -esto es importante y es justo lo que
// arregla el bug del logo roto: antes estaba en /public/logo-movisync.png y se referenciaba con
// <img src="/logo-movisync.png">, una ruta absoluta. Eso funciona bien en un navegador normal
// (donde "/" es la raiz del sitio), pero esta app corre empaquetada dentro de Electron via
// "file://", donde "/" apunta a la raiz del DISCO DURO, no a la carpeta de la app -por eso la
// imagen no cargaba y se veia el icono de imagen rota. Al importarla como modulo, Vite la
// empaqueta y genera automaticamente la ruta relativa correcta para cualquier contexto donde
// se cargue la app (navegador, o file:// dentro de Electron).
//
// La imagen YA trae el texto "MOVISYNC TECHNOLOGIES" dibujado -no hace falta (ni se debe)
// agregar un texto "MoviSync" aparte al lado en ningun lugar donde se use este componente.
export default function LogoMoviSync({ height = 40, onDark = false, style = {} }) {
  const imagen = (
    <img
      src={logoUrl}
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
