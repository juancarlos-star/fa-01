import React, { useState, useEffect, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

export default function CategoriasAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState('');
  const [tipoNueva, setTipoNueva] = useState('equipo');
  const [error, setError] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoValor, setEditandoValor] = useState('');

  const cargar = useCallback(async () => {
    const data = await window.api.listCategories();
    setCategorias(data);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

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

  const abrirEdicion = (c) => {
    setEditandoId(c.id);
    setEditandoValor(c.nombre);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditandoValor('');
  };

  const guardarEdicion = async (id) => {
    setError('');
    const res = await window.api.updateCategory(id, editandoValor.trim());
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setEditandoId(null);
    setEditandoValor('');
    cargar();
  };

  const handleEliminar = async (c) => {
    const impacto = await window.api.getCategoryImpact(c.id);
    if (!impacto.ok) {
      alert(impacto.message);
      return;
    }
    let mensaje = `¿Eliminar la categoria "${c.nombre}"?`;
    if (impacto.productos > 0) {
      mensaje += `\n\nATENCION: esta categoria tiene ${impacto.productos} producto(s) registrados`;
      mensaje += c.tipo === 'accesorio'
        ? ` con un total de ${impacto.unidades} unidad(es) en stock.`
        : ` con ${impacto.unidades} codigo(s) (IMEI/SIM/USIM) registrados.`;
      mensaje += `\n\nSi continuas, se ELIMINARAN esos productos y todos sus codigos/IMEI/codigo de barra de forma permanente. Esta accion no se puede deshacer.`;
    }
    if (!window.confirm(mensaje)) return;

    const res = await window.api.deleteCategory(c.id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargar();
  };

  return (
    <div>
      <h1>Gestion de categorias</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '480px' }}>
        Cada categoria pertenece a un tipo de producto. Al crear un producto en Inventario, solo se pueden elegir
        categorias del mismo tipo.
      </p>
      <form onSubmit={handleCrear} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Nombre de la nueva categoria</label><br />
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej: Fundas, Cables..." />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Pertenece a</label><br />
          <select value={tipoNueva} onChange={(e) => setTipoNueva(e.target.value)}>
            {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <button type="submit">+ Agregar categoria</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {TIPOS.map((t) => {
        const deEsteTipo = categorias.filter((c) => c.tipo === t.key);
        if (deEsteTipo.length === 0) return null;
        return (
          <div key={t.key} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.3rem' }}>{t.label}</h3>
            <ul style={{ listStyle: 'none', padding: 0, background: '#fff', borderRadius: '6px' }}>
              {deEsteTipo.map((c) => (
                <li key={c.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {editandoId === c.id ? (
                    <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1 }}>
                      <input value={editandoValor} onChange={(e) => setEditandoValor(e.target.value)} autoFocus />
                      <button onClick={() => guardarEdicion(c.id)}>Guardar</button>
                      <button onClick={cancelarEdicion}>Cancelar</button>
                    </span>
                  ) : (
                    <>
                      <span>{c.nombre}</span>
                      <span style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => abrirEdicion(c)}>Editar</button>
                        <button onClick={() => handleEliminar(c)}>Eliminar</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
