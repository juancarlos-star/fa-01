import React, { useEffect, useState, useCallback } from 'react';

export default function Configuracion() {
  const [form, setForm] = useState({
    tasa_cambio: '',
    iva_porcentaje: '',
    nombre_tienda: '',
    rif_tienda: '',
    numero_factura_siguiente: ''
  });
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    const data = await window.api.getSettings();
    setForm({
      tasa_cambio: data.tasa_cambio || '1',
      iva_porcentaje: data.iva_porcentaje || '16',
      nombre_tienda: data.nombre_tienda || '',
      rif_tienda: data.rif_tienda || '',
      numero_factura_siguiente: data.numero_factura_siguiente || '1'
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleGuardar = async (e) => {
    e.preventDefault();
    await window.api.updateSettings(form);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div>
      <h1>Configuracion</h1>
      <form className="form-box" onSubmit={handleGuardar} style={{ maxWidth: '420px' }}>
        <label>Nombre de la tienda</label>
        <input value={form.nombre_tienda} onChange={handleChange('nombre_tienda')} />

        <label>RIF de la tienda</label>
        <input value={form.rif_tienda} onChange={handleChange('rif_tienda')} placeholder="J-12345678-9" />

        <label>Tasa de cambio (1 USD = ? Bs)</label>
        <input type="number" step="0.01" value={form.tasa_cambio} onChange={handleChange('tasa_cambio')} />

        <label>IVA (%)</label>
        <input type="number" step="0.01" value={form.iva_porcentaje} onChange={handleChange('iva_porcentaje')} />

        <label>Proximo numero de factura</label>
        <input type="number" min="1" value={form.numero_factura_siguiente} onChange={handleChange('numero_factura_siguiente')} />

        <button type="submit">Guardar configuracion</button>
        {guardado && <p style={{ color: 'green', marginTop: '8px' }}>Guardado correctamente</p>}
      </form>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '420px' }}>
        El "Proximo numero de factura" debe coincidir con el numero que ya viene impreso en tu papeleria.
        Cambialo solo si necesitas sincronizarlo (ej: al cambiar de talonario). El sistema lo va a subir solo despues de cada factura.
      </p>
    </div>
  );
}
