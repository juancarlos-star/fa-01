import React, { useState, useEffect, useCallback } from 'react';

export default function CategoriasAdmin() {
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoValor, setEditandoValor] = useState('');

  const cargar = useCallback(async () => {
    const data = await window.api.listCategories();
    setCategorias(data);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Equipos (IMEI), SIM Cards y USIM son tipos especiales fijos del sistema (manejan
  // codigos/IMEI). Aqui solo se administran las categorias "normales", cada una de las
  // cuales aparece automaticamente como su propia pestaña en Inventario, con el mismo
  // comportamiento que "Accesorios".
  const gestionables = categorias.filter((c) => c.tipo === 'accesorio');

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
      mensaje += ` con un total de ${impacto.unidades} unidad(es) en stock.`;
      mensaje += `\n\nSi continuas, se ELIMINARAN esos productos de forma permanente, junto con la pestaña correspondiente en Inventario. Esta accion no se puede deshacer.`;
    }
    if (!window.confirm(mensaje)) return;

    const res = await window.api.deleteCategory(c.id);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    cargar();
  };

  const handleToggleVentaCruzada = async (c) => {
    const res = await window.api.toggleCategoryVentaCruzada(c.id);
    if (!res.ok) { alert(res.message); return; }
    cargar();
  };

  return (
    <div>
      <h1>Gestion de categorias</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '480px' }}>
        Cada categoria que crees aqui aparece automaticamente como una pestaña nueva en
        Inventario (igual que "Accesorios"): con Nombre, Precio de venta (USD), Stock minimo
        (alerta), Codigo de barras y Costo unitario de compra (USD). El stock se carga despues
        desde Compras o desde Cargos y Descargos.
      </p>
      <form onSubmit={handleCrear} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Nombre de la nueva categoria</label><br />
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej: Fundas, Cables, Otros..." />
        </div>
        <button type="submit">+ Agregar categoria</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <ul style={{ listStyle: 'none', padding: 0, background: '#fff', borderRadius: '6px', maxWidth: '480px' }}>
        {gestionables.length === 0 && (
          <li style={{ padding: '0.5rem', color: '#666' }}>Aun no hay categorias creadas.</li>
        )}
        {gestionables.map((c) => (
          <li key={c.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {editandoId === c.id ? (
              <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1 }}>
                <input value={editandoValor} onChange={(e) => setEditandoValor(e.target.value)} autoFocus />
                <button onClick={() => guardarEdicion(c.id)}>Guardar</button>
                <button onClick={cancelarEdicion}>Cancelar</button>
              </span>
            ) : (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {c.nombre}
                  <label style={{ fontSize: '0.72rem', color: '#667085', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 400 }}>
                    <input type="checkbox" checked={!!c.sugerir_venta_cruzada} onChange={() => handleToggleVentaCruzada(c)} />
                    Sugerir al facturar un equipo
                  </label>
                </span>
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
}
