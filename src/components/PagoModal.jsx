import React, { useState, useEffect } from 'react';
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
  { value: 'zelle', label: 'Zelle' },
  { value: 'otro', label: 'Otro (Cashea, etc.)' }
];

// Tarjeta/Transferencia/Pago movil son siempre en Bs y Zelle es siempre en USD en la practica de
// Venezuela: en vez de dejar que el cajero elija una moneda que despues no cuadra, se bloquea el
// selector de moneda automaticamente al elegir uno de estos metodos. Efectivo y Otro (Cashea y
// demas formas digitales) se dejan libres, tal cual estaba antes. El backend (electron/main.js,
// MONEDA_FIJA_POR_METODO) vuelve a exigir esto mismo, asi que aunque el frontend fallara, nunca
// se puede guardar una combinacion invalida.
const MONEDA_FIJA_POR_METODO = { tarjeta: 'Bs', transferencia: 'Bs', pago_movil: 'Bs', zelle: 'USD' };

let contadorLinea = 0;
function nuevaLinea(montoSugerido) {
  contadorLinea += 1;
  return { key: `p${contadorLinea}`, metodo: 'efectivo', moneda: 'USD', monto: montoSugerido || '' };
}
function lineaDesdeDatos(datos) {
  contadorLinea += 1;
  return { key: `p${contadorLinea}`, metodo: datos.metodo || 'efectivo', moneda: datos.moneda || 'USD', monto: datos.monto != null ? String(datos.monto) : '' };
}

// Decide en que moneda conviene entregar el vuelto de un pago en efectivo. Si el vuelto es
// (practicamente) un numero entero de dolares, se entrega en billetes de USD (los mas comunes
// en el cambio de vuelto en Venezuela: $1, $5, $10...). Si tiene centavos, se entrega en
// bolivares, porque no circulan monedas de centavo de dolar y no se puede dar vuelto exacto en
// USD para esa parte.
function decidirMonedaVuelto(vueltoUsd) {
  const esEnteroUsd = Math.abs(vueltoUsd - Math.round(vueltoUsd)) < 0.01 && vueltoUsd >= 1;
  return esEnteroUsd ? 'USD' : 'Bs';
}

