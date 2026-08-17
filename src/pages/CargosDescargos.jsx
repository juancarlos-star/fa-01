import React, { useState, useEffect, useCallback } from 'react';
import PromptModal from '../components/PromptModal.jsx';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Cards' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

export default function CargosDescargos({ currentUser }) {
  const [tab, setTab] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [accion, setAccion] = useState('cargo'); // 'cargo' | 'descargo'

  const esAccesorio = tab === 'accesorio';
  const permiteRango = tab === 'simcard' || tab === 'usim';
  const producto = productos.find((p) => p.id === Number(productoId));

  const cargarProductos = useCallback(async () => {
    const data = await window.api.listProducts(tab);
    setProductos(data);
    setProductoId('');
  }, [tab]);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);
  useEffect(() => { setAccion('cargo'); }, [tab]);

  return (
    <div>
      <h1>Cargos y Descargos de inventario</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '650px' }}>
        Todo ingreso o baja de stock fuera de una compra formal a proveedor (modulo Compras) se hace aqui.
        Solo el administrador tiene acceso a este modulo.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        {TIPOS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: tab === t.key ? 'bold' : 'normal',
              backgroundColor: tab === t.key ? '#0b4f9e' : '#e2e8f0',
              color: tab === t.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="form-box" style={{ maxWidth: '500px' }}>
        <label>Producto</label>
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">-- Selecciona --</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} (stock: {p.stock_disponible})
            </option>
          ))}
        </select>

        {productoId && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setAccion('cargo')}
              style={{
                padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                backgroundColor: accion === 'cargo' ? '#027a48' : '#e2e8f0', color: accion === 'cargo' ? '#fff' : '#111'
              }}
            >
              Cargo (agregar stock)
            </button>
            <button
              type="button"
              onClick={() => setAccion('descargo')}
              style={{
                padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                backgroundColor: accion === 'descargo' ? '#b42318' : '#e2e8f0', color: accion === 'descargo' ? '#fff' : '#111'
              }}
            >
              Descargo (dar de baja)
            </button>
          </div>
        )}
      </div>

      {productoId && esAccesorio && accion === 'cargo' && (
        <CargoAccesorio productId={producto.id} currentUser={currentUser} onDone={cargarProductos} />
      )}
      {productoId && esAccesorio && accion === 'descargo' && (
        <DescargoAccesorio productId={producto.id} stockActual={producto.stock_disponible} currentUser={currentUser} onDone={cargarProductos} />
      )}
      {productoId && !esAccesorio && accion === 'cargo' && (
        <CargoUnidades productId={producto.id} tipo={tab} permiteRango={permiteRango} currentUser={currentUser} onDone={cargarProductos} />
      )}
      {productoId && !esAccesorio && accion === 'descargo' && (
        <DescargoUnidades productId={producto.id} tipo={tab} permiteRango={permiteRango} currentUser={currentUser} onDone={cargarProductos} />
      )}
    </div>
  );
}

// ---------------- Accesorios: cargo (cantidad) ----------------

function CargoAccesorio({ productId, currentUser, onDone }) {
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [comprobante, setComprobante] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobante(null);
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setError('Cantidad invalida'); return; }
    const costo = parseFloat(costoUnitario);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo unitario'); return; }
    const res = await window.api.addProductStock(productId, n, costo, currentUser?.username);
    if (!res.ok) { setError(res.message); return; }
    setOk(`Cargo registrado. Nuevo stock: ${res.stock}`);
    setCantidad(''); setCostoUnitario('');
    setComprobante(res.registro || null);
    onDone();
  };

  if (comprobante) {
    return <CargoDescargoDetalle registro={comprobante} tipoDocumento="cargo" onVolver={() => setComprobante(null)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="form-box" style={{ maxWidth: '400px' }}>
      <h3>Cargo de accesorio</h3>
      <label>Cantidad a ingresar</label>
      <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
      <label>Costo unitario de esta compra (USD)</label>
      <input type="number" step="0.01" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {ok && <p style={{ color: 'green' }}>{ok}</p>}
      <button type="submit" style={{ marginTop: '0.5rem' }}>Registrar cargo</button>
    </form>
  );
}

// ---------------- Accesorios: descargo (cantidad + motivo) ----------------

