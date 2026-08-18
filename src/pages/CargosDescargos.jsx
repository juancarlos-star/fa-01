import React, { useState, useEffect, useCallback } from 'react';
import PromptModal from '../components/PromptModal.jsx';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import { generarCargoDescargoPDF, generarCargoDescargoLotePDF } from '../utils/generarCargoDescargoPDF.js';

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
  const [settings, setSettings] = useState(null);

  // Producto pendiente de seleccionar en cuanto termine de cargar la lista de la pestaña
  // correspondiente (usado por el buscador de IMEI/codigo, que puede cambiar de pestaña).
  const [productoIdPendiente, setProductoIdPendiente] = useState(null);
  // Codigo encontrado por el buscador, para pre-filtrar la lista de unidades a descargar.
  const [codigoResaltado, setCodigoResaltado] = useState('');

  // ---- Buscador por IMEI / codigo / codigo de barras ----
  const [busquedaCodigo, setBusquedaCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');

  const esAccesorio = tab === 'accesorio';
  const permiteRango = tab === 'simcard' || tab === 'usim';
  const producto = productos.find((p) => p.id === Number(productoId));

  const cargarProductos = useCallback(async () => {
    const data = await window.api.listProducts(tab);
    setProductos(data);
    // Si hay un producto pendiente de seleccionar (venido del buscador de codigo), no se
    // limpia aqui: lo selecciona el efecto de abajo en cuanto aparezca en la lista recien
    // cargada. En cualquier otro caso (cambio manual de pestaña), se limpia la seleccion.
    setProductoId((actual) => {
      const idsDisponibles = data.map((p) => p.id);
      if (idsDisponibles.includes(Number(actual))) return actual;
      return '';
    });
  }, [tab]);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);
  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  // En cuanto la lista de productos de la pestaña activa incluya el producto que encontro el
  // buscador, se selecciona automaticamente (sin esto, cargarProductos() lo pisaria con '').
  useEffect(() => {
    if (productoIdPendiente != null && productos.some((p) => p.id === productoIdPendiente)) {
      setProductoId(String(productoIdPendiente));
      setProductoIdPendiente(null);
    }
  }, [productos, productoIdPendiente]);

  const seleccionarTab = (key) => {
    setTab(key);
    setAccion('cargo');
    setProductoIdPendiente(null);
    setCodigoResaltado('');
    setErrorBusqueda('');
  };

  const handleBuscarCodigo = async (e) => {
    e.preventDefault();
    const codigo = busquedaCodigo.trim();
    setErrorBusqueda('');
    if (!codigo) return;
    setBuscando(true);
    try {
      const res = await window.api.buscarPorCodigo(codigo);
      if (!res.ok) {
        setErrorBusqueda(res.message);
        return;
      }
      setTab(res.tipo);
      setAccion('descargo');
      setProductoIdPendiente(res.product_id);
      setCodigoResaltado(res.tipoResultado === 'unidad' ? res.unit.codigo : '');
      setBusquedaCodigo('');
    } catch (err) {
      setErrorBusqueda('Error buscando el codigo: ' + (err?.message || String(err)));
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div>
      <h1>Cargos y Descargos de inventario</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '650px' }}>
        Todo ingreso o baja de stock fuera de una compra formal a proveedor (modulo Compras) se hace aqui.
        Solo el administrador tiene acceso a este modulo.
      </p>

      <form
        onSubmit={handleBuscarCodigo}
        className="form-box"
        style={{ maxWidth: '500px', marginBottom: '1rem' }}
      >
        <label>Buscar por IMEI, codigo o codigo de barras (para descargar)</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={busquedaCodigo}
            onChange={(e) => setBusquedaCodigo(e.target.value)}
            placeholder="Dispara la pistola aqui o escribe el codigo"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={buscando || !busquedaCodigo.trim()}>
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem', color: '#888' }}>
          Te lleva directo al producto y a la accion de descargo, sin tener que buscarlo en la lista.
        </p>
        {errorBusqueda && <p style={{ color: 'red', fontSize: '0.85rem' }}>{errorBusqueda}</p>}
      </form>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        {TIPOS.map((t) => (
          <button
            key={t.key}
            onClick={() => seleccionarTab(t.key)}
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
        <CargoAccesorio key={producto.id} productId={producto.id} currentUser={currentUser} settings={settings} onDone={cargarProductos} />
      )}
      {productoId && esAccesorio && accion === 'descargo' && (
        <DescargoAccesorio key={producto.id} productId={producto.id} stockActual={producto.stock_disponible} currentUser={currentUser} settings={settings} onDone={cargarProductos} />
      )}
      {productoId && !esAccesorio && accion === 'cargo' && (
        <CargoUnidades key={producto.id} productId={producto.id} tipo={tab} permiteRango={permiteRango} currentUser={currentUser} settings={settings} onDone={cargarProductos} />
      )}
      {productoId && !esAccesorio && accion === 'descargo' && (
        <DescargoUnidades key={producto.id} productId={producto.id} tipo={tab} permiteRango={permiteRango} currentUser={currentUser} settings={settings} filtroInicial={codigoResaltado} onDone={cargarProductos} />
      )}
    </div>
  );
}

