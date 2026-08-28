import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Login from './pages/Login.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import Inventario from './pages/Inventario.jsx';
import CategoriasAdmin from './pages/CategoriasAdmin.jsx';
import CargosDescargos from './pages/CargosDescargos.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Facturacion from './pages/Facturacion.jsx';
import DevolucionFacturas from './pages/DevolucionFacturas.jsx';
import Compras from './pages/Compras.jsx';
import ComprasTelfAcces from './pages/ComprasTelfAcces.jsx';
import DevolucionCompras from './pages/DevolucionCompras.jsx';
import Gastos from './pages/Gastos.jsx';
import Reportes from './pages/Reportes.jsx';
import Inicio from './pages/Inicio.jsx';

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

// Logo "MS" + celular, tal como en la referencia: las letras en blanco y, pegado a la derecha,
// un icono minimalista de telefono (mismo trazo blanco).
const LogoMoviSync = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
    <span style={{ fontSize: '2.1rem', fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>MS</span>
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2.2" />
      <line x1="11" y1="18.3" x2="13" y2="18.3" />
    </svg>
  </div>
);

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
      setPos({ top: r.top, left: r.right + 6 });
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [open, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="sidebar-submenu-overlay" onClick={onClose} />
      <div className="sidebar-submenu" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
        {children}
      </div>
    </>,
    document.body
  );
}

export default function App() {
  const [user, setUser] = useState(null);
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
  const refFacturar = useRef(null);
  const refCompras = useRef(null);
  const refReportes = useRef(null);
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  const handleLogout = () => {
    setUser(null);
    setView('inicio');
  };
  const vistasFacturacion = ['facturacion', 'devolucionFacturas', 'notaVenta'];
  const vistasCompras = ['compras', 'comprasTelfAcces', 'devolucionCompras'];
  // Si hay CUALQUIER submenu abierto (Facturar, Compras o Reportes), los botones que no son el
  // que se abrio deben quedar apagados -- incluyendo los otros botones con submenu, que antes se
  // quedaban brillantes porque viven dentro de un <div> y no son hijos directos de <nav>, por lo
  // que la regla CSS que apaga al resto del menu no los alcanzaba.
  const algunSubmenuAbierto = menuFacturacionAbierto || menuComprasAbierto || menuReportesAbierto;
  const irAReporte = (catKey) => {
    setCategoriaReportes(catKey);
    setView('reportes');
    setMenuReportesAbierto(false);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <LogoMoviSync />
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
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
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
              </SidebarSubmenu>
            </div>
          )}
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
            <button className={view === 'categorias' ? 'active' : ''} onClick={() => setView('categorias')}><MIcon.Categorias />Categorias</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'cargosDescargos' ? 'active' : ''} onClick={() => setView('cargosDescargos')}><MIcon.CargosDescargos />Cargos y Descargos</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'gastos' ? 'active' : ''} onClick={() => setView('gastos')}><MIcon.Gastos />Gastos</button>
          )}
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuReportesAbierto ? ' dimmed' : ''}`}>
            <button
              ref={refReportes}
              className={(view === 'reportes' || view === 'inventario') ? 'active' : ''}
              onClick={() => setMenuReportesAbierto((v) => !v)}
            >
              <MIcon.Reportes />Reportes
            </button>
            <SidebarSubmenu open={menuReportesAbierto} anchorRef={refReportes} onClose={() => setMenuReportesAbierto(false)}>
                  <button className={view === 'inventario' ? 'active' : ''} onClick={() => { setView('inventario'); setMenuReportesAbierto(false); }}>
                    <MIcon.Inventario /> Stock Bajo de productos
                  </button>
                  {user.role === 'administrador' && (
                    <>
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
                    </>
                  )}
            </SidebarSubmenu>
          </div>
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
            <button className={view === 'configuracion' ? 'active' : ''} onClick={() => setView('configuracion')}><MIcon.Configuracion />Configuracion</button>
          )}
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
        {view === 'inventario' && <Inventario currentUser={user} />}
        {view === 'compras' && user.role === 'administrador' && <Compras currentUser={user} />}
        {view === 'comprasTelfAcces' && user.role === 'administrador' && <ComprasTelfAcces currentUser={user} />}
        {view === 'devolucionCompras' && user.role === 'administrador' && <DevolucionCompras currentUser={user} />}
        {view === 'categorias' && user.role === 'administrador' && <CategoriasAdmin />}
        {view === 'cargosDescargos' && user.role === 'administrador' && <CargosDescargos currentUser={user} />}
        {view === 'gastos' && user.role === 'administrador' && <Gastos currentUser={user} />}
        {view === 'reportes' && user.role === 'administrador' && <Reportes key={categoriaReportes} currentUser={user} categoriaInicial={categoriaReportes} />}
        {view === 'configuracion' && user.role === 'administrador' && <Configuracion />}
        {view === 'usuarios' && user.role === 'administrador' && <UsersAdmin />}
      </main>
    </div>
  );
}
