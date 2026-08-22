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
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  const handleLogout = () => {
    setUser(null);
    setView('inicio');
  };
  const vistasFacturacion = ['facturacion', 'devolucionFacturas'];
  const vistasCompras = ['compras', 'devolucionCompras'];
  // Si hay CUALQUIER submenu abierto (Facturar o Compras), los botones que no son el que se
  // abrio deben quedar apagados -- incluyendo el otro boton con submenu (Facturar/Compras),
  // que antes se quedaba brillante porque vive dentro de un <div> y no es hijo directo de
  // <nav>, por lo que la regla CSS que apaga al resto del menu no lo alcanzaba.
  const algunSubmenuAbierto = menuFacturacionAbierto || menuComprasAbierto;
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
            <button className={view === 'reportes' ? 'active' : ''} onClick={() => setView('reportes')}>Reportes</button>
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
        {view === 'reportes' && user.role === 'administrador' && <Reportes currentUser={user} />}
        {view === 'configuracion' && user.role === 'administrador' && <Configuracion />}
        {view === 'usuarios' && user.role === 'administrador' && <UsersAdmin />}
      </main>
    </div>
  );
}
