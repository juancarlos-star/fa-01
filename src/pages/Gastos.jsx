import React, { useEffect, useState, useCallback } from 'react';

export default function Gastos({ currentUser }) {
  const [gastos, setGastos] = useState([]);
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [monto, setMonto] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const data = await window.api.listGastos();
    setGastos(data);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleAgregar = async (e) => {
    e.preventDefault();
    setError('');
    const res = await window.api.createGasto({
      concepto,
      categoria,
      monto_usd: monto,
      usuario: currentUser?.username
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setConcepto('');
    setCategoria('');
    setMonto('');
    cargar();
  };

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await window.api.deleteGasto(id);
    cargar();
  };

  const totalMostrado = gastos.reduce((acc, g) => acc + g.monto_usd, 0);

  return (
    <div>
      <h1>Gastos</h1>

      <form className="form-box" onSubmit={handleAgregar} style={{ maxWidth: '420px' }}>
        <h3>Registrar gasto</h3>
        <label>Concepto</label>
        <input
          placeholder="Ej: Alquiler local, Internet, Transporte..."
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
        />
        <label>Categoria (opcional)</label>
        <input
          placeholder="Ej: Operativo, Servicios, Personal..."
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <label>Monto (USD)</label>
        <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <button type="submit">Registrar gasto</button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>

      <h3>Historial de gastos</h3>
      {gastos.length === 0 ? (
        <p>Aun no hay gastos registrados.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Concepto</th>
              <th>Categoria</th>
              <th>Monto</th>
              <th>Usuario</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{g.created_at}</td>
                <td>{g.concepto}</td>
                <td>{g.categoria || '—'}</td>
                <td>${g.monto_usd.toFixed(2)}</td>
                <td>{g.usuario}</td>
                <td><button onClick={() => handleEliminar(g.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: '0.5rem' }}><strong>Total mostrado: ${totalMostrado.toFixed(2)}</strong></p>
    </div>
  );
}
