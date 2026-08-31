import React, { useEffect, useState, useCallback, useRef } from 'react';

const LOGO_MAX_BYTES = 400 * 1024; // 400KB

// "settings:update" en el backend hace un upsert por cada clave que se le mande (no reemplaza
// toda la configuracion), asi que cada seccion de aqui abajo puede guardar solo sus propios
// campos sin afectar los de las demas secciones.

// ---------------- 1) Datos de Tienda ----------------
function SeccionDatosTienda() {
  const [form, setForm] = useState({ nombre_tienda: '', rif_tienda: '', direccion_tienda: '', telefono_tienda: '' });
  const [logoBase64, setLogoBase64] = useState('');
  const [errorLogo, setErrorLogo] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const logoInputRef = useRef(null);

  useEffect(() => {
    window.api.getSettings().then((data) => {
      setForm({
        nombre_tienda: data.nombre_tienda || '',
        rif_tienda: data.rif_tienda || '',
        direccion_tienda: data.direccion_tienda || '',
        telefono_tienda: data.telefono_tienda || ''
      });
      setLogoBase64(data.logo_base64 || '');
    });
  }, []);

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

  return (
    <div>
      <h1>Datos de Tienda</h1>
      <form className="form-box" onSubmit={handleGuardar} style={{ maxWidth: '460px' }}>
        <label>Nombre de la tienda</label>
        <input value={form.nombre_tienda} onChange={handleChange('nombre_tienda')} />

        <label>RIF de la tienda</label>
        <input value={form.rif_tienda} onChange={handleChange('rif_tienda')} placeholder="J-12345678-9" />

        <label>Direccion de la tienda</label>
        <input value={form.direccion_tienda} onChange={handleChange('direccion_tienda')} placeholder="Av. Principal, local 3, Caracas" />

        <label>Telefono de la tienda</label>
        <input value={form.telefono_tienda} onChange={handleChange('telefono_tienda')} placeholder="0212-1234567 / 0414-1234567" />

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
    </div>
  );
}

// ---------------- 2) Cotización del día ----------------
// Unica seccion de Configuracion visible tambien para vendedores (no solo administradores),
// ya que necesitan poder actualizar la tasa del dia sin depender de un administrador.
function SeccionCotizacion() {
  const [tasaCambio, setTasaCambio] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  useEffect(() => {
    window.api.getSettings().then((data) => setTasaCambio(data.tasa_cambio || '1'));
  }, []);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setErrorGuardar('');
    const res = await window.api.updateSettings({ tasa_cambio: tasaCambio });
    if (res && res.ok === false) {
      setErrorGuardar(res.message || 'No se pudo guardar la tasa de cambio');
      return;
    }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div>
      <h1>Cotización del día</h1>
      <form className="form-box" onSubmit={handleGuardar} style={{ maxWidth: '360px' }}>
        <label>Tasa de cambio (1 USD = ? Bs)</label>
        <input type="number" step="0.01" value={tasaCambio} onChange={(e) => setTasaCambio(e.target.value)} />

        <button type="submit" style={{ marginTop: '14px' }}>Guardar configuracion</button>
        {guardado && <p style={{ color: 'green', marginTop: '8px' }}>Guardado correctamente</p>}
        {errorGuardar && <p style={{ color: '#b42318', marginTop: '8px' }}>{errorGuardar}</p>}
      </form>
    </div>
  );
}

