import React, { useEffect, useState, useCallback } from 'react';
import { fmt } from '../utils/format.js';

// Cierre de caja / arqueo de turno. A proposito es flexible y NO bloquea Facturacion si no se
// usa: el vendedor puede abrir con monto inicial en USD, en Bs, en ambas o en ninguna, y al
// cerrar contar en la moneda (o monedas) que le resulte mas comoda.
//
// El cierre pide un rango de Fecha/Hora Inicio -> Final (por defecto hoy 1:00 am a 11:00 pm,
// editable) con el que se filtran TODAS las facturas, notas de venta, devoluciones y abonos de
// Apartados de ese rango, y se arma un desglose completo por renglon (Efectivo Bs, Efectivo USD,
// Tarjeta, Transferencia, Pago movil, Zelle, Otro), terminando en un total unico en USD segun la
// tasa de cambio configurada.

const LABELS_RENGLON = {
  tarjeta: 'Tarjeta (Bs)',
  transferencia: 'Transferencia (Bs)',
  pago_movil: 'Pago móvil (Bs)',
  zelle: 'Zelle (USD)',
  otro: 'Otro (Cashea, etc.)'
};

function hoyISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function combinar(fecha, hora) {
  if (!fecha || !hora) return null;
  return `${fecha} ${hora}:00`;
}

