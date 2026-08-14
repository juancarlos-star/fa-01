import React, { useState, useEffect, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

function labelTipo(key) {
  return TIPOS.find((t) => t.key === key)?.label || key;
}

export default function CategoriasAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState('');
  const [tipoNueva, setTipoNueva] = useState('equipo');
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
    const res = await window.api.createCategory(nueva.trim(), tipoNueva);
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
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '480px' }}>
        Cada categoria pertenece a un tipo de producto (Equipos, SIM Card, USIM o Accesorios). Al crear un producto
        en Inventario, solo se pueden elegir categorias del mismo tipo — esto evita mezclar, por ejemplo, un
        accesorio con una categoria de telefonos.
      </p>
      <form onSubmit={handleCrear} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Nombre de la nueva categoria</label><br />
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Ej: Fundas, Cables..."
          />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Pertenece a</label><br />
          <select value={tipoNueva} onChange={(e) => setTipoNueva(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <button type="submit">+ Agregar categoria</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {TIPOS.map((t) => {
        const deEsteTipo = categorias.filter((c) => c.tipo === t.key);
        if (deEsteTipo.length === 0) return null;
        return (
          <div key={t.key} style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.3rem' }}>{t.label}</h3>
            <ul style={{ listStyle: 'none', padding: 0, background: '#fff', borderRadius: '6px' }}>
              {deEsteTipo.map((c) => (
                <li key={c.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {c.nombre}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