// ---------------- Accesorios: cargo (cantidad) ----------------

function CargoAccesorio({ productId, currentUser, settings, onDone }) {
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobante(null);
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setError('Cantidad invalida'); return; }
    const costo = parseFloat(costoUnitario);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo unitario'); return; }
    setEnviando(true);
    try {
      const res = await window.api.addProductStock(productId, n, costo, currentUser?.username);
      if (!res.ok) { setError(res.message); return; }
      setOk(`Cargo registrado. Nuevo stock: ${res.stock}`);
      setCantidad(''); setCostoUnitario('');
      setComprobante(res.registro || null);
      onDone();
      // El codigo de barras es opcional en accesorios: no bloquea el cargo. En cuanto se
      // registra, el comprobante sale impreso de una vez, sin que el usuario tenga que pedirlo.
      if (res.registro) {
        await generarCargoDescargoPDF(res.registro, 'cargo', settings, { imprimir: true });
      }
    } finally {
      setEnviando(false);
    }
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
      <button type="submit" disabled={enviando} style={{ marginTop: '0.5rem' }}>
        {enviando ? 'Registrando...' : 'Registrar cargo'}
      </button>
    </form>
  );
}

// ---------------- Accesorios: descargo (cantidad + motivo) ----------------

function DescargoAccesorio({ productId, stockActual, currentUser, settings, onDone }) {
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobante(null);
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setError('Cantidad invalida'); return; }
    if (!motivo.trim()) { setError('Indica el motivo del descargo'); return; }
    setEnviando(true);
    try {
      const res = await window.api.writeOffProductStock(productId, n, motivo.trim(), currentUser?.username);
      if (!res.ok) { setError(res.message); return; }
      setOk(`Descargo registrado. Nuevo stock: ${res.stock}`);
      setCantidad(''); setMotivo('');
      setComprobante(res.registro || null);
      onDone();
      if (res.registro) {
        await generarCargoDescargoPDF(res.registro, 'descargo', settings, { imprimir: true });
      }
    } finally {
      setEnviando(false);
    }
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
      <button type="submit" disabled={enviando} style={{ marginTop: '0.5rem' }}>
        {enviando ? 'Registrando...' : 'Registrar descargo'}
      </button>
    </form>
  );
}

// ---------------- Equipo/SimCard/USIM: cargo (manual o por rango) ----------------

