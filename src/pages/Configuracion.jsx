import React, { useEffect, useState, useCallback, useRef } from 'react';

const LOGO_MAX_BYTES = 400 * 1024; // 400KB

export default function Configuracion() {
  const [depositos, setDepositos] = useState([]);
  const [formDeposito, setFormDeposito] = useState({ codigo: '', nombre: '' });
  const [editandoDepositoId, setEditandoDepositoId] = useState(null);
  const [errorDeposito, setErrorDeposito] = useState('');
  const [guardandoDeposito, setGuardandoDeposito] = useState(false);

  const cargarDepositos = useCallback(async () => {
    const data = await window.api.listDepositos(false);
    setDepositos(data);
  }, []);

  useEffect(() => { cargarDepositos(); }, [cargarDepositos]);

  const iniciarNuevoDeposito = () => {
    setEditandoDepositoId(null);
    setFormDeposito({ codigo: '', nombre: '' });
    setErrorDeposito('');
  };

  const iniciarEdicionDeposito = (d) => {
    setEditandoDepositoId(d.id);
    setFormDeposito({ codigo: d.codigo, nombre: d.nombre });
    setErrorDeposito('');
  };

  const guardarDeposito = async (e) => {
    e.preventDefault();
    setErrorDeposito('');
    setGuardandoDeposito(true);
    try {
      const res = editandoDepositoId
        ? await window.api.updateDeposito(editandoDepositoId, formDeposito)
        : await window.api.createDeposito(formDeposito);
      if (!res.ok) {
        setErrorDeposito(res.message || 'No se pudo guardar el deposito');
        return;
      }
      iniciarNuevoDeposito();
      cargarDepositos();
    } finally {
      setGuardandoDeposito(false);
    }
  };

  const toggleActivoDeposito = async (d) => {
    const res = await window.api.toggleDepositoActive(d.id);
    if (!res.ok) {
      setErrorDeposito(res.message || 'No se pudo cambiar el estado del deposito');
      return;
    }
    cargarDepositos();
  };

  const [form, setForm] = useState({
    tasa_cambio: '',
    iva_porcentaje: '',
    nombre_tienda: '',
    rif_tienda: '',
    direccion_tienda: '',
    telefono_tienda: '',
    pie_pagina_pdf: '',
    numero_factura_siguiente: ''
  });
  const [logoBase64, setLogoBase64] = useState('');
  const [errorLogo, setErrorLogo] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [mensajeBackup, setMensajeBackup] = useState('');
  const logoInputRef = useRef(null);

  const cargar = useCallback(async () => {
    const data = await window.api.getSettings();
    setForm({
      tasa_cambio: data.tasa_cambio || '1',
      iva_porcentaje: data.iva_porcentaje || '16',
      nombre_tienda: data.nombre_tienda || '',
      rif_tienda: data.rif_tienda || '',
      direccion_tienda: data.direccion_tienda || '',
      telefono_tienda: data.telefono_tienda || '',
      pie_pagina_pdf: data.pie_pagina_pdf || '',
      numero_factura_siguiente: data.numero_factura_siguiente || '1'
    });
    setLogoBase64(data.logo_base64 || '');
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleLogoChange = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorLogo('');
    if (!['image/png', 'image/jpeg'].includes(archivo.type)) {
      setErrorLogo('El logo debe ser una imagen PNG o JPG');
      e.target.value = '';
      return;
    }
    if (archivo.size > LOGO_MAX_BYTES) {
      setErrorLogo(`La imagen pesa ${Math.round(archivo.size / 1024)}KB. El maximo permitido es 400KB.`);
      e.target.value = '';
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setLogoBase64(lector.result);
    lector.onerror = () => setErrorLogo('No se pudo leer la imagen. Intenta con otro archivo.');
    lector.readAsDataURL(archivo);
  };

  const quitarLogo = () => {
    setLogoBase64('');
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setErrorGuardar('');
    const res = await window.api.updateSettings({ ...form, logo_base64: logoBase64 });
    if (res && res.ok === false) {
      setErrorGuardar(res.message || 'No se pudo guardar la configuracion');
      return;
    }
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
      <form className="form-box" onSubmit={handleGuardar} style={{ maxWidth: '460px' }}>
        <label>Nombre de la tienda</label>
        <input value={form.nombre_tienda} onChange={handleChange('nombre_tienda')} />

        <label>RIF de la tienda</label>
        <input value={form.rif_tienda} onChange={handleChange('rif_tienda')} placeholder="J-12345678-9" />

        <label>Direccion de la tienda</label>
        <input value={form.direccion_tienda} onChange={handleChange('direccion_tienda')} placeholder="Av. Principal, local 3, Caracas" />

        <label>Telefono de la tienda</label>
        <input value={form.telefono_tienda} onChange={handleChange('telefono_tienda')} placeholder="0212-1234567 / 0414-1234567" />

        <label>Tasa de cambio (1 USD = ? Bs)</label>
        <input type="number" step="0.01" value={form.tasa_cambio} onChange={handleChange('tasa_cambio')} />

        <label>IVA (%)</label>
        <input type="number" step="0.01" value={form.iva_porcentaje} onChange={handleChange('iva_porcentaje')} />

        <label>Proximo numero de factura</label>
        <input type="number" min="1" value={form.numero_factura_siguiente} onChange={handleChange('numero_factura_siguiente')} />

        <label>Pie de pagina para facturas y comprobantes (opcional)</label>
        <textarea
          rows={3}
          value={form.pie_pagina_pdf}
          onChange={handleChange('pie_pagina_pdf')}
          placeholder="Ej: Garantia de 30 dias presentando esta factura. Gracias por su compra."
          style={{ fontFamily: 'inherit', fontSize: '0.95rem', padding: '8px' }}
        />

        <label style={{ marginTop: '10px' }}>Logo (PNG o JPG, maximo 400KB)</label>
        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} />
        {errorLogo && <p style={{ color: '#b42318', fontSize: '0.85rem', margin: '4px 0' }}>{errorLogo}</p>}
        {logoBase64 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <img src={logoBase64} alt="Logo de la tienda" style={{ maxHeight: '70px', maxWidth: '160px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px', background: '#fff' }} />
            <button type="button" onClick={quitarLogo} style={{ color: '#b42318' }}>Quitar logo</button>
          </div>
        )}

        <button type="submit" style={{ marginTop: '14px' }}>Guardar configuracion</button>
        {guardado && <p style={{ color: 'green', marginTop: '8px' }}>Guardado correctamente</p>}
        {errorGuardar && <p style={{ color: '#b42318', marginTop: '8px' }}>{errorGuardar}</p>}
      </form>

      <div className="form-box" style={{ maxWidth: '460px', marginTop: '1.5rem' }}>
        <h3>Respaldo de base de datos</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Guarda una copia de toda la informacion (inventario, clientes, facturas, gastos) en un archivo que puedes
          guardar en un USB o en la nube. Hazlo periodicamente.
        </p>
        <button type="button" onClick={handleBackup}>Crear respaldo</button>
        <button type="button" onClick={handleRestaurar} style={{ marginLeft: '8px' }}>Restaurar respaldo</button>
        {mensajeBackup && <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>{mensajeBackup}</p>}
      </div>

      <div className="form-box" style={{ maxWidth: '620px', marginTop: '1.5rem' }}>
        <h3>Depósitos / almacenes</h3>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px' }}>
          Crea y nombra aquí los depósitos de tu negocio. Se usan automáticamente en Facturación,
          Compras, Compras Telf/Acces, Cargos y Descargos, e Inventario — no hace falta
          configurarlos en ningún otro lado.
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '6px 4px' }}>Código</th>
              <th style={{ padding: '6px 4px' }}>Nombre</th>
              <th style={{ padding: '6px 4px' }}>Estado</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {depositos.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '10px 4px', color: '#98a2b3' }}>Aún no hay depósitos creados.</td></tr>
            )}
            {depositos.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eef0f3' }}>
                <td style={{ padding: '6px 4px' }}>{d.codigo}</td>
                <td style={{ padding: '6px 4px' }}>{d.nombre}</td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{ color: d.activo ? '#0b8f4e' : '#98a2b3' }}>{d.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => iniciarEdicionDeposito(d)} style={{ marginRight: '6px' }}>
                    ✎ Editar
                  </button>
                  <button type="button" onClick={() => toggleActivoDeposito(d)}>
                    {d.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={guardarDeposito} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem' }}>Código</label>
            <input
              value={formDeposito.codigo}
              onChange={(e) => setFormDeposito({ ...formDeposito, codigo: e.target.value })}
              placeholder="Ej: 01"
              style={{ width: '90px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem' }}>Nombre</label>
            <input
              value={formDeposito.nombre}
              onChange={(e) => setFormDeposito({ ...formDeposito, nombre: e.target.value })}
              placeholder="Ej: Principal"
              style={{ width: '200px' }}
            />
          </div>
          <button type="submit" disabled={guardandoDeposito}>
            {guardandoDeposito ? 'Guardando...' : (editandoDepositoId ? 'Guardar cambios' : '+ Agregar depósito')}
          </button>
          {editandoDepositoId && (
            <button type="button" onClick={iniciarNuevoDeposito}>Cancelar</button>
          )}
        </form>
        {errorDeposito && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '8px' }}>{errorDeposito}</p>}
      </div>
    </div>
  );
}
