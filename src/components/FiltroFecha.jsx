import React, { useState } from 'react';

function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function hoyStr() {
  return toStr(new Date());
}
export function primerDiaDelMesStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

const PRESETS = [
  {
    key: 'hoy',
    label: 'Hoy',
    calcular: () => {
      const hoy = new Date();
      return { desde: toStr(hoy), hasta: toStr(hoy) };
    }
  },
  {
    key: 'semana',
    label: 'Esta semana',
    calcular: () => {
      const hoy = new Date();
      const diaSemana = (hoy.getDay() + 6) % 7; // lunes = 0
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() - diaSemana);
      return { desde: toStr(lunes), hasta: toStr(hoy) };
    }
  },
  {
    key: 'mes',
    label: 'Este mes',
    calcular: () => {
      const hoy = new Date();
      return { desde: `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-01`, hasta: toStr(hoy) };
    }
  },
  {
    key: 'anio',
    label: 'Este año',
    calcular: () => {
      const hoy = new Date();
      return { desde: `${hoy.getFullYear()}-01-01`, hasta: toStr(hoy) };
    }
  }
];

// Filtro de fecha reutilizable: botones rapidos (hoy/semana/mes/año) + rango manual desde-hasta.
export default function FiltroFecha({ desde, hasta, onChange }) {
  const [presetActivo, setPresetActivo] = useState('mes');

  const aplicarPreset = (preset) => {
    setPresetActivo(preset.key);
    const { desde: d, hasta: h } = preset.calcular();
    onChange(d, h);
  };

  const cambiarManual = (campo, valor) => {
    setPresetActivo('personalizado');
    if (campo === 'desde') onChange(valor, hasta);
    else onChange(desde, valor);
  };

  return (
    <div className="form-box" style={{ maxWidth: '620px', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => aplicarPreset(p)}
            style={{
              padding: '0.35rem 0.75rem',
              backgroundColor: presetActivo === p.key ? '#0b4f9e' : '#e2e8f0',
              color: presetActivo === p.key ? '#fff' : '#111',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Desde</label><br />
          <input type="date" value={desde} onChange={(e) => cambiarManual('desde', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem' }}>Hasta</label><br />
          <input type="date" value={hasta} onChange={(e) => cambiarManual('hasta', e.target.value)} />
        </div>
      </div>
    </div>
  );
}
