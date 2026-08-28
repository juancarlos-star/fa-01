import React, { useEffect, useRef, useState } from 'react';

// Campana de notificaciones de la pantalla de Inicio.
//
// Comportamiento:
// - Al entrar a Inicio (y cada 30 minutos mientras se sigue ahi) se piden notificaciones nuevas
//   al backend (que ya evita duplicar la misma alerta el mismo dia) y se listan las de las
//   ultimas 2 semanas.
// - Las notificaciones NO leidas que aparecen por primera vez en esta sesion se muestran como
//   tarjetas ("toasts") apiladas justo debajo de la campana, y se autodescartan al minuto cada
//   una. Si el usuario sale de Inicio (el componente se desmonta), los toasts y el intervalo de
//   revision se cancelan de inmediato.
// - El numero rojo sobre la campana es la cantidad de notificaciones no leidas; al abrir el
//   panel de historial se marcan todas como leidas (el numero y el punto rojo desaparecen).
// - El panel de historial (al hacer click en la campana) muestra las ultimas 2 semanas completas,
//   con scroll propio para no alargar la pantalla.

const ICONO_POR_TIPO = {
  stock_bajo: { emoji: '⚠️', color: '#b54708', fondo: '#fffaeb', borde: '#fec84b' },
  agotado: { emoji: '⛔', color: '#b42318', fondo: '#fef3f2', borde: '#fda29b' },
  venta_mayor_usd: { emoji: '📈', color: '#0b8f4e', fondo: '#ecfdf3', borde: '#6ce9a6' },
  venta_mayor_unidades: { emoji: '📈', color: '#0b8f4e', fondo: '#ecfdf3', borde: '#6ce9a6' },
  tasa_pendiente: { emoji: '💱', color: '#175cd3', fondo: '#eff8ff', borde: '#84caff' }
};
const ICONO_DEFAULT = { emoji: '🔔', color: '#344054', fondo: '#f9fafb', borde: '#eaecf0' };

function tituloPorTipo(tipo) {
  if (tipo === 'stock_bajo') return 'Stock bajo';
  if (tipo === 'agotado') return 'Producto agotado';
  if (tipo === 'venta_mayor_usd') return 'Ventas en dólares';
  if (tipo === 'venta_mayor_unidades') return 'Ventas en unidades';
  if (tipo === 'tasa_pendiente') return 'Tasa de cambio';
  return 'Notificación';
}

