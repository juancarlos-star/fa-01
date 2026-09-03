import React, { useState } from 'react';
import LogoMoviSync from '../components/LogoMoviSync.jsx';

// Se muestra en vez del Login mientras el equipo no tenga una licencia activada. El "ID de este
// equipo" lo genera electron/licencia.js (estable por instalacion de Windows); el cliente se lo
// manda al vendedor, quien le devuelve una clave de activacion valida SOLO para ese ID.
export default function Activacion({ machineId, onActivado }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [activando, setActivando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el portapapeles no esta disponible, el usuario igual puede seleccionar el texto a mano.
    }
  };

  const handleActivar = async (e) => {
    e.preventDefault();
    setError('');
    if (!codigo.trim()) { setError('Escribe la clave de activación que te dieron.'); return; }
    setActivando(true);
    try {
      const res = await window.api.licenciaActivar(codigo);
      if (!res.ok) {
        setError(res.message || 'No se pudo activar.');
        return;
      }
      onActivado();
    } finally {
      setActivando(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: '440px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <LogoMoviSync color="#0057a3" size={24} fontSize="1.4rem" />
          MoviSync
        </h1>
        <p style={{ textAlign: 'center', color: '#667085', marginTop: '-6px' }}>
          Este equipo todavía no tiene una licencia activada.
        </p>

        <div style={{ background: '#f2f4f7', borderRadius: '8px', padding: '12px', margin: '14px 0' }}>
          <label style={{ fontSize: '0.8rem', color: '#475467' }}>ID de este equipo</label>
          {/* El input y el boton van en filas separadas (uno debajo del otro) en vez de lado a
              lado: un ID largo en una fila junto a un boton de ancho fijo terminaba peleando por
              el espacio dentro del flex row y el input se veia angosto/vacio. Apilados, el input
              puede ocupar todo el ancho disponible sin competir con nada. */}
          <input
            readOnly
            value={machineId}
            onFocus={(e) => e.target.select()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              marginTop: '4px'
            }}
          />
          <button type="button" onClick={copiarId} style={{ width: '100%', marginTop: '8px' }}>
            {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
          <p style={{ fontSize: '0.78rem', color: '#667085', marginTop: '8px', marginBottom: 0 }}>
            Envía este ID por WhatsApp o correo a quien te vendió el programa para que te dé tu
            clave de activación.
          </p>
        </div>

        <form onSubmit={handleActivar}>
          <label>Clave de activación</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            style={{ textAlign: 'center', fontFamily: 'monospace', letterSpacing: '1px' }}
            autoFocus
          />
          {error && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '6px' }}>{error}</p>}
          <button type="submit" disabled={activando} style={{ marginTop: '10px' }}>
            {activando ? 'Activando...' : 'Activar'}
          </button>
        </form>
      </div>
    </div>
  );
}
