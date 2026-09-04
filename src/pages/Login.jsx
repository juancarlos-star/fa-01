import React, { useState, useRef } from 'react';
import LogoMoviSync from '../components/LogoMoviSync.jsx';

// Ilustracion del panel izquierdo: en vez de una foto real de una tienda (que no podemos usar
// aqui sin derechos sobre la imagen), se dibuja una escena sencilla en el mismo estilo/colores
// del logo -telefono, tableta y accesorios-, para que la ventana se vea profesional sin
// depender de un archivo de foto externo. Si mas adelante quieres una foto real de tu propia
// tienda, se puede reemplazar facilmente por un <img> apuntando a esa foto.
function IlustracionAcceso() {
  return (
    <svg viewBox="0 0 520 620" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="fondoAcceso" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef4fb" />
          <stop offset="100%" stopColor="#dbe8f5" />
        </linearGradient>
        <linearGradient id="telefonoAcceso" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1c3f66" />
          <stop offset="100%" stopColor="#0b2545" />
        </linearGradient>
      </defs>
      <rect width="520" height="620" fill="url(#fondoAcceso)" />
      <rect x="0" y="70" width="520" height="10" fill="#c9d9ea" />
      <rect x="0" y="230" width="520" height="10" fill="#c9d9ea" />
      {[40, 130, 220, 310, 400, 470].map((x, i) => (
        <rect key={i} x={x} y={i % 2 === 0 ? 20 : 24} width="46" height="50" rx="6" fill="#ffffff" stroke="#c9d9ea" />
      ))}
      {[40, 130, 220, 310, 400, 470].map((x, i) => (
        <rect key={'b' + i} x={x} y={i % 2 === 0 ? 178 : 182} width="46" height="52" rx="6" fill="#ffffff" stroke="#c9d9ea" />
      ))}
      <rect x="0" y="470" width="520" height="150" fill="#0b2545" opacity="0.06" />
      <rect x="20" y="440" width="480" height="30" rx="4" fill="#ffffff" stroke="#c9d9ea" />
      <rect x="150" y="330" width="180" height="120" rx="10" fill="url(#telefonoAcceso)" />
      <rect x="162" y="342" width="156" height="80" rx="4" fill="#eaf3ff" opacity="0.85" />
      <rect x="172" y="352" width="60" height="10" rx="2" fill="#0b2545" opacity="0.35" />
      <rect x="172" y="368" width="90" height="8" rx="2" fill="#0b2545" opacity="0.25" />
      <rect x="172" y="382" width="70" height="8" rx="2" fill="#0b2545" opacity="0.25" />
      <rect x="205" y="455" width="20" height="18" fill="#0b2545" />
      <rect x="90" y="300" width="46" height="150" rx="8" fill="url(#telefonoAcceso)" />
      <rect x="96" y="312" width="34" height="112" rx="2" fill="#eaf3ff" opacity="0.85" />
      <rect x="345" y="360" width="90" height="55" rx="6" fill="#e7edf5" stroke="#c9d9ea" />
      <rect x="356" y="345" width="40" height="18" rx="2" fill="#c9d9ea" />
      <rect x="360" y="405" width="6" height="40" fill="#ffffff" stroke="#c9d9ea" />
      <rect x="360" y="470" width="40" height="30" fill="#ffffff" stroke="#c9d9ea" />
      <rect x="405" y="465" width="40" height="35" fill="#ffffff" stroke="#c9d9ea" />
      <rect x="382" y="440" width="40" height="30" fill="#ffffff" stroke="#c9d9ea" />
      <g opacity="0.10" transform="translate(210,90) scale(0.7)">
        <path d="M40 90 L100 30 L140 30 L80 90 Z" fill="#0057a3" />
        <path d="M0 130 Q0 60 70 60 L110 60 Q40 60 40 130 Z" fill="#0057a3" />
      </g>
    </svg>
  );
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refUsuario = useRef(null);
  const refClave = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await window.api.login(username, password);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onLogin(result.user);
    } catch (err) {
      console.error('Error al iniciar sesion:', err);
      setError('Ocurrio un error inesperado al iniciar sesion: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  // Al presionar Enter en "Usuario" el foco pasa a "Clave de acceso" en vez de intentar enviar
  // el formulario de una vez (con el usuario solo, sin clave, no hay nada que enviar todavia).
  const handleUsuarioKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      refClave.current?.focus();
    }
  };

  const handleCancelar = () => {
    setUsername('');
    setPassword('');
    setError('');
    refUsuario.current?.focus();
  };

  return (
    <div className="acceso-screen">
      <div className="acceso-ventana">
        <div className="acceso-izquierda">
          <IlustracionAcceso />
        </div>
        <form className="acceso-derecha" onSubmit={handleSubmit}>
          <div className="acceso-logo">
            <LogoMoviSync height={64} onDark />
          </div>

          <label className="acceso-label" htmlFor="campo-usuario">Usuario:</label>
          <div className="acceso-campo">
            <span className="acceso-icono">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              id="campo-usuario"
              ref={refUsuario}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleUsuarioKeyDown}
              autoFocus
              autoComplete="username"
            />
          </div>

          <label className="acceso-label" htmlFor="campo-clave">Clave de acceso:</label>
          <div className="acceso-campo">
            <span className="acceso-icono">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              id="campo-clave"
              ref={refClave}
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="acceso-toggle-clave"
              onClick={() => setVerClave((v) => !v)}
              title={verClave ? 'Ocultar clave' : 'Mostrar clave'}
              tabIndex={-1}
            >
              {verClave ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && <div className="acceso-error">{error}</div>}

          <p className="acceso-subtitulo">Módulo Facturación / Inventario</p>
          <p className="acceso-version">Versión 1.0.0</p>

          <div className="acceso-botones">
            <button type="submit" disabled={loading}>{loading ? 'Ingresando...' : 'Aceptar'}</button>
            <button type="button" onClick={handleCancelar} disabled={loading}>Cancelar</button>
          </div>

          <div className="acceso-footer">
            <p>Sistema Desarrollado por: JCC 2026</p>
            <p>MoviSync Software<br />MoviSync 2026</p>
          </div>
        </form>
      </div>
    </div>
  );
}