function CargoUnidades({ productId, tipo, permiteRango, currentUser, settings, onDone }) {
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
    // Obligatorio: en equipos/simcards/usim nunca se permite cargar sin IMEI o codigo.
    if (!codigo.trim()) { setError(`Debes escribir o escanear el ${label} antes de poder cargar`); return; }
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
      if (res.registro) {
        await generarCargoDescargoPDF(res.registro, 'cargo', settings, { imprimir: true });
      }
    } finally {
      setEnviando(false);
    }
  };

  const handleAgregarRango = async (e) => {
    e.preventDefault();
    setError(''); setOk(''); setComprobantesRango([]);
    // Obligatorio tambien en modo rango: sin el primer y ultimo codigo no hay como cargar.
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
      // Un solo comprobante consolidado con todos los codigos del lote, en vez de imprimir
      // uno por uno (seria decenas de dialogos de impresion en un rango grande).
      if (res.registros && res.registros.length > 0) {
        await generarCargoDescargoLotePDF(res.registros, 'cargo', settings, { imprimir: true });
      }
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
            <label style={{ fontSize: '0.8rem' }}>{label} *</label><br />
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus required />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Costo de compra (USD)</label><br />
            <input type="number" step="0.01" value={costoManual} onChange={(e) => setCostoManual(e.target.value)} style={{ width: '100px' }} />
          </div>
          <button type="submit" disabled={enviando || !codigo.trim()}>+ Agregar {label}</button>
        </form>
      )}

      {modo === 'rango' && permiteRango && (
        <form onSubmit={handleAgregarRango} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Primer codigo de la caja *</label><br />
            <input placeholder="Ej: 190000" value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Ultimo codigo de la caja *</label><br />
            <input placeholder="Ej: 190050" value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Costo unitario del lote (USD)</label><br />
            <input type="number" step="0.01" value={costoRango} onChange={(e) => setCostoRango(e.target.value)} style={{ width: '100px' }} />
          </div>
          <button type="submit" disabled={enviando || !codigoInicio.trim() || !codigoFin.trim()}>Generar rango completo</button>
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

function DescargoUnidades({ productId, tipo, permiteRango, currentUser, settings, filtroInicial, onDone }) {
  const [modo, setModo] = useState('manual');
  const [units, setUnits] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [modalBaja, setModalBaja] = useState(null);
  // Filtro por codigo/IMEI para no tener que buscar a mano en una lista larga de unidades.
  // Se prellena si se llego aqui desde el buscador global (arriba, por codigo/IMEI/cod. barras).
  const [filtro, setFiltro] = useState(filtroInicial || '');

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

  const unitsFiltradas = filtro.trim()
    ? units.filter((u) => u.codigo.toLowerCase().includes(filtro.trim().toLowerCase()))
    : units;

  const abrirModalBaja = (unitId) => setModalBaja({ unitId });
  const confirmarBajaManual = async (values) => {
    const res = await window.api.writeOffUnit(modalBaja.unitId, values.motivo, currentUser?.username);
    if (!res.ok) { alert(res.message); return; }
    setModalBaja(null);
    cargarUnidades();
    setComprobante(res.registro || null);
    onDone();
    if (res.registro) {
      await generarCargoDescargoPDF(res.registro, 'descargo', settings, { imprimir: true });
    }
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
      // Un solo comprobante consolidado con todos los codigos dados de baja en el lote.
      if (res.registros && res.registros.length > 0) {
        await generarCargoDescargoLotePDF(res.registros, 'descargo', settings, { imprimir: true });
      }
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
        <div>
          {units.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem' }}>Filtrar por codigo / IMEI</label><br />
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Escanea o escribe para filtrar la lista"
                autoFocus={!!filtroInicial}
                style={{ width: '100%' }}
              />
            </div>
          )}
          {cargando ? <p>Cargando...</p> : units.length === 0 ? (
            <p>No hay unidades disponibles para dar de baja.</p>
          ) : unitsFiltradas.length === 0 ? (
            <p>Ningun codigo coincide con "{filtro}".</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, maxHeight: '260px', overflowY: 'auto' }}>
              {unitsFiltradas.map((u) => (
                <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #eee' }}>
                  <span>{u.codigo}</span>
                  <button onClick={() => abrirModalBaja(u.id)}>Dar de baja</button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
