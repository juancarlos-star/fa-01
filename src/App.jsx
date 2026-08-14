import React, { useState } from 'react';
import Login from './pages/Login.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import Inventario from './pages/Inventario.jsx';
import CategoriasAdmin from './pages/CategoriasAdmin.jsx';
import HistorialDescargos from './pages/HistorialDescargos.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Facturacion from './pages/Facturacion.jsx';
import Facturas from './pages/Facturas.jsx';
import Compras from './pages/Compras.jsx';
import Gastos from './pages/Gastos.jsx';
import Reportes from './pages/Reportes.jsx';
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('inicio');
  if (!user) {
    return <Login onLogin={setUser} />;
  }
  const handleLogout = () => {
    setUser(null);
    setView('inicio');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Facturacion Movistar</h2>
        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {user.full_name} ({user.role})
        </p>
        <nav>
          <button onClick={() => setView('inicio')}>Inicio</button>
          <button onClick={() => setView('facturacion')}>Facturar</button>
          <button onClick={() => setView('facturas')}>Historial de facturas</button>
          <button onClick={() => setView('inventario')}>Inventario</button>
          {user.role === 'administrador' && (
            <button onClick={() => setView('compras')}>Compras</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('categorias')}>Categorias</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('descargos')}>Descargos</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('gastos')}>Gastos</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('reportes')}>Reportes</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('configuracion')}>Configuracion</button>
          )}
          {user.role === 'administrador' && (
            <button onClick={() => setView('usuarios')}>Usuarios</button>
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
        {view === 'facturas' && <Facturas currentUser={user} />}
        {view === 'inventario' && <Inventario currentUser={user} />}
        {view === 'compras' && user.role === 'administrador' && <Compras currentUser={user} />}
        {view === 'categorias' && user.role === 'administrador' && <CategoriasAdmin />}
        {view === 'descargos' && user.role === 'administrador' && <HistorialDescargos />}
        {view === 'gastos' && user.role === 'administrador' && <Gastos currentUser={user} />}
        {view === 'reportes' && user.role === 'administrador' && <Reportes />}
        {view === 'configuracion' && user.role === 'administrador' && <Configuracion />}
        {view === 'usuarios' && user.role === 'administrador' && <UsersAdmin />}
      </main>
    </div>
  );
}
