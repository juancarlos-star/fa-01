import React, { useEffect, useState, useCallback } from 'react';
import { fmt } from '../utils/format.js';

// Cierre de caja / arqueo de turno. A proposito es flexible y NO bloquea Facturacion si no se
// usa: el vendedor puede abrir con monto inicial en USD, en Bs, en ambas o en ninguna, y al
// cerrar contar en la moneda (o monedas) que le resulte mas comoda.
export default function Caja({ currentUser }) {
  const [turno, setTurno] = useState(null); // null = sin caja abierta
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Formulario de apertura
  const [montoInicialUsd, setMontoInicialUsd] = useState('');
  const [montoInicialBs, setMontoInicialBs] = useState('');
  const [notasApertura, setNotasApertura] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  // Formulario de cierre
  const [contadoUsd, setContadoUsd] = useState('');
  const [contadoBs, setContadoBs] = useState('');
  const [notasCierre, setNotasCierre] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [mostrarFormCierre, setMostrarFormCierre] = useState(false);

  // Resultado a mostrar justo despues de cerrar (la caja ya no esta "abierta", pero seria una
  // mala experiencia que la pantalla vuelva de golpe al formulario de apertura sin mostrar como
  // quedo el arqueo).
  const [ultimoCierre, setUltimoCierre] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await window.api.cajaTurnoActual();
    if (res.ok) setTurno(res.turno);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleAbrir = async (e) => {
    e.preventDefault();
    setError('');
    setAbriendo(true);
    try {
      const res = await window.api.cajaAbrir({
        usuario: currentUser?.username,
        montoInicialUsd: montoInicialUsd || 0,
        montoInicialBs: montoInicialBs || 0,
        notas: notasApertura
      });
      if (!res.ok) { setError(res.message); return; }
      setMontoInicialUsd('');
      setMontoInicialBs('');
      setNotasApertura('');
      setUltimoCierre(null);
      await cargar();
    } finally {
      setAbriendo(false);
    }
  };

  const handleCerrar = async (e) => {
    e.preventDefault();
    setError('');
    if (!contadoUsd.trim() && !contadoBs.trim()) {
      setError('Cuenta al menos una moneda para cerrar la caja');
      return;
    }
    if (!confirm('¿Cerrar la caja con lo contado? Esta acción no se puede deshacer.')) return;
    setCerrando(true);
    try {
      const res = await window.api.cajaCerrar({
        id: turno.id,
        usuario: currentUser?.username,
        contadoUsd: contadoUsd.trim() === '' ? null : contadoUsd,
        contadoBs: contadoBs.trim() === '' ? null : contadoBs,
        notas: notasCierre
      });
      if (!res.ok) { setError(res.message); return; }
      setUltimoCierre(res.turno);
      setContadoUsd('');
      setContadoBs('');
      setNotasCierre('');
      setMostrarFormCierre(false);
      await cargar();
    } finally {
      setCerrando(false);
    }
  };

  const colorDiferencia = (dif) => {
    if (dif === null || dif === undefined) return '#666';
    if (Math.abs(dif) < 0.01) return '#0b8f4e'; // cuadra
    return dif > 0 ? '#175cd3' : '#b42318'; // sobra (azul) / falta (rojo)
  };

  const textoDiferencia = (dif, moneda) => {
    if (dif === null || dif === undefined) return `Sin contar (${moneda})`;
    if (Math.abs(dif) < 0.01) return `Cuadra exacto (${moneda})`;
    return dif > 0
      ? `Sobran ${moneda === 'USD' ? '$' : 'Bs '}${fmt(Math.abs(dif))}`
      : `Faltan ${moneda === 'USD' ? '$' : 'Bs '}${fmt(Math.abs(dif))}`;
  };

  if (cargando) return <div><h1>Caja</h1><p>Cargando...</p></div>;

  return (
    <div>
      <h1>Caja</h1>
      {error && <p style={{ color: '#b42318' }}>{error}</p>}

      {/* Resumen del ultimo cierre, visible una sola vez justo despues de cerrar */}
      {ultimoCierre && !turno && (
        <div className="form-box" style={{ maxWidth: '480px', marginBottom: '1.5rem' }}>
          <h3>Caja cerrada</h3>
          <p><strong>Esperado:</strong> ${fmt(ultimoCierre.esperado_usd)} / Bs {fmt(ultimoCierre.esperado_bs)}</p>
          <p><strong>Contado:</strong> {ultimoCierre.contado_usd !== null ? `$${fmt(ultimoCierre.contado_usd)}` : '—'} / {ultimoCierre.contado_bs !== null ? `Bs ${fmt(ultimoCierre.contado_bs)}` : '—'}</p>
          <p style={{ color: colorDiferencia(ultimoCierre.diferencia_usd), fontWeight: 'bold' }}>
            USD: {textoDiferencia(ultimoCierre.diferencia_usd, 'USD')}
          </p>
          <p style={{ color: colorDiferencia(ultimoCierre.diferencia_bs), fontWeight: 'bold' }}>
            Bs: {textoDiferencia(ultimoCierre.diferencia_bs, 'Bs')}
          </p>
        </div>
      )}

      {!turno && (
        <form className="form-box" onSubmit={handleAbrir} style={{ maxWidth: '420px' }}>
          <h3>Abrir caja</h3>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Abrir caja es opcional: puedes dejar los montos en 0 si solo quieres llevar el
            registro del turno, o completarlos si vas a arquear al cerrar.
          </p>
          <label>Monto inicial en USD</label>
          <input
            type="number" step="0.01" min="0" placeholder="0.00"
            value={montoInicialUsd}
            onChange={(e) => setMontoInicialUsd(e.target.value)}
          />
          <label>Monto inicial en Bs</label>
          <input
            type="number" step="0.01" min="0" placeholder="0.00"
            value={montoInicialBs}
            onChange={(e) => setMontoInicialBs(e.target.value)}
          />
          <label>Notas (opcional)</label>
          <input
            placeholder="Ej: turno de la mañana"
            value={notasApertura}
            onChange={(e) => setNotasApertura(e.target.value)}
          />
          <button type="submit" disabled={abriendo}>{abriendo ? 'Abriendo...' : 'Abrir caja'}</button>
        </form>
      )}

      {turno && (
        <div className="form-box" style={{ maxWidth: '480px' }}>
          <h3>Caja abierta</h3>
          <p><strong>Abierta por:</strong> {turno.usuario_apertura || '—'}</p>
          <p><strong>Desde:</strong> {turno.apertura_at}</p>
          <p><strong>Monto inicial:</strong> ${fmt(turno.monto_inicial_usd)} / Bs {fmt(turno.monto_inicial_bs)}</p>
          {turno.notas_apertura && <p><strong>Notas:</strong> {turno.notas_apertura}</p>}
          <hr />
          <p><strong>Esperado ahora mismo:</strong> ${fmt(turno.esperado_usd)} / Bs {fmt(turno.esperado_bs)}</p>
          <button type="button" onClick={cargar} style={{ marginBottom: '1rem' }}>Actualizar esperado</button>

          {!mostrarFormCierre ? (
            <div>
              <button type="button" className="btn-danger" onClick={() => setMostrarFormCierre(true)}>
                Cerrar caja
              </button>
            </div>
          ) : (
            <form onSubmit={handleCerrar}>
              <hr />
              <h3>Cerrar caja</h3>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                Cuenta el efectivo que tengas en la moneda (o monedas) que prefieras. Lo que
                dejes en blanco no se compara contra el esperado.
              </p>
              <label>Contado en USD</label>
              <input
                type="number" step="0.01" min="0" placeholder="Dejar en blanco si no aplica"
                value={contadoUsd}
                onChange={(e) => setContadoUsd(e.target.value)}
              />
              <label>Contado en Bs</label>
              <input
                type="number" step="0.01" min="0" placeholder="Dejar en blanco si no aplica"
                value={contadoBs}
                onChange={(e) => setContadoBs(e.target.value)}
              />
              <label>Notas (opcional)</label>
              <input
                placeholder="Ej: se retiraron $50 para gastos"
                value={notasCierre}
                onChange={(e) => setNotasCierre(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button type="submit" disabled={cerrando}>{cerrando ? 'Cerrando...' : 'Confirmar cierre'}</button>
                <button type="button" onClick={() => setMostrarFormCierre(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
