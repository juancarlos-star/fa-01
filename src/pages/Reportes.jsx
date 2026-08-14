import React, { useState, useEffect, useCallback } from 'react';

function primerDiaDelMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Reportes() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const data = await window.api.getReporteGanancias(desde, hasta);
    setReporte(data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <h1>Reporte de ventas y ganancias</h1>

      <div className="form-box" style={{ maxWidth: '420px', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
        <div>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button onClick={cargar}>Actualizar</button>
      </div>

      {cargando && <p>Cargando...</p>}

      {reporte && !cargando && (
        <>
          <div className="form-box" style={{ maxWidth: '460px', marginTop: '1rem' }}>
            <p>Facturas emitidas: <strong>{reporte.cantidadFacturas}</strong></p>
            <p>Ventas (sin IVA): <strong>${reporte.ventasSubtotalUsd.toFixed(2)}</strong></p>
            <p>IVA cobrado: <strong>${reporte.ivaCobradoUsd.toFixed(2)}</strong></p>
            <p>Costo de lo vendido: <strong>${reporte.costoVendidoUsd.toFixed(2)}</strong></p>
            <p style={{ color: '#027a48' }}>Ganancia bruta: <strong>${reporte.gananciaBrutaUsd.toFixed(2)}</strong></p>
            <p>Gastos del periodo: <strong>${reporte.gastosTotalUsd.toFixed(2)}</strong></p>
            <p style={{ color: reporte.gananciaNetaUsd >= 0 ? '#027a48' : '#b42318', fontSize: '1.1rem' }}>
              <strong>Ganancia neta: ${reporte.gananciaNetaUsd.toFixed(2)}</strong>
            </p>
          </div>

          <h3 style={{ marginTop: '1.5rem' }}>Gastos del periodo</h3>
          {reporte.gastos.length === 0 ? (
            <p>No hay gastos registrados en este rango de fechas.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoria</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {reporte.gastos.map((g) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{g.created_at}</td>
                    <td>{g.concepto}</td>
                    <td>{g.categoria || '—'}</td>
                    <td>${g.monto_usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