function DescargoAccesorio({ productId, stockActual, currentUser, onDone }) {
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [comprobante, setComprobante] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobante(null);
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setError('Cantidad invalida'); return; }
    if (!motivo.trim()) { setError('Indica el motivo del descargo'); return; }
    const res = await window.api.writeOffProductStock(productId, n, motivo.trim(), currentUser?.username);
    if (!res.ok) { setError(res.message); return; }
    setOk(`Descargo registrado. Nuevo stock: ${res.stock}`);
    setCantidad(''); setMotivo('');
    setComprobante(res.registro || null);
    onDone();
  };

  if (comprobante) {
    return <CargoDescargoDetalle registro={comprobante} tipoDocumento="descargo" onVolver={() => setComprobante(null)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="form-box" style={{ maxWidth: '400px' }}>
      <h3>Descargo de accesorio</h3>
      <p style={{ fontSize: '0.85rem', color: '#666' }}>Stock disponible actual: {stockActual}</p>
      <label>Cantidad a descargar</label>
      <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
      <label>Motivo (ej: dañado, perdido, robado)</label>
      <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} style={{ width: '100%' }} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {ok && <p style={{ color: 'green' }}>{ok}</p>}
      <button type="submit" style={{ marginTop: '0.5rem' }}>Registrar descargo</button>
    </form>
  );
}

// ---------------- Equipo/SimCard/USIM: cargo (manual o por rango) ----------------