// ---------------- 3) Configuración factura ----------------
function SeccionConfigFactura() {
  const [form, setForm] = useState({ iva_porcentaje: '', numero_factura_siguiente: '', pie_pagina_pdf: '' });
  const [guardado, setGuardado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  useEffect(() => {
    window.api.getSettings().then((data) => {
      setForm({
        iva_porcentaje: data.iva_porcentaje || '16',
        numero_factura_siguiente: data.numero_factura_siguiente || '1',
        pie_pagina_pdf: data.pie_pagina_pdf || ''
      });
    });
  }, []);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleGuardar = async (e) => {
    e.preventDefault();
    setErrorGuardar('');
    const res = await window.api.updateSettings(form);
    if (res && res.ok === false) {
      setErrorGuardar(res.message || 'No se pudo guardar la configuracion');
      return;
    }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  return (
    <div>
      <h1>Configuración factura</h1>
      <form className="form-box" onSubmit={handleGuardar} style={{ maxWidth: '460px' }}>
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

        <button type="submit" style={{ marginTop: '14px' }}>Guardar configuracion</button>
        {guardado && <p style={{ color: 'green', marginTop: '8px' }}>Guardado correctamente</p>}
        {errorGuardar && <p style={{ color: '#b42318', marginTop: '8px' }}>{errorGuardar}</p>}
      </form>
    </div>
  );
}

// ---------------- 4) Depósitos / almacenes ----------------
function SeccionDepositos() {
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

  // El deposito predeterminado es el que se preselecciona automaticamente en Facturacion,
  // Compras, Compras Telf/Acces, Cargos y Descargos, Traslados y Reportes. Solo puede haber uno
  // activado a la vez: al marcar uno, el backend apaga el resto (por eso alcanza con recargar
  // la lista despues de marcar). No se puede activar un deposito que este inactivo.
  const [guardandoPredeterminado, setGuardandoPredeterminado] = useState(false);
  const marcarPredeterminado = async (d) => {
    if (d.predeterminado || !d.activo || guardandoPredeterminado) return;
    setErrorDeposito('');
    setGuardandoPredeterminado(true);
    try {
      const res = await window.api.setDepositoPredeterminado(d.id);
      if (!res.ok) {
        setErrorDeposito(res.message || 'No se pudo marcar el deposito como predeterminado');
        return;
      }
      cargarDepositos();
    } finally {
      setGuardandoPredeterminado(false);
    }
  };

  return (
    <div>
      <h1>Depósitos / almacenes</h1>
      <div className="form-box" style={{ maxWidth: '680px' }}>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px' }}>
          Crea y nombra aquí los depósitos de tu negocio. Se usan automáticamente en Facturación,
          Compras, Compras Telf/Acces, Cargos y Descargos, e Inventario — no hace falta
          configurarlos en ningún otro lado. El depósito marcado como <strong>predeterminado</strong> es
          el que queda preseleccionado en todas esas pantallas (el usuario igual puede elegir otro
          desde el desplegable de cada una, de forma manual, en cualquier momento).
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '6px 4px' }}>Código</th>
              <th style={{ padding: '6px 4px' }}>Nombre</th>
              <th style={{ padding: '6px 4px' }}>Estado</th>
              <th style={{ padding: '6px 4px' }}>Predeterminado</th>
              <th style={{ padding: '6px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {depositos.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '10px 4px', color: '#98a2b3' }}>Aún no hay depósitos creados.</td></tr>
            )}
            {depositos.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eef0f3' }}>
                <td style={{ padding: '6px 4px' }}>{d.codigo}</td>
                <td style={{ padding: '6px 4px' }}>{d.nombre}</td>
                <td style={{ padding: '6px 4px' }}>
                  <span style={{ color: d.activo ? '#0b8f4e' : '#98a2b3' }}>{d.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <button
                    type="button"
                    onClick={() => marcarPredeterminado(d)}
                    disabled={!d.activo || guardandoPredeterminado}
                    title={
                      !d.activo
                        ? 'Un deposito inactivo no puede ser el predeterminado'
                        : (d.predeterminado ? 'Este es el deposito predeterminado' : 'Marcar como predeterminado')
                    }
                    style={{
                      width: '42px',
                      height: '22px',
                      borderRadius: '999px',
                      border: 'none',
                      padding: '2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: d.predeterminado ? 'flex-end' : 'flex-start',
                      cursor: !d.activo ? 'not-allowed' : (d.predeterminado ? 'default' : 'pointer'),
                      background: !d.activo ? '#e2e8f0' : (d.predeterminado ? '#0b8f4e' : '#cbd2d9'),
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        transition: 'all 0.15s ease'
                      }}
                    />
                  </button>
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

// ---------------- 5) Bases de datos ----------------
function SeccionBaseDatos() {
  const [mensajeBackup, setMensajeBackup] = useState('');

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

  // --- Copia de seguridad automatica + correo de resumen diario ---
  // Estado propio de esta seccion (no comparte el "form" de Datos de Tienda/Cotizacion/Factura)
  // porque son campos sin nada que ver con esos, igual que ya hace la seccion de Depositos.
  const [correo, setCorreo] = useState({ activo: false, destino: '', remitente: '', password: '' });
  const [cargandoCorreo, setCargandoCorreo] = useState(true);
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);
  const [probandoCorreo, setProbandoCorreo] = useState(false);
  const [mensajeCorreo, setMensajeCorreo] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);

  useEffect(() => {
    window.api.getSettings().then((data) => {
      setCorreo({
        activo: data.backup_email_activo === '1',
        destino: data.backup_email_destino || '',
        remitente: data.backup_email_remitente || '',
        password: data.backup_email_password || ''
      });
      setCargandoCorreo(false);
    });
  }, []);

  const handleGuardarCorreo = async (e) => {
    e.preventDefault();
    setMensajeCorreo('');
    setGuardandoCorreo(true);
    try {
      await window.api.updateSettings({
        backup_email_activo: correo.activo ? '1' : '0',
        backup_email_destino: correo.destino.trim(),
        backup_email_remitente: correo.remitente.trim(),
        backup_email_password: correo.password
      });
      setMensajeCorreo('✅ Configuración de correo guardada.');
    } finally {
      setGuardandoCorreo(false);
    }
  };

  const handleProbarCorreo = async () => {
    setMensajeCorreo('');
    setProbandoCorreo(true);
    try {
      const res = await window.api.enviarCorreoPrueba(correo.destino.trim(), correo.remitente.trim(), correo.password);
      setMensajeCorreo(res.ok ? '✅ Correo de prueba enviado. Revisa la bandeja de entrada (y spam) de ' + correo.destino : '❌ ' + res.message);
    } finally {
      setProbandoCorreo(false);
    }
  };

  // Envia el reporte del dia (respaldo + resumen + PDFs de cada documento) manualmente, con un
  // clic, sin tener que cerrar el programa — hace exactamente lo mismo que ya hace el cierre
  // automatico de MoviSync.
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const handleEnviarReporte = async () => {
    setMensajeCorreo('');
    setEnviandoReporte(true);
    try {
      const res = await window.api.enviarReporteManual();
      setMensajeCorreo(res.ok ? '✅ ' + res.message : '❌ ' + res.message);
    } finally {
      setEnviandoReporte(false);
    }
  };

  return (
    <div>
      <h1>Bases de datos</h1>
      <div className="form-box" style={{ maxWidth: '460px' }}>
        <h3 style={{ marginTop: 0 }}>Respaldo manual</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Guarda una copia de toda la informacion (inventario, clientes, facturas, gastos) en un archivo que puedes
          guardar en un USB o en la nube. Hazlo periodicamente.
        </p>
        <button type="button" onClick={handleBackup}>Crear respaldo</button>
        <button type="button" onClick={handleRestaurar} style={{ marginLeft: '8px' }}>Restaurar respaldo</button>
        {mensajeBackup && <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>{mensajeBackup}</p>}
      </div>

      <form className="form-box" onSubmit={handleGuardarCorreo} style={{ maxWidth: '460px', marginTop: '1.2rem' }}>
        <h3 style={{ marginTop: 0 }}>Copia de seguridad automática por correo</h3>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Cada vez que cierres MoviSync, se guarda automáticamente un respaldo local en tu carpeta
          "Documentos/MoviSync/Backups". Si activas esto además, en ese mismo cierre también se envía
          por correo un resumen (ventas, facturas e inventario del día) con el respaldo adjunto —
          cada vez que cierres el programa, sin límite de veces por día.
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={correo.activo}
            onChange={(e) => setCorreo({ ...correo, activo: e.target.checked })}
          />
          Enviar resumen y respaldo diario por correo
        </label>

        <label style={{ marginTop: '10px' }}>Correo de destino (a quién le llega el resumen)</label>
        <input
          type="email"
          value={correo.destino}
          onChange={(e) => setCorreo({ ...correo, destino: e.target.value })}
          placeholder="dueño@ejemplo.com"
        />

        <label>Correo remitente (cuenta de Gmail que envía)</label>
        <input
          type="email"
          value={correo.remitente}
          onChange={(e) => setCorreo({ ...correo, remitente: e.target.value })}
          placeholder="tunegocio@gmail.com"
        />

        <label>Contraseña de aplicación de Gmail</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type={mostrarPassword ? 'text' : 'password'}
            value={correo.password}
            onChange={(e) => setCorreo({ ...correo, password: e.target.value })}
            placeholder="xxxx xxxx xxxx xxxx"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => setMostrarPassword((v) => !v)}>{mostrarPassword ? 'Ocultar' : 'Ver'}</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#98a2b3', margin: '4px 0 0' }}>
          No es la contraseña normal de Gmail. Se genera en la cuenta de Google, en
          "Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones".
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={guardandoCorreo || cargandoCorreo}>
            {guardandoCorreo ? 'Guardando...' : 'Guardar configuración'}
          </button>
          <button type="button" onClick={handleProbarCorreo} disabled={probandoCorreo || cargandoCorreo}>
            {probandoCorreo ? 'Enviando...' : 'Enviar correo de prueba'}
          </button>
          <button type="button" onClick={handleEnviarReporte} disabled={enviandoReporte || cargandoCorreo}>
            {enviandoReporte ? 'Enviando reporte...' : 'Enviar reporte'}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#98a2b3', margin: '6px 0 0' }}>
          "Enviar reporte" manda ahora mismo el respaldo y el resumen del día por correo, igual que
          cuando cierras MoviSync, sin necesidad de cerrar el programa. Requiere que la configuración
          de correo de arriba esté guardada.
        </p>
        {mensajeCorreo && <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>{mensajeCorreo}</p>}
      </form>
    </div>
  );
}

export default function Configuracion({ seccion }) {
  switch (seccion) {
    case 'datosTienda': return <SeccionDatosTienda />;
    case 'cotizacion': return <SeccionCotizacion />;
    case 'factura': return <SeccionConfigFactura />;
    case 'depositos': return <SeccionDepositos />;
    case 'baseDatos': return <SeccionBaseDatos />;
    default: return <SeccionDatosTienda />;
  }
}
