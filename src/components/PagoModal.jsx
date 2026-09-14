import React, { useState } from 'react';
import { fmt } from '../utils/format.js';

// Ventana modal para armar el desglose de pago de una factura/nota de venta o de un abono de
// Apartado. En vez de un solo "metodo de pago", se arma una lista de LINEAS (metodo + moneda +
// monto): un pago mixto (ej. parte efectivo + parte tarjeta, o efectivo repartido entre Bs y
// USD) es simplemente varias lineas, sin necesitar un metodo "mixto" aparte. El backend
// (electron/main.js, validarYNormalizarPagos) vuelve a validar todo esto -este modal solo
// ayuda a que el vendedor no se equivoque antes de enviarlo.
//
// Props:
//  - totalUsd: monto a cobrar, en USD (obligatorio)
//  - tasaCambio: Bs por USD del dia, para mostrar el equivalente en vivo
//  - titulo: encabezado de la ventana (ej. "Cobrar factura", "Registrar abono")
//  - onConfirm(pagos): pagos = [{ metodo, moneda, monto }]
//  - onCancel()
const METODOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pago_movil', label: 'Pago movil' },
  { value: 'otro', label: 'Otro' }
];

let contadorLinea = 0;
function nuevaLinea(montoSugerido) {
  contadorLinea += 1;
  return { key: `p${contadorLinea}`, metodo: 'efectivo', moneda: 'USD', monto: montoSugerido || '' };
}

export default function PagoModal({ totalUsd, tasaCambio, titulo, onConfirm, onCancel }) {
  const [lineas, setLineas] = useState([nuevaLinea(totalUsd ? String(totalUsd) : '')]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const montoUsdDeLinea = (linea) => {
    const m = parseFloat(linea.monto) || 0;
    return linea.moneda === 'USD' ? m : m / (tasaCambio || 1);
  };

  const totalCubiertoUsd = lineas.reduce((acc, l) => acc + montoUsdDeLinea(l), 0);
  const diferencia = Math.round((totalCubiertoUsd - (totalUsd || 0)) * 100) / 100;
  const cuadra = Math.abs(diferencia) <= 0.01;

  const actualizarLinea = (key, campo, valor) => {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  };

  const agregarLinea = () => {
    // Sugiere en la nueva linea lo que todavia falta por cubrir, en USD, para que sea rapido
    // completar un pago mixto (ej: cliente ya puso $20 en efectivo, faltan $5.30 -> se sugieren
    // esos $5.30 en la segunda linea).
    const faltante = Math.max(0, Math.round(((totalUsd || 0) - totalCubiertoUsd) * 100) / 100);
    setLineas((prev) => [...prev, nuevaLinea(faltante ? String(faltante) : '')]);
  };

  const quitarLinea = (key) => {
    setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  };

  const handleConfirmar = async () => {
    setError('');
    for (const l of lineas) {
      const m = parseFloat(l.monto);
      if (!m || m <= 0) {
        setError('Cada linea de pago debe tener un monto mayor a cero');
        return;
      }
    }
    if (!cuadra) {
      setError(
        diferencia > 0
          ? `Las lineas de pago suman $${fmt(totalCubiertoUsd)}, que es $${fmt(diferencia)} MAS que el total a cobrar ($${fmt(totalUsd)})`
          : `Todavia falta cubrir $${fmt(Math.abs(diferencia))} del total a cobrar ($${fmt(totalUsd)})`
      );
      return;
    }
    setGuardando(true);
    try {
      await onConfirm(
        lineas.map((l) => ({ metodo: l.metodo, moneda: l.moneda, monto: parseFloat(l.monto) || 0 }))
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div style={overlayStyle} onKeyDown={handleKeyDown}>
      <div style={boxStyle}>
        <div style={headerStyle}>{titulo || 'Forma de pago'}</div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#333' }}>
            Total a cobrar: <strong>${fmt(totalUsd)}</strong>
            {tasaCambio ? <span style={{ color: '#667085' }}> &nbsp;(Bs {fmt((totalUsd || 0) * tasaCambio)} a la tasa de hoy)</span> : null}
          </p>

          {lineas.map((l) => (
            <div key={l.key} style={filaStyle}>
              <select value={l.metodo} onChange={(e) => actualizarLinea(l.key, 'metodo', e.target.value)} style={{ ...inputStyle, flex: '1.3' }}>
                {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={l.moneda} onChange={(e) => actualizarLinea(l.key, 'moneda', e.target.value)} style={{ ...inputStyle, flex: '0.7' }}>
                <option value="USD">USD</option>
                <option value="Bs">Bs</option>
              </select>
              <input
                type="number" min="0" step="0.01"
                value={l.monto}
                onChange={(e) => actualizarLinea(l.key, 'monto', e.target.value)}
                placeholder="Monto"
                style={{ ...inputStyle, flex: '1' }}
              />
              <button
                type="button"
                onClick={() => quitarLinea(l.key)}
                disabled={lineas.length === 1}
                title="Quitar esta linea"
                style={btnQuitar}
              >
                ✕
              </button>
            </div>
          ))}

          <button type="button" onClick={agregarLinea} style={btnAgregar}>
            + Agregar otra forma de pago
          </button>

          <div style={resumenStyle}>
            <span>Cubierto: <strong>${fmt(totalCubiertoUsd)}</strong></span>
            {!cuadra && (
              <span style={{ color: diferencia > 0 ? '#b45309' : '#b42318', fontWeight: 'bold' }}>
                {diferencia > 0 ? `Sobran $${fmt(diferencia)}` : `Faltan $${fmt(Math.abs(diferencia))}`}
              </span>
            )}
            {cuadra && <span style={{ color: '#0b8f4e', fontWeight: 'bold' }}>Cuadra ✓</span>}
          </div>

          {error && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '8px' }}>{error}</p>}

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>
              ESC &nbsp;Cancelar
            </button>
            <button type="button" onClick={handleConfirmar} disabled={guardando} style={btnAceptar}>
              {guardando ? 'Guardando...' : 'Confirmar pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2100
};

const boxStyle = {
  background: '#fff',
  borderRadius: '8px',
  width: '480px',
  maxWidth: '95vw',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 35px rgba(0,0,0,0.35)'
};

const headerStyle = {
  background: 'linear-gradient(180deg, #6bc0d6, #4a9fb8)',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1.05rem',
  letterSpacing: '0.5px',
  padding: '12px 16px',
  borderRadius: '8px 8px 0 0'
};

const inputStyle = {
  padding: '7px 8px',
  border: '1px solid #c7ccd4',
  borderRadius: '5px',
  fontSize: '0.9rem'
};

const filaStyle = {
  display: 'flex',
  gap: '6px',
  marginBottom: '8px'
};

const btnQuitar = {
  padding: '0 10px',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '5px',
  color: '#b42318',
  cursor: 'pointer'
};

const btnAgregar = {
  padding: '6px 10px',
  background: '#eef6ff',
  border: '1px dashed #93b6d6',
  borderRadius: '5px',
  color: '#1a5fa3',
  cursor: 'pointer',
  fontSize: '0.85rem',
  marginBottom: '10px'
};

const resumenStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.9rem',
  padding: '8px 0',
  borderTop: '1px solid #eee'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '4px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const btnAceptar = {
  padding: '8px 16px',
  background: '#0b8f4e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const btnCancelar = {
  padding: '8px 16px',
  background: '#e2e8f0',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
