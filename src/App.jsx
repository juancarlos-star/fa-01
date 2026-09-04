import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Login from './pages/Login.jsx';
import Activacion from './pages/Activacion.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import CategoriasAdmin from './pages/CategoriasAdmin.jsx';
import CargosDescargos from './pages/CargosDescargos.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Facturacion from './pages/Facturacion.jsx';
import DevolucionFacturas from './pages/DevolucionFacturas.jsx';
import Compras from './pages/Compras.jsx';
import Traslados from './pages/Traslados.jsx';
import ComprasTelfAcces from './pages/ComprasTelfAcces.jsx';
import DevolucionCompras from './pages/DevolucionCompras.jsx';
import Gastos from './pages/Gastos.jsx';
import Reportes from './pages/Reportes.jsx';
import Inicio from './pages/Inicio.jsx';
import LogoMoviSync from './components/LogoMoviSync.jsx';

// Iconos del submenu de Reportes: se usan SVG en linea (en vez de emojis) para que todos
// tengan exactamente el mismo color (heredan "currentColor" del boton), ya que los emojis
// de Compras (🛒) e Impuestos (🧾) se veian con colores distintos a los demas.
const RIcon = {
  Inventario: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
    </svg>
  ),
  Ventas: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Compras: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Impuestos: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <path d="M4 2h13l3 3v17H4z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" />
    </svg>
  ),
  Etiquetas: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L3 3v6.59a2 2 0 0 0 .59 1.41l9.59 9.59a2 2 0 0 0 2.82 0l4.59-4.59a2 2 0 0 0 0-2.82z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  ),
  Vendedores: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -2 }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  )
};

// Iconos del menu principal (un nivel arriba del de Reportes): mismo estilo minimalista de
// linea, mismo grosor y mismo tamano, para que todo el menu lateral se vea consistente.
const MIcon = {
  Inicio: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  Facturar: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M14 2v6h6" /><path d="M8.5 13h7" /><path d="M8.5 17h7" />
    </svg>
  ),
  Inventario: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
    </svg>
  ),
  Compras: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Categorias: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  CargosDescargos: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M7 17V7" /><path d="M3.5 10.5 7 7l3.5 3.5" />
      <path d="M17 7v10" /><path d="M13.5 13.5 17 17l3.5-3.5" />
    </svg>
  ),
  Gastos: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" />
    </svg>
  ),
  Reportes: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12.5" y="8" width="3" height="10" /><rect x="18" y="5" width="3" height="13" />
    </svg>
  ),
  Configuracion: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Usuarios: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  CerrarSesion: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 9, verticalAlign: -3 }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  )
};

// Logo "MS" + celular ahora vive en un componente compartido (src/components/LogoMoviSync.jsx)
// para poder reutilizarlo tambien en la pantalla de Login sin duplicar el SVG.