// "lineasIniciales" (opcional): [{ metodo, moneda, monto }], para precargar el desglose -por
// ejemplo, en Devolucion de Facturas se sugiere el mismo desglose con que se cobro la venta
// original-. Es solo una sugerencia editable: el usuario puede cambiar metodo, moneda, monto,
// quitar lineas o agregar otras nuevas con total libertad, exactamente igual que si las hubiera
// escrito el mismo desde cero.
export default function PagoModal({ totalUsd, tasaCambio, titulo, onConfirm, onCancel, lineasIniciales, permitirVuelto = true }) {
  const [lineas, setLineas] = useState(() => (
    lineasIniciales && lineasIniciales.length > 0
      ? lineasIniciales.map(lineaDesdeDatos)
      : [nuevaLinea(totalUsd ? String(totalUsd) : '')]
  ));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Moneda en la que se va a entregar el vuelto, cuando aplica. Arranca en null y se inicializa
  // (en el render, mas abajo) con la sugerencia automatica la primera vez que aparece un
  // sobrante en efectivo; el cajero puede cambiarla a mano si, por ejemplo, no tiene billete de
  // $1 a mano y prefiere darlo en bolivares.
  const [monedaVueltoElegida, setMonedaVueltoElegida] = useState(null);

  const montoUsdDeLinea = (linea) => {
    const m = parseFloat(linea.monto) || 0;
    return linea.moneda === 'USD' ? m : m / (tasaCambio || 1);
  };

  const totalCubiertoUsd = lineas.reduce((acc, l) => acc + montoUsdDeLinea(l), 0);
  const diferencia = Math.round((totalCubiertoUsd - (totalUsd || 0)) * 100) / 100;
  const totalEfectivoUsd = lineas
    .filter((l) => l.metodo === 'efectivo')
    .reduce((acc, l) => acc + montoUsdDeLinea(l), 0);
  // El sobrante solo se puede tratar como "vuelto" si viene cubierto por efectivo (no tiene
  // sentido "dar vuelto" de un pago con tarjeta o transferencia) y si el contexto lo permite -en
  // una devolucion no aplica el concepto de vuelto, un sobrante ahi es simplemente un error de
  // captura que hay que corregir-.
  const haySobranteComoVuelto = permitirVuelto && diferencia > 0.01 && totalEfectivoUsd >= diferencia - 0.01;
  const cuadra = Math.abs(diferencia) <= 0.01 || haySobranteComoVuelto;
  const monedaVueltoSugerida = haySobranteComoVuelto ? decidirMonedaVuelto(diferencia) : null;
  const vueltoEnBs = diferencia * (tasaCambio || 0);

  // Cada vez que aparece un sobrante nuevo se propone la moneda sugerida (el cajero la puede
  // cambiar con los botones de abajo); cuando el sobrante desaparece se limpia la eleccion, para
  // que la proxima vez vuelva a proponer segun el nuevo monto en vez de arrastrar una eleccion
  // vieja.
  useEffect(() => {
    if (haySobranteComoVuelto) {
      setMonedaVueltoElegida((prev) => prev || monedaVueltoSugerida);
    } else if (monedaVueltoElegida) {
      setMonedaVueltoElegida(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haySobranteComoVuelto, monedaVueltoSugerida]);

  const monedaVuelto = monedaVueltoElegida || monedaVueltoSugerida;

  const actualizarLinea = (key, campo, valor) => {
    setLineas((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const actualizada = { ...l, [campo]: valor };
      // Si el metodo elegido tiene moneda fija (tarjeta/transferencia/pago movil/zelle), se
      // fuerza esa moneda automaticamente para que el cajero no tenga que acordarse de cambiarla.
      if (campo === 'metodo') {
        const monedaFija = MONEDA_FIJA_POR_METODO[valor];
        if (monedaFija) actualizada.moneda = monedaFija;
      }
      return actualizada;
    }));
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
          ? `Las lineas de pago suman $${fmt(totalCubiertoUsd)}, que es $${fmt(diferencia)} MAS que el total a cobrar ($${fmt(totalUsd)}). Para dar vuelto, ese sobrante debe venir de una linea en Efectivo.`
          : `Todavia falta cubrir $${fmt(Math.abs(diferencia))} del total a cobrar ($${fmt(totalUsd)})`
      );
      return;
    }
    setGuardando(true);
    try {
      // Las lineas se mandan TAL CUAL las tecleo el cajero (en bruto, incluyendo el sobrante que
      // dio pie al vuelto): el backend es quien resta el vuelto de la caja de la moneda en que
      // en verdad se entrego, para que cuadre exacto por cada moneda (ver electron/main.js,
      // facturas:crear).
      const vueltoAEnviar = haySobranteComoVuelto
        ? { monto: monedaVuelto === 'USD' ? diferencia : vueltoEnBs, moneda: monedaVuelto }
        : null;
      await onConfirm(
        lineas.map((l) => ({ metodo: l.metodo, moneda: l.moneda, monto: parseFloat(l.monto) || 0 })),
        vueltoAEnviar
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
              <select
                value={l.moneda}
                onChange={(e) => actualizarLinea(l.key, 'moneda', e.target.value)}
                disabled={!!MONEDA_FIJA_POR_METODO[l.metodo]}
                title={MONEDA_FIJA_POR_METODO[l.metodo] ? `${METODOS.find((m) => m.value === l.metodo)?.label} siempre es en ${MONEDA_FIJA_POR_METODO[l.metodo]}` : undefined}
                style={{ ...inputStyle, flex: '0.7', opacity: MONEDA_FIJA_POR_METODO[l.metodo] ? 0.7 : 1 }}
              >
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
            {Math.abs(diferencia) <= 0.01 && <span style={{ color: '#0b8f4e', fontWeight: 'bold' }}>Cuadra ✓</span>}
          </div>

          {haySobranteComoVuelto && (
            <div style={vueltoStyle}>
              <div style={{ fontWeight: 'bold', color: '#0b4f9e' }}>💵 Vuelto a entregar: ${fmt(diferencia)}</div>
              <div style={{ color: '#334155', margin: '2px 0 6px' }}>
                {monedaVuelto === 'USD'
                  ? `Entregar en dólares (billete de $${fmt(diferencia, 0)}).`
                  : `Entregar en bolívares: Bs ${fmt(vueltoEnBs)} (equivalente a $${fmt(diferencia)}).`}
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ color: '#667085', fontSize: '0.8rem' }}>¿No tienes esa denominación? Entrégalo en:</span>
                <button
                  type="button"
                  onClick={() => setMonedaVueltoElegida('USD')}
                  style={monedaVuelto === 'USD' ? btnMonedaVueltoActivo : btnMonedaVuelto}
                >
                  USD (${fmt(diferencia)})
                </button>
                <button
                  type="button"
                  onClick={() => setMonedaVueltoElegida('Bs')}
                  style={monedaVuelto === 'Bs' ? btnMonedaVueltoActivo : btnMonedaVuelto}
                >
                  Bs ({fmt(vueltoEnBs)})
                </button>
              </div>
            </div>
          )}

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

const vueltoStyle = {
  background: '#eef6ff',
  border: '1px solid #93b6d6',
  borderRadius: '6px',
  padding: '8px 10px',
  fontSize: '0.85rem',
  marginTop: '4px'
};

const btnMonedaVuelto = {
  padding: '3px 9px',
  background: '#fff',
  border: '1px solid #93b6d6',
  borderRadius: '999px',
  color: '#1a5fa3',
  cursor: 'pointer',
  fontSize: '0.78rem'
};

const btnMonedaVueltoActivo = {
  ...btnMonedaVuelto,
  background: '#0b4f9e',
  borderColor: '#0b4f9e',
  color: '#fff',
  fontWeight: 'bold'
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
