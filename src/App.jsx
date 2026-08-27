import React, { useState } from 'react';
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
        <h2>MoviSync</h2>
        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {user.full_name} ({user.role})
        </p>
        <nav className={algunSubmenuAbierto ? 'submenu-open' : ''}>
          <button className={view === 'inicio' ? 'active' : ''} onClick={() => setView('inicio')}>Inicio</button>
          <hr className="sidebar-section-divider" />
          <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuFacturacionAbierto ? ' dimmed' : ''}`}>
            <button
              className={vistasFacturacion.includes(view) ? 'active' : ''}
              onClick={() => setMenuFacturacionAbierto((v) => !v)}
            >
              Facturar
            </button>
            {menuFacturacionAbierto && (
              <>
                <div className="sidebar-submenu-overlay" onClick={() => setMenuFacturacionAbierto(false)} />
                <div className="sidebar-submenu">
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
                </div>
              </>
            )}
          </div>
          <button className={view === 'inventario' ? 'active' : ''} onClick={() => setView('inventario')}>Inventario</button>
          {user.role === 'administrador' && (
            <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuComprasAbierto ? ' dimmed' : ''}`}>
              <button
                className={vistasCompras.includes(view) ? 'active' : ''}
                onClick={() => setMenuComprasAbierto((v) => !v)}
              >
                Compras
              </button>
              {menuComprasAbierto && (
                <>
                  <div className="sidebar-submenu-overlay" onClick={() => setMenuComprasAbierto(false)} />
                  <div className="sidebar-submenu">
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
                  </div>
                </>
              )}
            </div>
          )}
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
            <button className={view === 'categorias' ? 'active' : ''} onClick={() => setView('categorias')}>Categorias</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'cargosDescargos' ? 'active' : ''} onClick={() => setView('cargosDescargos')}>Cargos y Descargos</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'gastos' ? 'active' : ''} onClick={() => setView('gastos')}>Gastos</button>
          )}
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
            <div className={`sidebar-submenu-wrap${algunSubmenuAbierto && !menuReportesAbierto ? ' dimmed' : ''}`}>
              <button
                className={view === 'reportes' ? 'active' : ''}
                onClick={() => setMenuReportesAbierto((v) => !v)}
              >
                Reportes
              </button>
              {menuReportesAbierto && (
                <>
                  <div className="sidebar-submenu-overlay" onClick={() => setMenuReportesAbierto(false)} />
                  <div className="sidebar-submenu">
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
                  </div>
                </>
              )}
            </div>
          )}
          {user.role === 'administrador' && <hr className="sidebar-section-divider" />}
          {user.role === 'administrador' && (
            <button className={view === 'configuracion' ? 'active' : ''} onClick={() => setView('configuracion')}>Configuracion</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'usuarios' ? 'active' : ''} onClick={() => setView('usuarios')}>Usuarios</button>
          )}
          <hr className="sidebar-section-divider" />
          <button onClick={handleLogout}>Cerrar sesion</button>
        </nav>
      </aside>
      <main className="content">
        {view === 'inicio' && (
          <div>
            <h1>Bienvenido, {user.full_name}</h1>
            <p>Usa el menu para facturar, ver el historial o gestionar el inventario.</p>
          </div>
        )}
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