function CargoUnidades({ productId, tipo, permiteRango, currentUser, onDone }) {
  const [modo, setModo] = useState('manual');
  const [codigo, setCodigo] = useState('');
  const [costoManual, setCostoManual] = useState('');
  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [costoRango, setCostoRango] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [comprobante, setComprobante] = useState(null); // comprobante de un cargo manual individual
  const [comprobantesRango, setComprobantesRango] = useState([]); // comprobantes generados por el ultimo cargo por rango
  const [comprobanteRangoAbierto, setComprobanteRangoAbierto] = useState(null);

  const label = tipo === 'equipo' ? 'IMEI' : tipo === 'usim' ? 'Codigo USIM' : 'Codigo SIM (ICCID)';

  const handleAgregarManual = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobante(null);
    if (!codigo.trim()) { setError('Escribe o escanea el codigo'); return; }
    const costo = parseFloat(costoManual);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo de compra'); return; }
    setEnviando(true);
    try {
      const res = await window.api.addUnit(productId, codigo.trim(), costo, currentUser?.username);
      if (!res.ok) { setError(res.message); return; }
      setOk(`${label} agregado correctamente`);
      setCodigo('');
      setComprobante(res.registro || null);
      onDone();
    } finally {
      setEnviando(false);
    }
  };

  const handleAgregarRango = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobantesRango([]);
    if (!codigoInicio.trim() || !codigoFin.trim()) { setError('Escanea o escribe el primer y el ultimo codigo de la caja'); return; }
    const costo = parseFloat(costoRango);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo unitario de este lote'); return; }
    setEnviando(true);
    try {
      const res = await window.api.addUnitsRange(productId, codigoInicio.trim(), codigoFin.trim(), costo, currentUser?.username);
      if (!res.ok) { setError(res.message); return; }
      setOk(`Rango procesado: ${res.total} codigos. Agregados: ${res.agregados}. Ya existian (saltados): ${res.saltados}.`);
      setCodigoInicio(''); setCodigoFin(''); setCostoRango('');
      setComprobantesRango(res.registros || []);
      onDone();
    } finally {
      setEnviando(false);
    }
  };

  if (comprobante) {
    return <CargoDescargoDetalle registro={comprobante} tipoDocumento="cargo" onVolver={() => setComprobante(null)} />;
  }

  if (comprobanteRangoAbierto) {
    return (
      <CargoDescargoDetalle
        registro={comprobanteRangoAbierto}
        tipoDocumento="cargo"
        onVolver={() => setComprobanteRangoAbierto(null)}
      />
    );
  }

  return (
    <div className="form-box" style={{ maxWidth: '520px' }}>
      <h3>Cargo de {label}</h3>
      {permiteRango && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button type="button" onClick={() => { setModo('manual'); setComprobantesRango([]); }}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: modo === 'manual' ? '#0b4f9e' : '#e2e8f0', color: modo === 'manual' ? '#fff' : '#111' }}>
            Manual (pistola, uno por uno)
          </button>
          <button type="button" onClick={() => { setModo('rango'); setComprobantesRango([]); }}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: modo === 'rango' ? '#0b4f9e' : '#e2e8f0', color: modo === 'rango' ? '#fff' : '#111' }}>
            Por rango (primer y ultimo codigo de la caja)
          </button>
        </div>
      )}

      {modo === 'manual' && (
        <form onSubmit={handleAgregarManual} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>{label}</label><br />
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Costo de compra (USD)</label><br />
            <input type="number" step="0.01" value={costoManual} onChange={(e) => setCostoManual(e.target.value)} style={{ width: '100px' }} />
          </div>
          <button type="submit" disabled={enviando}>+ Agregar {label}</button>
        </form>
      )}

      {modo === 'rango' && permiteRango && (
        <form onSubmit={handleAgregarRango} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Primer codigo de la caja</label><br />
            <input placeholder="Ej: 190000" value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Ultimo codigo de la caja</label><br />
            <input placeholder="Ej: 190050" value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Costo unitario del lote (USD)</label><br />
            <input type="number" step="0.01" value={costoRango} onChange={(e) => setCostoRango(e.target.value)} style={{ width: '100px' }} />
          </div>
          <button type="submit" disabled={enviando}>Generar rango completo</button>
        </form>
      )}

      {error && <p style={{ color: 'red', fontSize: '0.85rem' }}>{error}</p>}
      {ok && <p style={{ color: 'green', fontSize: '0.85rem' }}>{ok}</p>}

      {comprobantesRango.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.4rem 0' }}>
            Comprobantes generados ({comprobantesRango.length}):
          </p>
          <ul style={{ listStyle: 'none', padding: 0, maxHeight: '220px', overflowY: 'auto' }}>
            {comprobantesRango.map((r) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #eee' }}>
                <span>{r.unidad_codigo || `#${r.secuencia ?? r.id}`}</span>
                <button type="button" onClick={() => setComprobanteRangoAbierto(r)}>Ver comprobante</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------- Equipo/SimCard/USIM: descargo (manual, seleccion, o por rango) ----------------

function DescargoUnidades({ productId, tipo, permiteRango, currentUser, onDone }) {
  const [modo, setModo] = useState('manual');
  const [units, setUnits] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [modalBaja, setModalBaja] = useState(null);

  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [motivoRango, setMotivoRango] = useState('');
  const [enviandoRango, setEnviandoRango] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { bloqueado, invalidos, validosCount, total } | { ok con dadosDeBaja }
  const [comprobante, setComprobante] = useState(null); // comprobante de una baja manual individual
  const [comprobantesRango, setComprobantesRango] = useState([]); // comprobantes generados por el ultimo descargo por rango
  const [comprobanteRangoAbierto, setComprobanteRangoAbierto] = useState(null); // uno de comprobantesRango, mientras se ve/imprime

  const label = tipo === 'equipo' ? 'IMEI' : tipo === 'usim' ? 'Codigo USIM' : 'Codigo SIM (ICCID)';

  const cargarUnidades = useCallback(async () => {
    setCargando(true);
    const data = await window.api.listUnits(productId);
    setUnits(data.filter((u) => u.estado === 'disponible'));
    setCargando(false);
  }, [productId]);

  useEffect(() => { cargarUnidades(); }, [cargarUnidades]);

  const abrirModalBaja = (unitId) => setModalBaja({ unitId });
  const confirmarBajaManual = async (values) => {
    const res = await window.api.writeOffUnit(modalBaja.unitId, values.motivo, currentUser?.username);
    if (!res.ok) { alert(res.message); return; }
    setModalBaja(null);
    cargarUnidades();
    setComprobante(res.registro || null);
    onDone();
  };

  const ejecutarDescargoRango = async (soloValidos) => {
    setError(''); setComprobantesRango([]);
    if (!codigoInicio.trim() || !codigoFin.trim()) { setError('Escanea o escribe el primer y el ultimo codigo de la caja'); return; }
    if (!motivoRango.trim()) { setError('Indica el motivo del descargo'); return; }
    if (!window.confirm('¿Seguro que deseas dar de baja el rango completo? Esta accion no se puede deshacer.')) return;
    setEnviandoRango(true);
    try {
      const res = await window.api.writeOffUnitRange({
        product_id: productId,
        codigoInicio: codigoInicio.trim(),
        codigoFin: codigoFin.trim(),
        motivo: motivoRango.trim(),
        usuario: currentUser?.username,
        soloValidos
      });
      if (!res.ok && res.bloqueado) {
        setResultado(res);
        return;
      }
      if (!res.ok) { setError(res.message); return; }
      setResultado(res);
      setCodigoInicio(''); setCodigoFin(''); setMotivoRango('');
      setComprobantesRango(res.registros || []);
      cargarUnidades();
      onDone();
    } finally {
      setEnviandoRango(false);
    }
  };

  if (comprobante) {
    return <CargoDescargoDetalle registro={comprobante} tipoDocumento="descargo" onVolver={() => setComprobante(null)} />;
  }

  if (comprobanteRangoAbierto) {
    return (
      <CargoDescargoDetalle
        registro={comprobanteRangoAbierto}
        tipoDocumento="descargo"
        onVolver={() => setComprobanteRangoAbierto(null)}
      />
    );
  }

  return (
    <div className="form-box" style={{ maxWidth: '600px' }}>
      <h3>Descargo de {label}</h3>

      {permiteRango && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button type="button" onClick={() => { setModo('manual'); setResultado(null); setError(''); setComprobantesRango([]); }}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: modo === 'manual' ? '#0b4f9e' : '#e2e8f0', color: modo === 'manual' ? '#fff' : '#111' }}>
            Manual (elegir uno por uno)
          </button>
          <button type="button" onClick={() => { setModo('rango'); setResultado(null); setError(''); setComprobantesRango([]); }}
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: modo === 'rango' ? '#0b4f9e' : '#e2e8f0', color: modo === 'rango' ? '#fff' : '#111' }}>
            Por rango (primer y ultimo codigo)
          </button>
        </div>
      )}

      {modo === 'manual' && (
        cargando ? <p>Cargando...</p> : units.length === 0 ? (
          <p>No hay unidades disponibles para dar de baja.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, maxHeight: '260px', overflowY: 'auto' }}>
            {units.map((u) => (
              <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #eee' }}>
                <span>{u.codigo}</span>
                <button onClick={() => abrirModalBaja(u.id)}>Dar de baja</button>
              </li>
            ))}
          </ul>
        )
      )}

      {modo === 'rango' && permiteRango && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Primer codigo de la caja</label><br />
              <input placeholder="Ej: 190000" value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Ultimo codigo de la caja</label><br />
              <input placeholder="Ej: 190050" value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} />
            </div>
          </div>
          <label style={{ fontSize: '0.8rem' }}>Motivo del descargo</label>
          <textarea value={motivoRango} onChange={(e) => setMotivoRango(e.target.value)} rows={2} style={{ width: '100%' }} />
          <button type="button" onClick={() => ejecutarDescargoRango(false)} disabled={enviandoRango} style={{ marginTop: '0.5rem' }}>
            {enviandoRango ? 'Procesando...' : 'Dar de baja el rango completo'}
          </button>

          {resultado?.bloqueado && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#fff5f5', border: '1px solid #f3c8c8', borderRadius: '6px' }}>
              <p style={{ color: '#b42318', fontWeight: 'bold', margin: '0 0 0.4rem 0' }}>{resultado.message}</p>
              <p style={{ fontSize: '0.85rem', margin: '0 0 0.4rem 0' }}>
                {resultado.validosCount} de {resultado.total} codigos si estan disponibles para dar de baja.
              </p>
              <ul style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '0.8rem' }}>
                {resultado.invalidos.map((inv) => (
                  <li key={inv.codigo}>{inv.codigo} — {inv.razon}</li>
                ))}
              </ul>
              {resultado.validosCount > 0 && (
                <button type="button" onClick={() => ejecutarDescargoRango(true)} disabled={enviandoRango}>
                  Continuar solo con los {resultado.validosCount} codigos validos
                </button>
              )}
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                O corrige el rango, o usa la pestaña "Manual" para dar de baja uno por uno.
              </p>
            </div>
          )}

          {resultado && !resultado.bloqueado && resultado.dadosDeBaja !== undefined && (
            <p style={{ color: 'green', marginTop: '0.5rem' }}>
              Descargo aplicado a {resultado.dadosDeBaja} de {resultado.total} codigos
              {resultado.saltados > 0 ? ` (${resultado.saltados} saltados por no estar disponibles).` : '.'}
            </p>
          )}

          {comprobantesRango.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.4rem 0' }}>
                Comprobantes generados ({comprobantesRango.length}):
              </p>
              <ul style={{ listStyle: 'none', padding: 0, maxHeight: '220px', overflowY: 'auto' }}>
                {comprobantesRango.map((r) => (
                  <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #eee' }}>
                    <span>{r.unidad_codigo || `#${r.secuencia ?? r.id}`}</span>
                    <button type="button" onClick={() => setComprobanteRangoAbierto(r)}>Ver comprobante</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: 'red', fontSize: '0.85rem' }}>{error}</p>}

      {modalBaja && (
        <PromptModal
          title="Dar de baja (descargo)"
          fields={[{ name: 'motivo', label: 'Motivo (ej: dañado, perdido, robado)', type: 'textarea', required: true, autoFocus: true }]}
          onConfirm={confirmarBajaManual}
          onCancel={() => setModalBaja(null)}
        />
      )}
    </div>
  );
}
