import React from 'react';

// Confirmacion dentro de la propia ventana, sin usar window.confirm() nativo.
// Los dialogos nativos (confirm/alert) hacen que Windows le quite la activacion de teclado
// a la ventana de Electron, y no siempre se recupera automaticamente aunque se le pida al
// proceso principal que haga foco. Al ser un componente normal de React, nunca se pierde el
// foco del sistema operativo, y los campos que dependan de recibir foco despues de confirmar
// (como el recuadro de escaneo en Compras) siguen funcionando sin trucos.
export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Si, continuar', danger = true }) {
  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <p style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              backgroundColor: danger ? '#b42318' : '#0b4f9e', color: '#fff',
              border: 'none', padding: '0.4rem 0.9rem', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};

const boxStyle = {
  background: '#fff', padding: '1.25rem', borderRadius: '8px', width: '340px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
};