// Submenu del sidebar (Facturar / Compras / Reportes), dibujado con un PORTAL directo a
// document.body. Antes vivia "adentro" del sidebar (position:absolute respecto a su boton),
// asi que cualquier overflow:auto/hidden de un padre (el sidebar, o el div que le da scroll al
// menu) lo recortaba o lo tapaba detras del contenido -exactamente el bug de "el submenu queda
// por debajo del dashboard"-. Con el portal, el submenu escapa por completo del sidebar: se
// posiciona con "position: fixed" calculando sus coordenadas a partir del boton que lo abre, asi
// que ningun overflow ni scroll del menu lo puede volver a recortar, sin importar que tan largo
// o corto sea el sidebar.
function SidebarSubmenu({ open, anchorRef, onClose, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return; }
    const calcular = () => {
      const r = anchorRef.current.getBoundingClientRect();
      // Si el boton que abre el submenu esta en la mitad inferior de la pantalla (como
      // "Reportes", que quedo mas abajo del sidebar al crecer con mas opciones), anclar por
      // "top" hacia abajo lo saca del viewport sin poder verse completo ni hacer scroll. En
      // vez de eso, se ancla por "bottom" para que el panel crezca hacia ARRIBA desde la
      // altura del boton, quedando siempre dentro de la pantalla.
      if (r.top > window.innerHeight / 2) {
        setPos({ top: null, bottom: window.innerHeight - r.bottom, left: r.right + 6 });
      } else {
        setPos({ top: r.top, bottom: null, left: r.right + 6 });
      }
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [open, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="sidebar-submenu-overlay" onClick={onClose} />
      <div
        className="sidebar-submenu"
        style={{ position: 'fixed', top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', left: pos.left }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  // Licencia de uso (Opcion 1: clave de activacion offline atada al equipo). Se revisa una sola
  // vez al abrir la app, ANTES de mostrar el login: mientras "licencia" es null todavia se esta
  // consultando; si "activada" es false, se bloquea todo detras de la pantalla de Activacion.
  const [licencia, setLicencia] = useState(null);
  useEffect(() => { window.api.licenciaEstado().then(setLicencia); }, []);
  const [view, setView] = useState('inicio');
  // Submenu de Facturacion (Generar Factura / Devolucion de Factura), igual al de Compras.
  const [menuFacturacionAbierto, setMenuFacturacionAbierto] = useState(false);
  // Submenu de Compras (Generar Compras / Devolucion de Compras), igual al menu de referencia:
  // se abre al hacer click en "Compras" y se cierra al elegir una opcion o al hacer click afuera.
  const [menuComprasAbierto, setMenuComprasAbierto] = useState(false);
  // Submenu de Reportes (Inventario / Ventas / Compras / Impuestos / Etiquetas / Vendedores),
  // igual patron que Facturar y Compras. categoriaReportes decide con que categoria se abre la
  // pantalla de Reportes; se pasa como "key" para forzar que Reportes se vuelva a montar con esa
  // categoria activa cada vez que se elige una opcion distinta del submenu.
  const [menuReportesAbierto, setMenuReportesAbierto] = useState(false);
  const [categoriaReportes, setCategoriaReportes] = useState('ventas');
  // Submenu de Configuracion: 5 pantallas repartidas (Datos de Tienda, Cotizacion del dia,
  // Configuracion factura, Depositos/almacenes, Bases de datos). "Cotizacion del dia" es la
  // unica que ademas ve el vendedor (no solo el administrador), por eso el boton que abre este
  // submenu NO esta detras de "user.role === 'administrador'" como las demas secciones del
  // menu -el filtro por rol se aplica adentro, item por item-.
  const [menuConfigAbierto, setMenuConfigAbierto] = useState(false);
  const refFacturar = useRef(null);
  const refCompras = useRef(null);
  const refReportes = useRef(null);
  const refConfig = useRef(null);
  if (!licencia) {
    return <div className="login-screen" />;
  }
  if (!licencia.activada) {
    return <Activacion machineId={licencia.machineId} onActivado={() => setLicencia({ ...licencia, activada: true })} />;
  }
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  const handleLogout = () => {
    // Se avisa al backend (ademas de borrar el usuario del estado de React) para que la sesion
    // de administrador quede cerrada tambien ahi, y no solo "ocultada" en la pantalla.
    window.api.logout();
    setUser(null);
    setView('inicio');
  };
  const vistasFacturacion = ['facturacion', 'devolucionFacturas', 'notaVenta'];
  const vistasCompras = ['compras', 'comprasTelfAcces', 'devolucionCompras', 'traslados'];
  // Si hay CUALQUIER submenu abierto (Facturar, Compras o Reportes), los botones que no son el
  // que se abrio deben quedar apagados -- incluyendo los otros botones con submenu, que antes se
  // quedaban brillantes porque viven dentro de un <div> y no son hijos directos de <nav>, por lo
  // que la regla CSS que apaga al resto del menu no los alcanzaba.
  const algunSubmenuAbierto = menuFacturacionAbierto || menuComprasAbierto || menuReportesAbierto || menuConfigAbierto;
  const vistasConfig = ['configDatosTienda', 'configCotizacion', 'configFactura', 'configDepositos', 'configBaseDatos', 'configEmailReportes'];
  const irAReporte = (catKey) => {
    setCategoriaReportes(catKey);
    setView('reportes');
    setMenuReportesAbierto(false);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ marginBottom: '10px' }}><LogoMoviSync onDark height={34} /></div>
        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {user.full_name} ({user.role})
        </p>
        <div
          className="sidebar-scroll"
          // Cualquier click dentro del menu (un boton final o un submenu que se despliega)
          // avisa a la campana de notificaciones para que descarte los avisos flotantes, sin
          // tener que enganchar el evento en cada uno de los botones de abajo.
          onClickCapture={() => window.dispatchEvent(new Event('movisync-dismiss-toasts'))}
        >
          <nav className={algunSubmenuAbierto ? 'submenu-open' : ''}>
          <button className={view === 'inicio' ? 'active' : ''} onClick={() => setView('inicio')}><MIcon.Inicio />Inicio</button>
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuFacturacionAbierto ? ' dimmed' : ''}`}>
            <button
              ref={refFacturar}
              className={vistasFacturacion.includes(view) ? 'active' : ''}
              onClick={() => setMenuFacturacionAbierto((v) => !v)}
            >
              <MIcon.Facturar />Facturar
            </button>
            <SidebarSubmenu open={menuFacturacionAbierto} anchorRef={refFacturar} onClose={() => setMenuFacturacionAbierto(false)}>
                  <button
                    className={view === 'facturacion' ? 'active' : ''}
                    onClick={() => { setView('facturacion'); setMenuFacturacionAbierto(false); }}
                  >
                    🧾 Generar Factura
                  </button>
                  <button
                    className={view === 'devolucionFacturas' ? 'active' : ''}
                    onClick={() => { setView('devolucionFacturas'); setMenuFacturacionAbierto(false); }}
                  >
                    ↩ Devolución de Factura
                  </button>
                  <button
                    className={view === 'notaVenta' ? 'active' : ''}
                    onClick={() => { setView('notaVenta'); setMenuFacturacionAbierto(false); }}
                  >
                    🧾 Nota de Venta
                  </button>
            </SidebarSubmenu>
          </div>
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuComprasAbierto ? ' dimmed' : ''}`}>
            <button
              ref={refCompras}
              className={vistasCompras.includes(view) ? 'active' : ''}
              onClick={() => setMenuComprasAbierto((v) => !v)}
            >
              <MIcon.Compras />Compras
            </button>
            <SidebarSubmenu open={menuComprasAbierto} anchorRef={refCompras} onClose={() => setMenuComprasAbierto(false)}>
                  <button
                    className={view === 'compras' ? 'active' : ''}
                    onClick={() => { setView('compras'); setMenuComprasAbierto(false); }}
                  >
                    🛒 Generar Compras
                  </button>
                  <button
                    className={view === 'comprasTelfAcces' ? 'active' : ''}
                    onClick={() => { setView('comprasTelfAcces'); setMenuComprasAbierto(false); }}
                  >
                    ☎ Compras Telf/Acces
                  </button>
                  <button
                    className={view === 'devolucionCompras' ? 'active' : ''}
                    onClick={() => { setView('devolucionCompras'); setMenuComprasAbierto(false); }}
                  >
                    ↩ Devolución de Compras
                  </button>
                  <button
                    className={view === 'traslados' ? 'active' : ''}
                    onClick={() => { setView('traslados'); setMenuComprasAbierto(false); }}
                  >
                    🔀 Traslados entre depósitos
                  </button>
            </SidebarSubmenu>
          </div>
          <hr className="sidebar-section-divider" />
          <button className={view === 'categorias' ? 'active' : ''} onClick={() => setView('categorias')}><MIcon.Categorias />Categorias</button>
          <button className={view === 'cargosDescargos' ? 'active' : ''} onClick={() => setView('cargosDescargos')}><MIcon.CargosDescargos />Cargos y Descargos</button>
          {user.role === 'administrador' && (
            <button className={view === 'gastos' ? 'active' : ''} onClick={() => setView('gastos')}><MIcon.Gastos />Gastos</button>
          )}
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuReportesAbierto ? ' dimmed' : ''}`}>
            <button
              ref={refReportes}
              className={view === 'reportes' ? 'active' : ''}
              onClick={() => setMenuReportesAbierto((v) => !v)}
            >
              <MIcon.Reportes />Reportes
            </button>
            <SidebarSubmenu open={menuReportesAbierto} anchorRef={refReportes} onClose={() => setMenuReportesAbierto(false)}>
                  <button className={view === 'reportes' && categoriaReportes === 'inventario' ? 'active' : ''} onClick={() => irAReporte('inventario')}>
                    <RIcon.Inventario /> Inventario
                  </button>
                  <button className={view === 'reportes' && categoriaReportes === 'ventas' ? 'active' : ''} onClick={() => irAReporte('ventas')}>
                    <RIcon.Ventas /> Ventas
                  </button>
                  <button className={view === 'reportes' && categoriaReportes === 'compras' ? 'active' : ''} onClick={() => irAReporte('compras')}>
                    <RIcon.Compras /> Compras
                  </button>
                  <button className={view === 'reportes' && categoriaReportes === 'impuestos' ? 'active' : ''} onClick={() => irAReporte('impuestos')}>
                    <RIcon.Impuestos /> Impuestos
                  </button>
                  <button className={view === 'reportes' && categoriaReportes === 'etiquetas' ? 'active' : ''} onClick={() => irAReporte('etiquetas')}>
                    <RIcon.Etiquetas /> Etiquetas
                  </button>
                  <button className={view === 'reportes' && categoriaReportes === 'vendedores' ? 'active' : ''} onClick={() => irAReporte('vendedores')}>
                    <RIcon.Vendedores /> Vendedores
                  </button>
            </SidebarSubmenu>
          </div>
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuConfigAbierto ? ' dimmed' : ''}`}>
            <button
              ref={refConfig}
              className={vistasConfig.includes(view) ? 'active' : ''}
              onClick={() => setMenuConfigAbierto((v) => !v)}
            >
              <MIcon.Configuracion />Configuracion
            </button>
            <SidebarSubmenu open={menuConfigAbierto} anchorRef={refConfig} onClose={() => setMenuConfigAbierto(false)}>
              {user.role === 'administrador' && (
                <button className={view === 'configDatosTienda' ? 'active' : ''} onClick={() => { setView('configDatosTienda'); setMenuConfigAbierto(false); }}>
                  🏪 Datos de Tienda
                </button>
              )}
              <button className={view === 'configCotizacion' ? 'active' : ''} onClick={() => { setView('configCotizacion'); setMenuConfigAbierto(false); }}>
                💱 Cotización del día
              </button>
              {user.role === 'administrador' && (
                <button className={view === 'configFactura' ? 'active' : ''} onClick={() => { setView('configFactura'); setMenuConfigAbierto(false); }}>
                  🧾 Configuración factura
                </button>
              )}
              {user.role === 'administrador' && (
                <button className={view === 'configDepositos' ? 'active' : ''} onClick={() => { setView('configDepositos'); setMenuConfigAbierto(false); }}>
                  🏬 Depósitos / almacenes
                </button>
              )}
              {user.role === 'administrador' && (
                <button className={view === 'configBaseDatos' ? 'active' : ''} onClick={() => { setView('configBaseDatos'); setMenuConfigAbierto(false); }}>
                  🗄 Bases de datos
                </button>
              )}
              {user.role === 'administrador' && (
                <button className={view === 'configEmailReportes' ? 'active' : ''} onClick={() => { setView('configEmailReportes'); setMenuConfigAbierto(false); }}>
                  📧 Email Reportes
                </button>
              )}
            </SidebarSubmenu>
          </div>
          {user.role === 'administrador' && (
            <button className={view === 'usuarios' ? 'active' : ''} onClick={() => setView('usuarios')}><MIcon.Usuarios />Usuarios</button>
          )}
          <hr className="sidebar-section-divider" />
          <button onClick={handleLogout}><MIcon.CerrarSesion />Cerrar sesion</button>
        </nav>
        </div>
      </aside>
      <main className="content">
        {view === 'inicio' && <Inicio user={user} />}
        {view === 'facturacion' && <Facturacion currentUser={user} />}
        {view === 'notaVenta' && <Facturacion currentUser={user} modo="notaVenta" />}
        {view === 'devolucionFacturas' && <DevolucionFacturas currentUser={user} />}
        {view === 'compras' && <Compras currentUser={user} />}
        {view === 'comprasTelfAcces' && <ComprasTelfAcces currentUser={user} />}
        {view === 'devolucionCompras' && <DevolucionCompras currentUser={user} />}
        {view === 'traslados' && <Traslados currentUser={user} />}
        {view === 'categorias' && <CategoriasAdmin />}
        {view === 'cargosDescargos' && <CargosDescargos currentUser={user} />}
        {view === 'gastos' && user.role === 'administrador' && <Gastos currentUser={user} />}
        {view === 'reportes' && <Reportes key={categoriaReportes} currentUser={user} categoriaInicial={categoriaReportes} />}
        {view === 'configDatosTienda' && user.role === 'administrador' && <Configuracion seccion="datosTienda" />}
        {view === 'configCotizacion' && <Configuracion seccion="cotizacion" />}
        {view === 'configFactura' && user.role === 'administrador' && <Configuracion seccion="factura" />}
        {view === 'configDepositos' && user.role === 'administrador' && <Configuracion seccion="depositos" />}
        {view === 'configBaseDatos' && user.role === 'administrador' && <Configuracion seccion="baseDatos" />}
        {view === 'configEmailReportes' && user.role === 'administrador' && <Configuracion seccion="emailReportes" />}
        {view === 'usuarios' && user.role === 'administrador' && <UsersAdmin />}
      </main>
    </div>
  );
}
