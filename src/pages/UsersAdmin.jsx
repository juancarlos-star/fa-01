import React, { useEffect, useState } from 'react';

export default function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'vendedor' });
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({ username: '', full_name: '', role: 'vendedor', newPassword: '' });
  const [errorEdicion, setErrorEdicion] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const loadUsers = async () => {
    const list = await window.api.listUsers();
    setUsers(list);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password || !form.full_name) {
      setError('Completa todos los campos');
      return;
    }
    setCreando(true);
    try {
      const result = await window.api.createUser(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setForm({ username: '', password: '', full_name: '', role: 'vendedor' });
      await loadUsers();
    } catch (err) {
      console.error('Error al crear usuario:', err);
      setError('Ocurrio un error inesperado al crear el usuario: ' + (err?.message || String(err)));
    } finally {
      setCreando(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await window.api.toggleUserActive(id);
      await loadUsers();
    } catch (err) {
      console.error('Error al cambiar estado del usuario:', err);
    }
  };

  const abrirEdicion = (u) => {
    setEditandoId(u.id);
    setErrorEdicion('');
    setFormEdicion({ username: u.username, full_name: u.full_name, role: u.role, newPassword: '' });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setErrorEdicion('');
    setFormEdicion({ username: '', full_name: '', role: 'vendedor', newPassword: '' });
  };

  const handleChangeEdicion = (field) => (e) => setFormEdicion({ ...formEdicion, [field]: e.target.value });

  const guardarEdicion = async (id) => {
    setErrorEdicion('');
    if (!formEdicion.username.trim() || !formEdicion.full_name.trim()) {
      setErrorEdicion('El nombre y el usuario no pueden estar vacios');
      return;
    }
    setGuardandoEdicion(true);
    try {
      const result = await window.api.updateUser(id, {
        username: formEdicion.username.trim(),
        full_name: formEdicion.full_name.trim(),
        role: formEdicion.role,
        newPassword: formEdicion.newPassword.trim() || undefined
      });
      if (!result.ok) {
        setErrorEdicion(result.message);
        return;
      }
      cancelarEdicion();
      await loadUsers();
    } catch (err) {
      console.error('Error al editar usuario:', err);
      setErrorEdicion('Ocurrio un error inesperado al guardar los cambios: ' + (err?.message || String(err)));
    } finally {
      setGuardandoEdicion(false);
    }
  };

  return (
    <div>
      <h2>Usuarios del sistema</h2>

      <form className="form-box" onSubmit={handleCreate}>
        <h3>Crear nuevo usuario</h3>
        {error && <div className="error-text">{error}</div>}
        <input placeholder="Nombre completo" value={form.full_name} onChange={handleChange('full_name')} />
        <input placeholder="Usuario" value={form.username} onChange={handleChange('username')} />
        <input
          type="password"
          placeholder="Contrasena"
          value={form.password}
          onChange={handleChange('password')}
        />
        <select value={form.role} onChange={handleChange('role')}>
          <option value="vendedor">Vendedor</option>
          <option value="administrador">Administrador</option>
        </select>
        <button type="submit" disabled={creando}>{creando ? 'Creando...' : 'Crear usuario'}</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <React.Fragment key={u.id}>
              {editandoId === u.id ? (
                <tr>
                  <td colSpan={5} style={{ background: '#f8fafc', padding: '0.75rem' }}>
                    {errorEdicion && <div className="error-text">{errorEdicion}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label>Nombre completo</label><br />
                        <input value={formEdicion.full_name} onChange={handleChangeEdicion('full_name')} />
                      </div>
                      <div>
                        <label>Usuario</label><br />
                        <input value={formEdicion.username} onChange={handleChangeEdicion('username')} />
                      </div>
                      <div>
                        <label>Rol</label><br />
                        <select value={formEdicion.role} onChange={handleChangeEdicion('role')}>
                          <option value="vendedor">Vendedor</option>
                          <option value="administrador">Administrador</option>
                        </select>
                      </div>
                      <div>
                        <label>Nueva contrasena (opcional)</label><br />
                        <input
                          type="password"
                          placeholder="Dejar en blanco para no cambiarla"
                          value={formEdicion.newPassword}
                          onChange={handleChangeEdicion('newPassword')}
                        />
                      </div>
                      <button onClick={() => guardarEdicion(u.id)} disabled={guardandoEdicion}>
                        {guardandoEdicion ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button onClick={cancelarEdicion} disabled={guardandoEdicion}>Cancelar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td>{u.full_name}</td>
                  <td>{u.username}</td>
                  <td>{u.role}</td>
                  <td>
                    <span className={`badge ${u.active ? 'active' : 'inactive'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button onClick={() => abrirEdicion(u)}>Editar</button>
                    <button onClick={() => handleToggle(u.id)}>
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
