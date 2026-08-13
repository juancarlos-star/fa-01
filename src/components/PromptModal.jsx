import React, { useState } from 'react';

export default function PromptModal({ title, fields, onConfirm, onCancel }) {
  const [values, setValues] = useState(
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue || '' }), {})
  );
  const [error, setError] = useState('');

  const handleChange = (name) => (e) => setValues({ ...values, [name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    for (const f of fields) {
      if (f.required && !String(values[f.name] || '').trim()) {
        setError(`El campo "${f.label}" es obligatorio`);
        return;
      }
    }
    onConfirm(values);
  };

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <form onSubmit={handleSubmit}>
          {fields.map((f) => (
            <div key={f.name} style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.name]}
                  onChange={handleChange(f.name)}
                  rows={3}
                  style={{ width: '100%', padding: '6px' }}
                  autoFocus={f.autoFocus}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  value={values[f.name]}
                  onChange={handleChange(f.name)}
                  style={{ width: '100%', padding: '6px' }}
                  autoFocus={f.autoFocus}
                />
              )}
            </div>
          ))}
          {error && <p style={{ color: 'red', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel}>Cancelar</button>
            <button type="submit">Confirmar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const boxStyle = {
  background: '#fff',
  padding: '1.5rem',
  borderRadius: '8px',
  width: '360px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
};
