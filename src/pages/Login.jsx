import React, { useState, useRef } from 'react';
import LogoMoviSync from '../components/LogoMoviSync.jsx';
import fotoTienda from '../assets/login-tienda.jpg';

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
          <img src={fotoTienda} alt="Tienda MoviSync" />
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
