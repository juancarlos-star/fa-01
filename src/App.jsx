import React, { useState } from 'react';
import Login from './pages/Login.jsx';
import UsersAdmin from './pages/UsersAdmin.jsx';
import Inventario from './pages/Inventario.jsx';
import CategoriasAdmin from './pages/CategoriasAdmin.jsx';
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
          <button onClick={() => setView('inventario')}>Inventario</button>
          <button onClick={() => setView('facturacion')}>Facturacion (proximamente)</button>
          {user.role === 'administrador' && (
            <button onClick={() => setView('categorias')}>Categorias</button>
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
            <p>Los modulos de facturacion se agregaran en las proximas fases.</p>
          </div>
        )}
        {view === 'inventario' && <Inventario currentUser={user} />}
        {view === 'categorias' && user.role === 'administrador' && <CategoriasAdmin />}
        {view === 'usuarios' && user.role === 'administrador' && <UsersAdmin />}
      </main>
    </div>
  );
}
