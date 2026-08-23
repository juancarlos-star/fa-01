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
import DevolucionCompras from './pages/DevolucionCompras.jsx';
import Gastos from './pages/Gastos.jsx';
import Reportes from './pages/Reportes.jsx';
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
  const vistasFacturacion = ['facturacion', 'devolucionFacturas'];
  const vistasCompras = ['compras', 'devolucionCompras'];
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
        <h2>Facturacion Movistar</h2>
        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {user.full_name} ({user.role})
        </p>
        <nav className={algunSubmenuAbierto ? 'submenu-open' : ''}>
          <button className={view === 'inicio' ? 'active' : ''} onClick={() => setView('inicio')}>Inicio</button>
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
          {user.role === 'administrador' && (
            <button className={view === 'categorias' ? 'active' : ''} onClick={() => setView('categorias')}>Categorias</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'cargosDescargos' ? 'active' : ''} onClick={() => setView('cargosDescargos')}>Cargos y Descargos</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'gastos' ? 'active' : ''} onClick={() => setView('gastos')}>Gastos</button>
          )}
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
                      📦 Inventario
                    </button>
                    <button className={view === 'reportes' && categoriaReportes === 'ventas' ? 'active' : ''} onClick={() => irAReporte('ventas')}>
                      💰 Ventas
                    </button>
                    <button className={view === 'reportes' && categoriaReportes === 'compras' ? 'active' : ''} onClick={() => irAReporte('compras')}>
                      🛒 Compras
                    </button>
                    <button className={view === 'reportes' && categoriaReportes === 'impuestos' ? 'active' : ''} onClick={() => irAReporte('impuestos')}>
                      🧾 Impuestos
                    </button>
                    <button className={view === 'reportes' && categoriaReportes === 'etiquetas' ? 'active' : ''} onClick={() => irAReporte('etiquetas')}>
                      🏷️ Etiquetas
                    </button>
                    <button className={view === 'reportes' && categoriaReportes === 'vendedores' ? 'active' : ''} onClick={() => irAReporte('vendedores')}>
                      🧑‍💼 Vendedores
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'configuracion' ? 'active' : ''} onClick={() => setView('configuracion')}>Configuracion</button>
          )}
          {user.role === 'administrador' && (
            <button className={view === 'usuarios' ? 'active' : ''} onClick={() => setView('usuarios')}>Usuarios</button>
          )}
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
        {view === 'devolucionFacturas' && <DevolucionFacturas currentUser={user} />}
        {view === 'inventario' && <Inventario currentUser={user} />}
        {view === 'compras' && user.role === 'administrador' && <Compras currentUser={user} />}
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