export default function Caja({ currentUser }) {
  const [turno, setTurno] = useState(null); // null = sin caja abierta
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Formulario de apertura
  const [montoInicialUsd, setMontoInicialUsd] = useState('');
  const [montoInicialBs, setMontoInicialBs] = useState('');
  const [notasApertura, setNotasApertura] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  // Formulario de cierre: rango de Fecha/Hora (default hoy 1:00 am - 11:00 pm, editable)
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [horaInicio, setHoraInicio] = useState('01:00');
  const [fechaFinal, setFechaFinal] = useState(hoyISO());
  const [horaFinal, setHoraFinal] = useState('23:00');
  const [contadoUsd, setContadoUsd] = useState('');
  const [contadoBs, setContadoBs] = useState('');
  const [notasCierre, setNotasCierre] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [mostrarFormCierre, setMostrarFormCierre] = useState(false);

  const [reporte, setReporte] = useState(null); // desglose detallado del rango elegido
  const [cargandoReporte, setCargandoReporte] = useState(false);

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

  const abrirFormCierre = () => {
    setFechaInicio(hoyISO());
    setHoraInicio('01:00');
    setFechaFinal(hoyISO());
    setHoraFinal('23:00');
    setReporte(null);
    setMostrarFormCierre(true);
  };

  const actualizarDesglose = useCallback(async () => {
    if (!turno) return;
    const desde = combinar(fechaInicio, horaInicio);
    const hasta = combinar(fechaFinal, horaFinal);
    if (!desde || !hasta) return;
    setCargandoReporte(true);
    setError('');
    try {
      const res = await window.api.cajaReporteDetallado({ turnoId: turno.id, desde, hasta });
      if (!res.ok) { setError(res.message); setReporte(null); return; }
      setReporte(res);
    } finally {
      setCargandoReporte(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno, fechaInicio, horaInicio, fechaFinal, horaFinal]);

  useEffect(() => {
    if (mostrarFormCierre) actualizarDesglose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarFormCierre, fechaInicio, horaInicio, fechaFinal, horaFinal]);

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
        notas: notasCierre,
        desde: combinar(fechaInicio, horaInicio),
        hasta: combinar(fechaFinal, horaFinal)
      });
      if (!res.ok) { setError(res.message); return; }
      setUltimoCierre({ ...res.turno, detalle: reporte });
      setContadoUsd('');
      setContadoBs('');
      setNotasCierre('');
      setMostrarFormCierre(false);
      setReporte(null);
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
        <div className="form-box" style={{ maxWidth: '560px', marginBottom: '1.5rem' }}>
          <h3>Caja cerrada</h3>
          <p><strong>Esperado:</strong> ${fmt(ultimoCierre.esperado_usd)} / Bs {fmt(ultimoCierre.esperado_bs)}</p>
          <p><strong>Contado:</strong> {ultimoCierre.contado_usd !== null ? `$${fmt(ultimoCierre.contado_usd)}` : '—'} / {ultimoCierre.contado_bs !== null ? `Bs ${fmt(ultimoCierre.contado_bs)}` : '—'}</p>
          <p style={{ color: colorDiferencia(ultimoCierre.diferencia_usd), fontWeight: 'bold' }}>
            USD: {textoDiferencia(ultimoCierre.diferencia_usd, 'USD')}
          </p>
          <p style={{ color: colorDiferencia(ultimoCierre.diferencia_bs), fontWeight: 'bold' }}>
            Bs: {textoDiferencia(ultimoCierre.diferencia_bs, 'Bs')}
          </p>
          {ultimoCierre.detalle && <DesgloseCierre reporte={ultimoCierre.detalle} />}
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
        <div className="form-box" style={{ maxWidth: '640px' }}>
          <h3>Caja abierta</h3>
          <p><strong>Abierta por:</strong> {turno.usuario_apertura || '—'}</p>
          <p><strong>Desde:</strong> {turno.apertura_at}</p>
          <p><strong>Monto inicial:</strong> ${fmt(turno.monto_inicial_usd)} / Bs {fmt(turno.monto_inicial_bs)}</p>
          {turno.notas_apertura && <p><strong>Notas:</strong> {turno.notas_apertura}</p>}
          <hr />

          {!mostrarFormCierre ? (
            <div>
              <button type="button" className="btn-danger" onClick={abrirFormCierre}>
                Cerrar caja
              </button>
            </div>
          ) : (
            <form onSubmit={handleCerrar}>
              <h3>Cierre de caja</h3>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                Elige el rango de Fecha/Hora a cerrar (por defecto hoy de 1:00 am a 11:00 pm).
                Se filtran todas las facturas, notas de venta, devoluciones y abonos de ese rango.
              </p>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div>
                  <label>Fecha inicio</label>
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                </div>
                <div>
                  <label>Hora inicio</label>
                  <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div>
                  <label>Fecha final</label>
                  <input type="date" value={fechaFinal} onChange={(e) => setFechaFinal(e.target.value)} />
                </div>
                <div>
                  <label>Hora final</label>
                  <input type="time" value={horaFinal} onChange={(e) => setHoraFinal(e.target.value)} />
                </div>
              </div>

              {cargandoReporte && <p style={{ color: '#666' }}>Calculando desglose...</p>}
              {reporte && <DesgloseCierre reporte={reporte} />}

              <hr />
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                Cuenta el efectivo que tengas en la moneda (o monedas) que prefieras. Lo que
                dejes en blanco no se compara contra el esperado.
              </p>
              <label>Contado en USD (esperado: ${reporte ? fmt(reporte.renglones.efectivo.usd) : '—'})</label>
              <input
                type="number" step="0.01" min="0" placeholder="Dejar en blanco si no aplica"
                value={contadoUsd}
                onChange={(e) => setContadoUsd(e.target.value)}
              />
              <label>Contado en Bs (esperado: Bs {reporte ? fmt(reporte.renglones.efectivo.bs) : '—'})</label>
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

// Tabla con el desglose completo devuelto por caja:reporteDetallado / guardado en el cierre.
function DesgloseCierre({ reporte }) {
  const { renglones, conteoDocumentos, tasaCambio, totalUsdConsolidado } = reporte;
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #eee', borderRadius: '8px', padding: '10px 14px', margin: '10px 0' }}>
      <p style={{ margin: '2px 0', fontSize: '0.85rem', color: '#475467' }}>
        Facturas: {conteoDocumentos.facturas} &nbsp;·&nbsp; Notas de venta: {conteoDocumentos.notasVenta} &nbsp;·&nbsp; Devoluciones: {conteoDocumentos.devoluciones}
      </p>
      <table style={{ width: '100%', fontSize: '0.9rem', marginTop: '6px' }}>
        <tbody>
          <tr><td>Efectivo Bs</td><td style={{ textAlign: 'right' }}>Bs {fmt(renglones.efectivo.bs)}</td></tr>
          <tr><td>Efectivo USD</td><td style={{ textAlign: 'right' }}>${fmt(renglones.efectivo.usd)}</td></tr>
          <tr><td>{LABELS_RENGLON.tarjeta}</td><td style={{ textAlign: 'right' }}>Bs {fmt(renglones.tarjeta.bs)}</td></tr>
          <tr><td>{LABELS_RENGLON.transferencia}</td><td style={{ textAlign: 'right' }}>Bs {fmt(renglones.transferencia.bs)}</td></tr>
          <tr><td>{LABELS_RENGLON.pago_movil}</td><td style={{ textAlign: 'right' }}>Bs {fmt(renglones.pago_movil.bs)}</td></tr>
          <tr><td>{LABELS_RENGLON.zelle}</td><td style={{ textAlign: 'right' }}>${fmt(renglones.zelle.usd)}</td></tr>
          <tr>
            <td>{LABELS_RENGLON.otro}</td>
            <td style={{ textAlign: 'right' }}>
              {renglones.otro.bs ? `Bs ${fmt(renglones.otro.bs)}` : ''}
              {renglones.otro.bs && renglones.otro.usd ? ' + ' : ''}
              {renglones.otro.usd ? `$${fmt(renglones.otro.usd)}` : ''}
              {!renglones.otro.bs && !renglones.otro.usd ? '—' : ''}
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#98a2b3' }}>Tasa de cambio usada: Bs {fmt(tasaCambio)} / USD</p>
      <p style={{ fontWeight: 'bold', fontSize: '1rem', marginTop: '4px' }}>Total consolidado: ${fmt(totalUsdConsolidado)}</p>
    </div>
  );
}
