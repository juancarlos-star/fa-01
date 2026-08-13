import React, { useEffect, useState, useCallback } from 'react';

export default function Configuracion() {
  const [form, setForm] = useState({
    tasa_cambio: '',
    iva_porcentaje: '',
    nombre_tienda: '',
    rif_tienda: '',
    moneda_principal: 'USD'
  });
  const [guardado, setGuardado] = useState(false);

  const cargar = useCallback(async () => {
    const data = await window.api.getSettings();
    setForm({
      tasa_cambio: data.tasa_cambio || '1',
      iva_porcentaje: data.iva_porcentaje || '16',
      nombre_tienda: data.nombre_tienda || '',
      rif_tienda: data.rif_tienda || '',
      moneda_principal: data.moneda_principal || 'USD'
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

        <button type="submit">Guardar configuracion</button>
        {guardado && <p style={{ color: 'green', marginTop: '8px' }}>Guardado correctamente</p>}
      </form>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '420px' }}>
        La tasa de cambio se usa para calcular el equivalente en bolivares de cada factura nueva.
        Actualizala cada vez que cambie el paralelo.
      </p>
    </div>
  );
}
