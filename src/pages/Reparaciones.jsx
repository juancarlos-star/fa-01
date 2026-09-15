import React, { useCallback, useEffect, useState } from 'react';

// Garantías / Reparaciones: cubre ambos casos (reparación pagada por el cliente y reclamo de
// garantía de fábrica), siempre sobre un equipo YA VENDIDO por la tienda. Tres sub-vistas dentro
// de un mismo componente: lista de casos, formulario de caso nuevo (busca el equipo por
// código/IMEI antes de poder crearlo) y detalle de un caso (línea de tiempo + cambiar estado +
// cerrar/entregar).

const ESTADOS_INTERMEDIOS = ['recibido', 'en_diagnostico', 'en_reparacion', 'esperando_repuesto', 'listo_entrega'];

const ETIQUETA_ESTADO = {
  recibido: 'Recibido',
  en_diagnostico: 'En diagnóstico',
  en_reparacion: 'En reparación',
  esperando_repuesto: 'Esperando repuesto',
  listo_entrega: 'Listo para entrega',
  entregado: 'Entregado'
};

const COLOR_ESTADO = {
  recibido: { bg: '#eaecf0', color: '#344054' },
  en_diagnostico: { bg: '#fef0c7', color: '#93370d' },
  en_reparacion: { bg: '#fef0c7', color: '#93370d' },
  esperando_repuesto: { bg: '#fee4e2', color: '#b42318' },
  listo_entrega: { bg: '#d1fadf', color: '#027a48' },
  entregado: { bg: '#eaecf0', color: '#344054' }
};

const ETIQUETA_TIPO = { reparacion: 'Reparación', garantia: 'Garantía' };

const ETIQUETA_RESOLUCION = {
  reparado: 'Reparado (mismo equipo)',
  reemplazado: 'Reemplazado por equipo nuevo',
  rechazado: 'Rechazado / sin arreglo'
};

function Badge({ estado }) {
  const c = COLOR_ESTADO[estado] || COLOR_ESTADO.recibido;
  return (
    <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {ETIQUETA_ESTADO[estado] || estado}
    </span>
  );
}

