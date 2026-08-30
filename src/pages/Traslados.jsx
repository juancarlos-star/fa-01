import React, { useState, useEffect, useRef } from 'react';
import SeleccionUnidadesModal from '../components/SeleccionUnidadesModal.jsx';

// Modulo de Traslados entre depositos: mismo lenguaje visual y forma de trabajar que Compras/
// Facturacion (franja superior, panel de datos a la izquierda, tabla central con renglon de
// entrada por codigo/pistola, panel de resumen a la derecha). La diferencia de fondo es que
// aqui NO hay dinero de por medio (ni costo ni precio): un traslado solo mueve stock que ya es
// tuyo de un deposito a otro, asi que la tabla y el resumen muestran cantidades, no montos.
// Para accesorios se mueve por cantidad; para equipos/SIM/USIM se elige cada unidad puntual
// (IMEI/codigo) con el mismo modal que ya usa Facturacion para elegir unidades.
export default function Traslados({ currentUser }) {
  const [vista, setVista] = useState('nuevo'); // 'nuevo' | 'historial'

  const [depositos, setDepositos] = useState([]);
  const [depositoOrigenId, setDepositoOrigenId] = useState('');
  const [depositoDestinoId, setDepositoDestinoId] = useState('');
  const [nota, setNota] = useState('');

  const [filaCodigo, setFilaCodigo] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [filaProducto, setFilaProducto] = useState(null);
  const [filaCantidad, setFilaCantidad] = useState(1);
  const [errorFila, setErrorFila] = useState('');
  const [mostrarModalUnidades, setMostrarModalUnidades] = useState(false);
  const [unidadesDisponiblesFila, setUnidadesDisponiblesFila] = useState([]);

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);
  const [registrando, setRegistrando] = useState(false);

  const [mostrarModalVerTodo, setMostrarModalVerTodo] = useState(false);

  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoOrigenId(String(data[0].id));
    });
  }, []);

  const limpiarFila = () => {
    setFilaCodigo('');
    setFilaProducto(null);
    setFilaCantidad(1);
    setErrorFila('');
    setUnidadesDisponiblesFila([]);
  };

  const buscarProductoPorCodigoEnter = async () => {
    setErrorFila('');
    const texto = filaCodigo.trim();
    if (!texto) return;
    if (!depositoOrigenId) {
      setErrorFila('Selecciona primero el depósito de origen');
      return;
    }
    setBuscandoCodigo(true);
    try {
      const p = await window.api.buscarProductoPorCodigo(texto, Number(depositoOrigenId));
      if (!p) {
        setErrorFila(`No se encontro ningun producto con "${texto}". Un traslado solo mueve productos que ya existen en el inventario.`);
        return;
      }
      if (p.multiplesCoincidencias) {
        setErrorFila(`Hay ${p.cantidad} productos que coinciden con "${texto}". Se mas especifico o usa el codigo exacto.`);
        return;
      }
      if (p.noDisponible) {
        setErrorFila(`El codigo "${texto}" ya fue vendido o dado de baja, no se puede trasladar.`);
        return;
      }
      if (p.otroDeposito) {
        setErrorFila(`El codigo "${texto}" no esta en el depósito de origen seleccionado.`);
        return;
      }
      if (!p.stock_disponible || p.stock_disponible <= 0) {
        setErrorFila(`"${p.nombre}" no tiene stock disponible en el depósito de origen seleccionado.`);
        return;
      }
      setFilaProducto(p);
      setFilaCantidad(1);
      setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const maxDisponibleFila = () => (filaProducto ? filaProducto.stock_disponible || 0 : 0);

  const confirmarFila = async () => {
    setErrorFila('');
    const cant = parseInt(filaCantidad, 10);
    if (!cant || cant <= 0) { setErrorFila('Cantidad invalida'); return; }
    if (cant > maxDisponibleFila()) {
      setErrorFila(`Solo hay ${maxDisponibleFila()} disponible(s) de "${filaProducto.nombre}" en el depósito de origen`);
      return;
    }

    if (filaProducto.tipo === 'accesorio') {
      setCarrito((prev) => [
        ...prev,
        {
          key: `${filaProducto.id}-${Date.now()}`,
          productId: filaProducto.id,
          tipo: 'accesorio',
          descripcion: filaProducto.nombre,
          producto_codigo: filaProducto.codigo_producto || null,
          cantidad: cant,
          codigos: null
        }
      ]);
      limpiarFila();
      setTimeout(() => codigoRef.current?.focus(), 0);
      return;
    }

    // Equipo/SIM/USIM: hay que elegir cuales unidades puntuales (IMEI/codigo) se trasladan,
    // limitando la lista a las que esten fisicamente en el deposito de ORIGEN.
    const unidades = await window.api.listUnidadesDisponibles(filaProducto.id, Number(depositoOrigenId));
    setUnidadesDisponiblesFila(unidades);
    setMostrarModalUnidades(true);
  };

  const confirmarSeleccionUnidades = (seleccionadas) => {
    setCarrito((prev) => [
      ...prev,
      {
        key: `${filaProducto.id}-${Date.now()}`,
        productId: filaProducto.id,
        tipo: filaProducto.tipo,
        descripcion: filaProducto.nombre,
        producto_codigo: filaProducto.codigo_producto || null,
        cantidad: seleccionadas.length,
        codigos: seleccionadas.map((u) => u.codigo),
        unitIds: seleccionadas.map((u) => u.id)
      }
    ]);
    setMostrarModalUnidades(false);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const quitarDelCarrito = (key) => setKeyPendienteQuitar(key);
  const confirmarQuitarDelCarrito = () => {
    setCarrito(carrito.filter((item) => item.key !== keyPendienteQuitar));
    setKeyPendienteQuitar(null);
  };
  const cancelarQuitarDelCarrito = () => setKeyPendienteQuitar(null);

  const totalPiezas = carrito.reduce((acc, i) => acc + (parseInt(i.cantidad, 10) || 0), 0);

  const cambiarDepositoOrigen = (nuevoId) => {
    if (carrito.length > 0 && !window.confirm('Cambiar el depósito de origen vacía los productos que ya agregaste a este traslado. ¿Deseas continuar?')) {
      return;
    }
    setDepositoOrigenId(nuevoId);
    setCarrito([]);
    limpiarFila();
  };

  const handleRegistrarTraslado = async () => {
    setError('');
    if (carrito.length === 0) { setError('Agrega al menos un producto para trasladar'); return; }
    if (!depositoOrigenId || !depositoDestinoId) { setError('Selecciona depósito de origen y de destino'); return; }
    if (depositoOrigenId === depositoDestinoId) { setError('El depósito de origen y el de destino no pueden ser el mismo'); return; }

    setRegistrando(true);
    try {
      const res = await window.api.crearTraslado({
        depositoOrigenId: Number(depositoOrigenId),
        depositoDestinoId: Number(depositoDestinoId),
        items: carrito.map((i) => ({
          tipo: i.tipo,
          productId: i.productId,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unitIds: i.unitIds
        })),
        nota: nota.trim() || null,
        usuario: currentUser?.full_name || currentUser?.username
      });
      if (!res.ok) { setError(res.message); return; }

      const origen = depositos.find((d) => String(d.id) === String(depositoOrigenId));
      const destino = depositos.find((d) => String(d.id) === String(depositoDestinoId));
      setConfirmacion({
        numeroTraslado: res.numeroTraslado,
        origenNombre: origen?.nombre || '',
        destinoNombre: destino?.nombre || '',
        totalItems: totalPiezas
      });
      setCarrito([]);
      setNota('');
      limpiarFila();
    } catch (err) {
      console.error('Error al registrar el traslado:', err);
      setError('Ocurrio un error inesperado: ' + (err?.message || String(err)));
    } finally {
      setRegistrando(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10' && !e.repeat && vista === 'nuevo' && !confirmacion) {
        e.preventDefault();
        handleRegistrarTraslado();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (confirmacion) {
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <div className="check">✓</div>
          <h1>Traslado registrado</h1>
        </div>
        <div className="pos-receipt-body">
          <div className="pos-receipt-row">
            <span>N° de traslado</span>
            <strong>{String(confirmacion.numeroTraslado).padStart(6, '0')}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Origen → Destino</span>
            <strong>{confirmacion.origenNombre} → {confirmacion.destinoNombre}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Total de items movidos</span>
            <strong>{confirmacion.totalItems}</strong>
          </div>
        </div>
        <div className="pos-receipt-actions">
          <button className="btn-ghost" onClick={() => setVista('historial')}>Ver historial</button>
          <button className="btn-primary" onClick={() => setConfirmacion(null)}>Hacer otro traslado</button>
        </div>
      </div>
    );
  }

  if (vista === 'historial') {
    return <HistorialTraslados onVolver={() => setVista('nuevo')} />;
  }

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE INVENTARIO</span>
        <span className="pos-topbar-center">TRASLADOS ENTRE DEPOSITOS</span>
        <button
          type="button"
          onClick={() => setVista('historial')}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Ver historial
        </button>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Depósito Origen <span className="required-mark">*</span></label>
            <select value={depositoOrigenId} onChange={(e) => cambiarDepositoOrigen(e.target.value)}>
              {depositos.length === 0 && <option value="">-- No hay depositos --</option>}
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.codigo} - {d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="pos-field">
            <label>Depósito Destino <span className="required-mark">*</span></label>
            <select value={depositoDestinoId} onChange={(e) => setDepositoDestinoId(e.target.value)}>
              <option value="">-- Selecciona --</option>
              {depositos.filter((d) => String(d.id) !== String(depositoOrigenId)).map((d) => (
                <option key={d.id} value={d.id}>{d.codigo} - {d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="pos-field">
            <label>Vendedor <span className="required-mark">*</span></label>
            <input value={currentUser?.username || ''} disabled />
          </div>

          <div className="pos-field">
            <label>Nota (opcional)</label>
            <input
              placeholder="Ej: reposicion de stock"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>

        <div className="pos-mid">
          {depositoOrigenId && depositoDestinoId ? (
            <>
              <div className="pos-stripe">
                Origen: {depositos.find((d) => String(d.id) === String(depositoOrigenId))?.nombre || '—'}
              </div>
              <div className="pos-stripe">
                Destino: {depositos.find((d) => String(d.id) === String(depositoDestinoId))?.nombre || '—'}
              </div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Elige el depósito de origen</div>
              <div className="pos-stripe placeholder">Elige el depósito de destino</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Traslado</div>
          <div className="pos-right-row total-final">
            <span>Total de items</span>
            <span>{totalPiezas}</span>
          </div>
          <div className="pos-right-footer">
            <span>Productos distintos</span>
            <span>{carrito.length}</span>
          </div>
        </div>
      </div>

      {(error || errorFila) && <div className="pos-error-banner">{error || errorFila}</div>}

      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '10%' }}>Cantidad</th>
              <th style={{ width: '8%' }}>Und</th>
              <th style={{ width: '20%', textAlign: 'right' }}>
                <button type="button" className="pos-ver-todo-btn pos-ver-todo-btn-header" onClick={() => setMostrarModalVerTodo(true)}>
                  Ver todo
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="fila-entrada">
              <td>
                {!filaProducto ? (
                  <input
                    ref={codigoRef}
                    type="text"
                    placeholder="Código + Enter"
                    value={filaCodigo}
                    onChange={(e) => setFilaCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarProductoPorCodigoEnter(); } }}
                    disabled={buscandoCodigo || !depositoOrigenId}
                  />
                ) : (
                  <span>{filaProducto.codigo_producto || '—'}</span>
                )}
              </td>
              <td>{filaProducto ? filaProducto.nombre : <span style={{ color: '#98a2b3' }}>—</span>}</td>
              <td>
                {filaProducto ? (
                  <input
                    ref={cantidadRef}
                    type="number"
                    min="1"
                    max={maxDisponibleFila()}
                    value={filaCantidad}
                    onChange={(e) => setFilaCantidad(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmarFila(); }
                      if (e.key === 'Escape') { e.preventDefault(); limpiarFila(); setTimeout(() => codigoRef.current?.focus(), 0); }
                    }}
                  />
                ) : (
                  <span></span>
                )}
              </td>
              <td>
                {filaProducto ? 'UND' : ''}
                {filaProducto && (
                  <div style={{ fontSize: '0.7rem', color: '#667085' }}>máx. {maxDisponibleFila()}</div>
                )}
              </td>
              <td>
                <div className="pos-entrada-acciones">
                  {filaProducto && (
                    <button type="button" className="pos-agregar-btn" onClick={confirmarFila}>
                      Agregar
                    </button>
                  )}
                  {filaProducto && (
                    <button type="button" className="pos-remove-btn"
                      onClick={() => { limpiarFila(); setTimeout(() => codigoRef.current?.focus(), 0); }}>×</button>
                  )}
                </div>
              </td>
            </tr>

            {carrito.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Aun no has agregado productos a este traslado.
                </td>
              </tr>
            ) : (
              carrito.map((item) => (
                <tr key={item.key}>
                  <td>{item.producto_codigo || '—'}</td>
                  <td>
                    <div>{item.descripcion}</div>
                    {item.codigos && item.codigos.length > 0 && (
                      <div style={codigosListStyle}>
                        {item.codigos.map((cod) => (
                          <div key={cod} style={codigoLineStyle}>{cod}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>UND</td>
                  <td>
                    {keyPendienteQuitar === item.key ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <button type="button" className="pos-confirm-btn yes" onClick={confirmarQuitarDelCarrito}>Si</button>
                        <button type="button" className="pos-confirm-btn no" onClick={cancelarQuitarDelCarrito}>No</button>
                      </span>
                    ) : (
                      <button type="button" className="pos-remove-btn" onClick={() => quitarDelCarrito(item.key)}>×</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-footer-actions">
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarTraslado} disabled={registrando}>
          {registrando ? 'Registrando...' : 'F10 Registrar traslado'}
        </button>
      </div>

      {mostrarModalUnidades && filaProducto && (
        <SeleccionUnidadesModal
          nombreProducto={filaProducto.nombre}
          cantidadNecesaria={parseInt(filaCantidad, 10) || 1}
          unidadesDisponibles={unidadesDisponiblesFila}
          onConfirm={confirmarSeleccionUnidades}
          onCancel={() => setMostrarModalUnidades(false)}
        />
      )}

      {mostrarModalVerTodo && (
        <div className="pos-vertodo-overlay" onClick={() => setMostrarModalVerTodo(false)}>
          <div className="pos-vertodo-box" onClick={(e) => e.stopPropagation()}>
            <div className="pos-vertodo-header">
              <span>Productos del traslado</span>
              <button type="button" className="pos-vertodo-cerrar" onClick={() => setMostrarModalVerTodo(false)}>×</button>
            </div>
            <div className="pos-vertodo-body">
              {carrito.length === 0 ? (
                <p className="pos-vertodo-vacio">Aun no has agregado productos a este traslado.</p>
              ) : (
                <table className="pos-vertodo-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Und</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carrito.map((item) => (
                      <tr key={item.key}>
                        <td>{item.producto_codigo || '—'}</td>
                        <td>
                          <div>{item.descripcion}</div>
                          {item.codigos && item.codigos.length > 0 && (
                            <div className="pos-vertodo-codigos">
                              {item.codigos.map((cod) => (
                                <div key={cod}>{cod}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{item.cantidad}</td>
                        <td>UND</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pos-vertodo-footer">
              <span>Total cantidad de items: <strong>{totalPiezas}</strong></span>
              <button type="button" className="btn-primary" onClick={() => setMostrarModalVerTodo(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Historial de traslados ----
function HistorialTraslados({ onVolver }) {
  const [traslados, setTraslados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    window.api.listarTraslados({}).then((data) => {
      setTraslados(data);
      setCargando(false);
    });
  }, []);

  const verDetalle = async (id) => {
    const res = await window.api.detalleTraslado(id);
    if (res.ok) setDetalle(res);
  };

  return (
    <div>
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE INVENTARIO</span>
        <span className="pos-topbar-center">HISTORIAL DE TRASLADOS</span>
        <button
          type="button"
          onClick={onVolver}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          + Nuevo traslado
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d0d5dd', borderTop: 'none', padding: '16px' }}>
        {cargando ? (
          <p style={{ color: '#98a2b3' }}>Cargando...</p>
        ) : traslados.length === 0 ? (
          <p style={{ color: '#98a2b3' }}>Aún no se ha registrado ningún traslado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '6px 4px' }}>N°</th>
                <th style={{ padding: '6px 4px' }}>Fecha</th>
                <th style={{ padding: '6px 4px' }}>Origen</th>
                <th style={{ padding: '6px 4px' }}>Destino</th>
                <th style={{ padding: '6px 4px' }}>Items</th>
                <th style={{ padding: '6px 4px' }}>Usuario</th>
                <th style={{ padding: '6px 4px' }}></th>
              </tr>
            </thead>
            <tbody>
              {traslados.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #eef0f3' }}>
                  <td style={{ padding: '6px 4px' }}>{String(t.numero_traslado).padStart(6, '0')}</td>
                  <td style={{ padding: '6px 4px' }}>{t.created_at}</td>
                  <td style={{ padding: '6px 4px' }}>{t.deposito_origen_nombre}</td>
                  <td style={{ padding: '6px 4px' }}>{t.deposito_destino_nombre}</td>
                  <td style={{ padding: '6px 4px' }}>{t.total_items}</td>
                  <td style={{ padding: '6px 4px' }}>{t.usuario}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <button type="button" onClick={() => verDetalle(t.id)}>Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detalle && (
        <div className="pos-vertodo-overlay" onClick={() => setDetalle(null)}>
          <div className="pos-vertodo-box" onClick={(e) => e.stopPropagation()}>
            <div className="pos-vertodo-header">
              <span>Traslado N° {String(detalle.traslado.numero_traslado).padStart(6, '0')}</span>
              <button type="button" className="pos-vertodo-cerrar" onClick={() => setDetalle(null)}>×</button>
            </div>
            <div className="pos-vertodo-body">
              <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#475467' }}>
                {detalle.traslado.deposito_origen_nombre} → {detalle.traslado.deposito_destino_nombre}
                {detalle.traslado.nota && <> — {detalle.traslado.nota}</>}
              </p>
              <table className="pos-vertodo-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>Código</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.descripcion}</td>
                      <td>{it.cantidad}</td>
                      <td>{it.unit_codigo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pos-vertodo-footer">
              <button type="button" className="btn-primary" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const codigosListStyle = {
  marginTop: '4px',
  maxHeight: '110px',
  overflowY: 'auto',
  border: '1px solid #eef0f3',
  borderRadius: '4px',
  padding: '4px 6px',
  background: '#fafbfc'
};

const codigoLineStyle = {
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  color: '#475467',
  lineHeight: '1.5'
};
