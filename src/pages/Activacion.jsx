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
          {/* El input del ID venia con "flex: 1" pero el CSS global de .login-card input trae su
              propio "width: 100%", y esos dos chocan dentro de un contenedor flex: el navegador
              terminaba calculando un ancho casi nulo para el input (se veia vacio/angosto) en vez
              de repartir el espacio con el boton "Copiar" como se esperaba. Se fuerza width:'0'
              + minWidth:0 + flex:'1 1 0%' explicitamente, que es la combinacion que SI hace que
              un input dentro de un flex row respete el flex-grow sin pelearse con un width:100%
              heredado. */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <input
              readOnly
              value={machineId}
              onFocus={(e) => e.target.select()}
              style={{ flex: '1 1 0%', width: '0', minWidth: 0, fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
            <button type="button" onClick={copiarId} style={{ flexShrink: 0 }}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
          </div>
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
