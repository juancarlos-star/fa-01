import React, { useState, useEffect } from 'react';
import fondoActivacion from '../assets/activacion-fondo.jpg';

// Pantalla de Activación: se muestra en vez del Login mientras el equipo no tenga una licencia
// activada. El "ID de este equipo" lo genera electron/licencia.js (estable por instalación de
// Windows); el cliente se lo manda al vendedor, quien le devuelve una clave de activación válida
// SOLO para ese ID -o, con el aviso automático por correo (ver enviarSolicitud), ni siquiera
// hace falta que el cliente haga ese paso a mano-.
//
// El fondo (logo + panel blanco/azul) es la imagen fija "activacion-fondo.jpg" que el negocio
// proporcionó ya diseñada; aquí solo se coloca el texto y los campos ENCIMA, en las mismas
// posiciones que en el diseño de referencia. El panel blanco empieza en 0% y el azul en 62% del
// ancho de la imagen (medido a mano sobre el archivo real), por eso los bloques de abajo usan
// esos mismos porcentajes para que el texto caiga siempre dentro de su zona de color, sin
// importar el tamaño real al que se escale la ventana.
export default function Activacion({ machineId, onActivado }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [activando, setActivando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Ademas de poder copiar el ID a mano, apenas se muestra esta pantalla se manda solo (una vez
  // por equipo) un correo al vendedor con el ID, para que no haga falta que el cliente se lo
  // tenga que enviar el mismo. "estadoSolicitud": 'enviando' | 'enviado' | 'error' | null.
  const [estadoSolicitud, setEstadoSolicitud] = useState(null);
  // Motivo exacto del error (viene del backend: "no configurado", "contraseña incorrecta", "no
  // hay internet", etc.) para poder mostrarlo tal cual en pantalla -antes se mostraba siempre el
  // mismo mensaje generico sin importar la causa real, lo que hacia imposible saber que estaba
  // pasando sin ir a revisar la consola de Electron a mano.
  const [motivoError, setMotivoError] = useState('');

  const enviarSolicitud = async (forzar) => {
    setEstadoSolicitud('enviando');
    setMotivoError('');
    try {
      const res = await window.api.licenciaEnviarSolicitud(forzar);
      setEstadoSolicitud(res.ok ? 'enviado' : 'error');
      if (!res.ok) setMotivoError(res.message || 'No se sabe el motivo exacto.');
    } catch (err) {
      setEstadoSolicitud('error');
      setMotivoError(err?.message || 'No se sabe el motivo exacto.');
    }
  };

  useEffect(() => {
    enviarSolicitud(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundImage: `url(${fondoActivacion})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
        {/* ---- Zona blanca (0% a 62%): mensaje + ID del equipo ---- */}
        <div
          style={{
            position: 'absolute',
            top: '34%',
            left: '5%',
            width: '52%'
          }}
        >
          <p style={{ textAlign: 'center', fontWeight: 600, color: '#1a1a2e', fontSize: 'clamp(0.75rem, 1.6vw, 1.05rem)', margin: '0 0 3%' }}>
            Este equipo todavía no tiene una licencia activada.
          </p>

          <div style={{ background: 'rgba(242,244,247,0.92)', borderRadius: '8px', padding: '3.5%' }}>
            <label style={{ fontSize: 'clamp(0.6rem, 1.1vw, 0.8rem)', color: '#475467' }}>ID de este equipo</label>
            <input
              readOnly
              value={machineId}
              onFocus={(e) => e.target.select()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                fontSize: 'clamp(0.55rem, 1vw, 0.8rem)',
                marginTop: '2%',
                padding: '2%',
                borderRadius: '5px',
                border: '1px solid #d0d5dd'
              }}
            />
            <button
              type="button"
              onClick={copiarId}
              style={{
                width: '100%', marginTop: '2.5%', padding: '2.2%', background: '#0057a3', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: 'clamp(0.6rem, 1.1vw, 0.85rem)', fontWeight: 600
              }}
            >
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
            <p style={{ fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', color: '#667085', marginTop: '3%', marginBottom: 0, lineHeight: 1.35 }}>
              Envía este ID por WhatsApp o correo a quien te vendió el programa para que te dé tu
              clave de activación.
            </p>
            <div style={{ marginTop: '3%', paddingTop: '3%', borderTop: '1px solid #d8dce2' }}>
              {estadoSolicitud === 'enviando' && (
                <p style={{ fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', color: '#667085', margin: 0 }}>Avisando automáticamente...</p>
              )}
              {estadoSolicitud === 'enviado' && (
                <p style={{ fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', color: '#0b8f4e', margin: 0, lineHeight: 1.35 }}>
                  ✓ Tu ID ya se envió automáticamente. Solo espera tu clave de activación.
                </p>
              )}
              {estadoSolicitud === 'error' && (
                <>
                  <p style={{ fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', color: '#b42318', margin: 0, lineHeight: 1.35 }}>
                    No se pudo avisar automáticamente. Copia el ID de arriba y envíalo tú mismo, o
                    intenta de nuevo:
                  </p>
                  {motivoError && (
                    <p style={{ fontSize: 'clamp(0.52rem, 0.95vw, 0.7rem)', color: '#98111d', margin: '1.5% 0 0', lineHeight: 1.35, fontFamily: 'monospace' }}>
                      Motivo: {motivoError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => enviarSolicitud(true)}
                    style={{ marginTop: '2%', fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', padding: '1.5% 3%' }}
                  >
                    Reintentar aviso automático
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ---- Zona azul (62% a 100%): clave de activacion ---- */}
        <form
          onSubmit={handleActivar}
          style={{
            position: 'absolute',
            top: '46%',
            left: '65%',
            width: '30%'
          }}
        >
          <label style={{ color: '#eaf2fb', fontSize: 'clamp(0.65rem, 1.3vw, 0.95rem)', display: 'block', marginBottom: '4%' }}>
            Clave de activación
          </label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoFocus
            style={{
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'center',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              fontSize: 'clamp(0.6rem, 1.15vw, 0.85rem)',
              padding: '3%',
              borderRadius: '5px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff'
            }}
          />
          {error && (
            <p style={{ color: '#ffb4a8', fontSize: 'clamp(0.55rem, 1vw, 0.75rem)', marginTop: '3%' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={activando}
            style={{
              width: '100%', marginTop: '6%', padding: '3%', background: '#06264d', color: '#fff',
              border: '1px solid rgba(255,255,255,0.35)', borderRadius: '6px', cursor: 'pointer',
              fontSize: 'clamp(0.65rem, 1.2vw, 0.9rem)', fontWeight: 600
            }}
          >
            {activando ? 'Activando...' : 'Activar'}
          </button>
        </form>
    </div>
  );
}
