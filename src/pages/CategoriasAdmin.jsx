import React, { useState, useEffect, useCallback } from 'react';

export default function CategoriasAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const data = await window.api.listCategories();
    setCategorias(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleCrear = async (e) => {
    e.preventDefault();
    setError('');
    if (!nueva.trim()) return;
    const res = await window.api.createCategory(nueva.trim());
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setNueva('');
    cargar();
  };

  return (
    <div>
      <h1>Gestion de categorias</h1>
      <form onSubmit={handleCrear} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nombre de la nueva categoria"
        />
        <button type="submit">+ Agregar categoria</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0, background: '#fff', borderRadius: '6px' }}>
        {categorias.map((c) => (
          <li key={c.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
            {c.nombre}
          </li>
        ))}
      </ul>
    </div>
  );
}