export default function Reparaciones({ currentUser }) {
  const [vista, setVista] = useState('lista'); // 'lista' | 'nuevo' | 'detalle'
  const [casos, setCasos] = useState([]);
  const [filtro, setFiltro] = useState('abiertos'); // 'abiertos' | 'todos'
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState('');
  const [casoSeleccionadoId, setCasoSeleccionadoId] = useState(null);

  const cargarLista = useCallback(async (est) => {
    setCargandoLista(true);
    setErrorLista('');
    try {
      const res = await window.api.listarReparaciones(est);
      if (!res.ok) { setErrorLista(res.message || 'No se pudo cargar la lista'); return; }
      setCasos(res.reparaciones);
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => {
    if (vista === 'lista') cargarLista(filtro);
  }, [vista, filtro, cargarLista]);

  const abrirDetalle = (id) => {
    setCasoSeleccionadoId(id);
    setVista('detalle');
  };

  const volverALista = () => {
    setCasoSeleccionadoId(null);
    setVista('lista');
  };

  return (
    <div>
      <h1>Garantías / Reparaciones</h1>

      {vista === 'lista' && (
        <ListaCasos
          casos={casos}
          cargando={cargandoLista}
          error={errorLista}
          filtro={filtro}
          setFiltro={setFiltro}
          onVer={abrirDetalle}
          onNuevo={() => setVista('nuevo')}
        />
      )}

      {vista === 'nuevo' && (
        <NuevoCaso
          currentUser={currentUser}
          onCancelar={volverALista}
          onCreado={(id) => abrirDetalle(id)}
        />
      )}

      {vista === 'detalle' && casoSeleccionadoId && (
        <DetalleCaso
          id={casoSeleccionadoId}
          currentUser={currentUser}
          onVolver={volverALista}
        />
      )}
    </div>
  );
}

// ---------------- Lista ----------------

function ListaCasos({ casos, cargando, error, filtro, setFiltro, onVer, onNuevo }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
        <div className="tab-container-claro">
          <button
            type="button"
            className={`tab-item-claro${filtro === 'abiertos' ? ' active' : ''}`}
            onClick={() => setFiltro('abiertos')}
          >
            Abiertos
          </button>
          <button
            type="button"
            className={`tab-item-claro${filtro === 'todos' ? ' active' : ''}`}
            onClick={() => setFiltro('todos')}
          >
            Todos
          </button>
        </div>
        <button type="button" onClick={onNuevo} style={{ marginLeft: 'auto' }}>+ Nuevo caso</button>
      </div>

      {error && <p style={{ color: '#b42318' }}>{error}</p>}
      {cargando ? (
        <p>Cargando...</p>
      ) : casos.length === 0 ? (
        <p style={{ color: '#666' }}>No hay casos {filtro === 'abiertos' ? 'abiertos' : 'registrados'}.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Tipo</th>
              <th>Producto / Código</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Recibido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id}>
                <td>{c.numero}</td>
                <td>{ETIQUETA_TIPO[c.tipo] || c.tipo}</td>
                <td>{c.product_nombre || '—'}<br /><span style={{ color: '#666', fontSize: '0.82rem' }}>{c.unit_codigo}</span></td>
                <td>{c.cliente_nombre}<br /><span style={{ color: '#666', fontSize: '0.82rem' }}>{c.cliente_telefono}</span></td>
                <td><Badge estado={c.estado} /></td>
                <td>{c.created_at}</td>
                <td><button type="button" className="btn-ghost" onClick={() => onVer(c.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Nuevo caso ----------------

function NuevoCaso({ currentUser, onCancelar, onCreado }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [encontrado, setEncontrado] = useState(null); // { unit, product, factura, clienteTelefono, casoAbiertoId }

  const [tipo, setTipo] = useState('reparacion');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [fallaReportada, setFallaReportada] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');

  const handleBuscar = async (e) => {
    e.preventDefault();
    setErrorBusqueda('');
    setEncontrado(null);
    if (!codigo.trim()) { setErrorBusqueda('Escribe el código o IMEI del equipo'); return; }
    setBuscando(true);
    try {
      const res = await window.api.buscarEquipoVendidoParaReparacion(codigo.trim());
      if (!res.ok) { setErrorBusqueda(res.message); return; }
      setEncontrado(res);
      setClienteNombre(res.factura?.cliente_nombre || '');
      setClienteTelefono(res.clienteTelefono || '');
    } finally {
      setBuscando(false);
    }
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    setErrorGuardar('');
    if (!fallaReportada.trim()) { setErrorGuardar('Describe la falla reportada por el cliente'); return; }
    if (!clienteNombre.trim()) { setErrorGuardar('El nombre del cliente es obligatorio'); return; }
    setGuardando(true);
    try {
      const res = await window.api.crearReparacion({
        tipo,
        unitId: encontrado.unit.id,
        clienteId: encontrado.factura?.cliente_id || null,
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: clienteTelefono.trim(),
        fallaReportada: fallaReportada.trim(),
        usuario: currentUser?.username
      });
      if (!res.ok) { setErrorGuardar(res.message); return; }
      onCreado(res.reparacion.id);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <button type="button" className="btn-ghost" onClick={onCancelar} style={{ marginBottom: '1rem' }}>← Volver a la lista</button>

      <form className="form-box" onSubmit={handleBuscar} style={{ maxWidth: '480px' }}>
        <h3>1. Buscar el equipo</h3>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          Solo se pueden abrir casos sobre equipos que la tienda ya vendió. Escanea o escribe el
          código/IMEI del equipo.
        </p>
        <label>Código / IMEI</label>
        <input
          autoFocus
          placeholder="Código o IMEI del equipo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <button type="submit" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
        {errorBusqueda && <p style={{ color: '#b42318' }}>{errorBusqueda}</p>}
      </form>

      {encontrado && (
        <form className="form-box" onSubmit={handleCrear} style={{ maxWidth: '480px' }}>
          <h3>2. Datos del caso</h3>
          <p>
            <strong>Equipo:</strong> {encontrado.product?.nombre} ({encontrado.unit?.codigo})
          </p>
          {encontrado.factura && (
            <p style={{ color: '#666', fontSize: '0.85rem' }}>
              Vendido en factura N° {encontrado.factura.numero || encontrado.factura.id}
            </p>
          )}
          {encontrado.casoAbiertoId && (
            <p style={{ color: '#b42318' }}>
              ⚠ Este equipo ya tiene un caso abierto (N° {encontrado.casoAbiertoId}). No se puede
              crear otro hasta que se cierre.
            </p>
          )}

          <label>Tipo de caso</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="reparacion">Reparación (pagada por el cliente)</option>
            <option value="garantia">Garantía de fábrica</option>
          </select>

          <label>Nombre del cliente</label>
          <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />

          <label>Teléfono del cliente</label>
          <input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />

          <label>Falla reportada</label>
          <textarea
            rows={3}
            style={{ width: '100%', padding: 8, marginBottom: 10, border: '1px solid #d0d5dd', borderRadius: 6, fontFamily: 'inherit' }}
            value={fallaReportada}
            onChange={(e) => setFallaReportada(e.target.value)}
            placeholder="Ej: no enciende, pantalla rota, no carga..."
          />

          {errorGuardar && <p style={{ color: '#b42318' }}>{errorGuardar}</p>}
          <button type="submit" disabled={guardando || !!encontrado.casoAbiertoId}>
            {guardando ? 'Creando...' : 'Crear caso'}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------- Detalle ----------------

function DetalleCaso({ id, currentUser, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Cambiar estado intermedio
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [notaEstado, setNotaEstado] = useState('');
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  // Cerrar / entregar
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [resolucion, setResolucion] = useState('reparado');
  const [notaCierre, setNotaCierre] = useState('');
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [unitReemplazoId, setUnitReemplazoId] = useState('');
  const [guardandoCierre, setGuardandoCierre] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await window.api.detalleReparacion(id);
      if (!res.ok) { setError(res.message || 'No se pudo cargar el caso'); return; }
      setDatos(res);
      const siguiente = ESTADOS_INTERMEDIOS.find((e) => e !== res.reparacion.estado) || res.reparacion.estado;
      setNuevoEstado(res.reparacion.estado === 'entregado' ? '' : siguiente);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (mostrarCierre && resolucion === 'reemplazado' && datos?.reparacion?.product_id) {
      window.api.listUnidadesDisponibles(datos.reparacion.product_id).then((rows) => {
        setUnidadesDisponibles(rows || []);
      });
    }
  }, [mostrarCierre, resolucion, datos]);

  const handleCambiarEstado = async (e) => {
    e.preventDefault();
    if (!nuevoEstado) return;
    setGuardandoEstado(true);
    try {
      const res = await window.api.cambiarEstadoReparacion({
        id, estado: nuevoEstado, nota: notaEstado, usuario: currentUser?.username
      });
      if (!res.ok) { setError(res.message); return; }
      setNotaEstado('');
      await cargar();
    } finally {
      setGuardandoEstado(false);
    }
  };

  const handleCerrar = async (e) => {
    e.preventDefault();
    setError('');
    if (resolucion === 'reemplazado' && !unitReemplazoId) {
      setError('Selecciona el equipo del inventario que se entregará como reemplazo');
      return;
    }
    if (!confirm('¿Entregar el equipo al cliente y cerrar este caso? Esta acción no se puede deshacer.')) return;
    setGuardandoCierre(true);
    try {
      const res = await window.api.cerrarReparacion({
        id,
        resolucion,
        unitReemplazoId: unitReemplazoId || null,
        usuario: currentUser?.username,
        nota: notaCierre
      });
      if (!res.ok) { setError(res.message); return; }
      setMostrarCierre(false);
      await cargar();
    } finally {
      setGuardandoCierre(false);
    }
  };

  if (cargando) return <div><button type="button" className="btn-ghost" onClick={onVolver}>← Volver a la lista</button><p>Cargando...</p></div>;
  if (!datos) return <div><button type="button" className="btn-ghost" onClick={onVolver}>← Volver a la lista</button><p style={{ color: '#b42318' }}>{error}</p></div>;

  const { reparacion, product, unit, factura, unitReemplazo, eventos } = datos;
  const esGarantia = reparacion.tipo === 'garantia';
  const yaEntregado = reparacion.estado === 'entregado';

  return (
    <div>
      <button type="button" className="btn-ghost" onClick={onVolver} style={{ marginBottom: '1rem' }}>← Volver a la lista</button>
      {error && <p style={{ color: '#b42318' }}>{error}</p>}

      <div className="form-box" style={{ maxWidth: '560px' }}>
        <h3>
          {ETIQUETA_TIPO[reparacion.tipo]} N° {reparacion.numero} <Badge estado={reparacion.estado} />
        </h3>
        <p><strong>Equipo:</strong> {product?.nombre} ({unit?.codigo})</p>
        {factura && <p><strong>Vendido en factura:</strong> N° {factura.numero || factura.id}</p>}
        <p><strong>Cliente:</strong> {reparacion.cliente_nombre} — {reparacion.cliente_telefono || 'sin teléfono'}</p>
        <p><strong>Falla reportada:</strong> {reparacion.falla_reportada}</p>
        <p style={{ color: '#666', fontSize: '0.85rem' }}>Recibido el {reparacion.created_at} por {reparacion.usuario_recibio || '—'}</p>

        {yaEntregado && (
          <>
            <hr />
            <p><strong>Resolución:</strong> {ETIQUETA_RESOLUCION[reparacion.resolucion] || reparacion.resolucion}</p>
            {unitReemplazo && <p><strong>Equipo de reemplazo entregado:</strong> {unitReemplazo.codigo}</p>}
            <p style={{ color: '#666', fontSize: '0.85rem' }}>Entregado el {reparacion.entregado_at} por {reparacion.usuario_entrego || '—'}</p>
          </>
        )}
      </div>

      {/* Línea de tiempo */}
      <div className="form-box" style={{ maxWidth: '560px' }}>
        <h3>Línea de tiempo</h3>
        {eventos.map((ev) => (
          <div key={ev.id} style={{ borderLeft: '2px solid #d0d5dd', paddingLeft: '10px', marginBottom: '10px' }}>
            <div><Badge estado={ev.estado} /> <span style={{ color: '#666', fontSize: '0.82rem' }}>{ev.created_at}{ev.usuario ? ` · ${ev.usuario}` : ''}</span></div>
            {ev.nota && <div style={{ fontSize: '0.9rem' }}>{ev.nota}</div>}
          </div>
        ))}
      </div>

      {!yaEntregado && (
        <>
          <form className="form-box" onSubmit={handleCambiarEstado} style={{ maxWidth: '560px' }}>
            <h3>Actualizar estado</h3>
            <label>Nuevo estado</label>
            <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
              {ESTADOS_INTERMEDIOS.map((e) => (
                <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>
              ))}
            </select>
            <label>Nota (opcional)</label>
            <input value={notaEstado} onChange={(e) => setNotaEstado(e.target.value)} placeholder="Ej: se pidió repuesto al proveedor" />
            <button type="submit" disabled={guardandoEstado}>{guardandoEstado ? 'Guardando...' : 'Actualizar'}</button>
          </form>

          {!mostrarCierre ? (
            <button type="button" className="btn-danger" onClick={() => setMostrarCierre(true)}>Entregar / Cerrar caso</button>
          ) : (
            <form className="form-box" onSubmit={handleCerrar} style={{ maxWidth: '560px' }}>
              <h3>Entregar equipo y cerrar caso</h3>
              <label>Resolución</label>
              <select value={resolucion} onChange={(e) => { setResolucion(e.target.value); setUnitReemplazoId(''); }}>
                <option value="reparado">Reparado (se devuelve el mismo equipo)</option>
                {esGarantia && <option value="reemplazado">Reemplazado por equipo nuevo del inventario</option>}
                <option value="rechazado">Rechazado / sin arreglo (se devuelve tal cual)</option>
              </select>

              {resolucion === 'reemplazado' && (
                <>
                  <label>Equipo de reemplazo</label>
                  <select value={unitReemplazoId} onChange={(e) => setUnitReemplazoId(e.target.value)}>
                    <option value="">Selecciona un equipo disponible...</option>
                    {unidadesDisponibles.map((u) => (
                      <option key={u.id} value={u.id}>{u.codigo}</option>
                    ))}
                  </select>
                  {unidadesDisponibles.length === 0 && (
                    <p style={{ color: '#b42318', fontSize: '0.85rem' }}>No hay equipos disponibles de este mismo producto en el inventario.</p>
                  )}
                </>
              )}

              <label>Nota (opcional)</label>
              <input value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)} placeholder="Ej: cliente conforme con el reemplazo" />

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button type="submit" disabled={guardandoCierre}>{guardandoCierre ? 'Cerrando...' : 'Confirmar entrega'}</button>
                <button type="button" onClick={() => setMostrarCierre(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
