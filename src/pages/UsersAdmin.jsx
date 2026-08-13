import React, { useEffect, useState } from 'react';

export default function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'vendedor' });
  const [error, setError] = useState('');

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
    const result = await window.api.createUser(form);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setForm({ username: '', password: '', full_name: '', role: 'vendedor' });
    loadUsers();
  };

  const handleToggle = async (id) => {
    await window.api.toggleUserActive(id);
    loadUsers();
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
        <button type="submit">Crear usuario</button>
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
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>
                <span className={`badge ${u.active ? 'active' : 'inactive'}`}>
                  {u.active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <button onClick={() => handleToggle(u.id)}>
                  {u.active ? 'Desactivar' : 'Activar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
