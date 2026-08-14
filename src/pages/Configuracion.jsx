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
  const [mensajeBackup, setMensajeBackup] = useState('');

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

  const handleBackup = async () => {
    setMensajeBackup('');
    const res = await window.api.crearBackup();
    if (!res.ok) {
      if (res.message !== 'Cancelado') setMensajeBackup('Error al crear el respaldo: ' + res.message);
      return;
    }
    setMensajeBackup('Respaldo guardado en: ' + res.path);
  };

  const handleRestaurar = async () => {
    if (!confirm('Esto reemplaza toda la base de datos actual por la del respaldo. ¿Continuar?')) return;
    const res = await window.api.restaurarBackup();
    if (!res.ok) {
      if (res.message !== 'Cancelado') setMensajeBackup('Error al restaurar: ' + res.message);
      return;
    }
    setMensajeBackup(res.mensaje);
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

      <div className="form-box" style={{ maxWidth: '420px', marginTop: '1.5rem' }}>
        <h3>Respaldo de base de datos</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Guarda una copia de toda la informacion (inventario, clientes, facturas, gastos) en un archivo que puedes
          guardar en un USB o en la nube. Hazlo periodicamente.
        </p>
        <button type="button" onClick={handleBackup}>Crear respaldo</button>
        <button type="button" onClick={handleRestaurar} style={{ marginLeft: '8px' }}>Restaurar respaldo</button>
        {mensajeBackup && <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>{mensajeBackup}</p>}
      </div>
    </div>
  );
}
