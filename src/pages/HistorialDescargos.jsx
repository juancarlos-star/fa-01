import React, { useEffect, useState, useCallback } from 'react';

export default function HistorialDescargos() {
  const [descargos, setDescargos] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    const data = await window.api.listDescargos();
    setDescargos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div>
      <h1>Historial de descargos</h1>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        Registro permanente de todas las bajas de inventario, con motivo, fecha y responsable.
      </p>

      {loading ? (
        <p>Cargando...</p>
      ) : descargos.length === 0 ? (
        <p>Aun no hay descargos registrados.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N°</th>
              <th>Fecha/Hora</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Codigo</th>
              <th>Cantidad</th>
              <th>Motivo</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {descargos.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>#{String(d.id).padStart(5, '0')}</td>
                <td>{d.created_at}</td>
                <td>{d.producto_nombre}</td>
                <td>{d.producto_tipo}</td>
                <td>{d.unidad_codigo || '—'}</td>
                <td>{d.cantidad}</td>
                <td>{d.motivo}</td>
                <td>{d.usuario || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