function formatHoraCorta(fechaTexto) {
  // "created_at" viene como "YYYY-MM-DD HH:MM:SS" (hora local, ya guardada asi por el backend).
  const partes = (fechaTexto || '').split(' ');
  if (partes.length < 2) return fechaTexto || '';
  const [fecha, hora] = partes;
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes} ${hora.slice(0, 5)}`;
}

function TarjetaNotificacion({ n, estilo = 'toast', onCerrar }) {
  const icono = ICONO_POR_TIPO[n.tipo] || ICONO_DEFAULT;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        background: icono.fondo,
        border: `1px solid ${icono.borde}`,
        borderRadius: '10px',
        padding: '10px 12px',
        boxShadow: estilo === 'toast' ? '0 4px 14px rgba(16,24,40,0.12)' : 'none',
        width: estilo === 'toast' ? '300px' : 'auto'
      }}
    >
      <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{icono.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <strong style={{ fontSize: '0.82rem', color: icono.color }}>{tituloPorTipo(n.tipo)}</strong>
          {estilo === 'historial' && (
            <span style={{ fontSize: '0.68rem', color: '#98a2b3', whiteSpace: 'nowrap' }}>
              {formatHoraCorta(n.created_at)}
            </span>
          )}
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#344054', lineHeight: 1.35 }}>
          {n.mensaje}
        </p>
      </div>
      {estilo === 'toast' && (
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#98a2b3',
            fontSize: '0.9rem', lineHeight: 1, padding: 0
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function NotificacionesBell() {
  const [noLeidas, setNoLeidas] = useState(0);
  const [historial, setHistorial] = useState([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [toasts, setToasts] = useState([]);
  const vistasIdsRef = useRef(new Set());
  const timersRef = useRef({});

  const quitarToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current[id];
    if (timer) { clearTimeout(timer); delete timersRef.current[id]; }
  };

  const revisar = async () => {
    await window.api.generarNotificaciones();
    const res = await window.api.listarNotificaciones();
    if (!res) return;
    setHistorial(res.notificaciones);
    setNoLeidas(res.noLeidas);

    // Solo se muestran como toast las no leidas que todavia no se hayan mostrado en esta sesion
    // (para no repetir el mismo aviso cada 30 minutos mientras el usuario sigue en Inicio).
    const nuevas = res.notificaciones.filter((n) => !n.leida && !vistasIdsRef.current.has(n.id));
    nuevas.forEach((n) => vistasIdsRef.current.add(n.id));
    if (nuevas.length > 0) {
      setToasts((prev) => [...nuevas, ...prev]);
      nuevas.forEach((n) => {
        // Se autodescartan solas a los 30 segundos si nadie las cierra ni navega antes.
        timersRef.current[n.id] = setTimeout(() => quitarToast(n.id), 30000);
      });
    }
  };

  // Cualquier click en el menu lateral (un boton final o abrir/cerrar un submenu) descarta de
  // inmediato todos los toasts flotantes -aunque el usuario se quede en Inicio, por ejemplo al
  // abrir el submenu de "Facturar" sin cambiar de pantalla-.
  useEffect(() => {
    const descartarTodos = () => {
      setToasts((prev) => {
        prev.forEach((t) => {
          const timer = timersRef.current[t.id];
          if (timer) { clearTimeout(timer); delete timersRef.current[t.id]; }
        });
        return [];
      });
    };
    window.addEventListener('movisync-dismiss-toasts', descartarTodos);
    return () => window.removeEventListener('movisync-dismiss-toasts', descartarTodos);
  }, []);

  useEffect(() => {
    revisar();
    const intervalo = setInterval(revisar, 30 * 60 * 1000);
    return () => {
      clearInterval(intervalo);
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirPanel = async () => {
    setPanelAbierto((v) => !v);
    if (!panelAbierto && noLeidas > 0) {
      await window.api.marcarNotificacionesLeidas();
      setNoLeidas(0);
      setHistorial((prev) => prev.map((n) => ({ ...n, leida: 1 })));
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={abrirPanel}
        aria-label="Notificaciones"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid #eaecf0',
          borderRadius: '50%',
          width: '38px',
          height: '38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.1rem',
          boxShadow: '0 1px 3px rgba(16,24,40,0.08)'
        }}
      >
        🔔
        {noLeidas > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#d92d20',
              color: '#fff',
              borderRadius: '999px',
              minWidth: '17px',
              height: '17px',
              fontSize: '0.65rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              border: '2px solid #f2f4f7'
            }}
          >
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {/* Toasts: se apilan debajo de la campana, cada uno se autodescarta al minuto. */}
      {toasts.length > 0 && (
        <div style={{ position: 'absolute', top: '46px', left: 0, zIndex: 40, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {toasts.map((t) => (
            <TarjetaNotificacion key={t.id} n={t} estilo="toast" onCerrar={() => quitarToast(t.id)} />
          ))}
        </div>
      )}

      {/* Panel de historial: las ultimas 2 semanas, con scroll propio. */}
      {panelAbierto && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 45 }}
            onClick={() => setPanelAbierto(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '46px',
              left: 0,
              zIndex: 46,
              width: '340px',
              maxHeight: '360px',
              background: '#fff',
              border: '1px solid #eaecf0',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(16,24,40,0.16)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef1f5', fontWeight: 700, fontSize: '0.85rem' }}>
              Notificaciones (últimas 2 semanas)
            </div>
            <div style={{ overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {historial.length === 0 && (
                <p style={{ color: '#98a2b3', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>
                  No hay notificaciones en este período.
                </p>
              )}
              {historial.map((n) => (
                <TarjetaNotificacion key={n.id} n={n} estilo="historial" />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
