import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fmt } from '../utils/format.js';
import ClienteNuevoModal from '../components/ClienteNuevoModal.jsx';
import SelectorProducto from '../components/SelectorProducto.jsx';
import { generarReciboAbonoPDF } from '../utils/generarReciboAbonoPDF.js';

// Apartados / reservas con abono (feature #8). Diseño acordado con el dueño del negocio:
//   - Menu propio (este archivo), no un submenu de Reportes.
//   - No bloquea un IMEI/serial puntual: solo resta la CANTIDAD del stock disponible que ya ve
//     Facturacion (electron/main.js ya lo hace en products:list / buscarPorCodigo).
//   - Es POR DEPOSITO: un apartado hecho en un deposito no afecta el stock de otro.
//   - Cuando el saldo llega a $0 se pregunta cada vez que pasa: generar la factura ya mismo (se
//     va a Facturacion a hacerla, sin duplicar aqui todo ese flujo de IMEI/IVA/tasa de cambio),
//     o marcarlo "listo para entregar" para facturarlo despues -en ambos casos el stock sigue
//     reservado hasta que el apartado se cierre vinculando (o no) la factura real-.
const ESTADO_LABEL = {
  activo: 'Activo',
  listo_para_entregar: 'Listo para entregar',
  completado: 'Entregado',
  cancelado: 'Cancelado'
};
const ESTADO_COLOR = {
  activo: '#b54708',
  listo_para_entregar: '#175cd3',
  completado: '#067647',
  cancelado: '#98a2b3'
};

// Texto legible del documento con el que se cerro el apartado (si se cerro con uno). Usa el
// numero real impreso en el documento (numero_factura), no el id interno de la base de datos.
function textoDocumento(apartado) {
  if (!apartado.factura_id) return null;
  if (!apartado.numero_factura) return `Documento interno #${apartado.factura_id}`;
  const numero = String(apartado.numero_factura).padStart(6, '0');
  return apartado.es_nota_venta ? `Nota de venta N° ${numero}` : `Factura N° ${numero}`;
}

function Badge({ estado }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: '0.8rem',
        fontWeight: 600,
        color: '#fff',
        background: ESTADO_COLOR[estado] || '#667085'
      }}
    >
      {ESTADO_LABEL[estado] || estado}
    </span>
  );
}

// Ventanilla central que se muestra: (1) justo despues de guardar un apartado nuevo, y (2) cada
// vez que se registra un abono que NO deja el apartado en $0. Muestra un resumen de la
// transaccion (cliente, producto(s), fecha, cuanto se abono ahora, cuanto queda debiendo) con un
// boton para imprimir el recibo de ese abono (si hubo uno) y otro para cerrar la ventanilla.
function ModalResumenApartado({ apartado, items, abono, settings, onImprimir, onCerrar, onFacturar }) {
  const saldo = apartado.saldo_usd !== undefined
    ? apartado.saldo_usd
    : Math.round((apartado.total_usd - apartado.abonado_usd) * 100) / 100;
  const [imprimiendo, setImprimiendo] = useState(false);
  const [procesandoFactura, setProcesandoFactura] = useState(false);
  const [errorImprimir, setErrorImprimir] = useState('');
  // Solo tiene sentido ofrecer facturar/nota de venta desde aqui si el apartado sigue 'activo'
  // (o sea, todavia nadie eligio que hacer con el) y ya quedo pagado del todo.
  const puedeFacturarAhora = saldo <= 0.005 && apartado.estado === 'activo' && onFacturar;

  const handleImprimir = async () => {
    setImprimiendo(true);
    setErrorImprimir('');
    try {
      await onImprimir();
    } catch (err) {
      // Si algo se rompe generando el PDF, que se note -antes quedaba en silencio y parecia
      // que el boton "no hacia nada".
      console.error('Error generando el recibo de abono:', err);
      setErrorImprimir('No se pudo generar el recibo: ' + (err?.message || String(err)));
    } finally {
      setImprimiendo(false);
    }
  };

  const handleFacturar = async (modo) => {
    setProcesandoFactura(true);
    try {
      await onFacturar(modo);
    } finally {
      setProcesandoFactura(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16, 24, 40, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '1.5rem',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {saldo <= 0.005 ? '¡Apartado pagado por completo!' : 'Transacción registrada'}
        </h2>
        <p style={{ margin: '4px 0' }}><strong>Cliente:</strong> {apartado.cliente_nombre}{apartado.cliente_telefono ? ` — ${apartado.cliente_telefono}` : ''}</p>
        <p style={{ margin: '4px 0' }}><strong>Producto(s):</strong> {items.map((it) => `${it.descripcion} (x${it.cantidad})`).join(', ')}</p>
        <p style={{ margin: '4px 0' }}><strong>Fecha de gestión:</strong> {abono ? abono.created_at : apartado.created_at}</p>
        <p style={{ margin: '4px 0' }}><strong>Abonado en esta transacción:</strong> ${fmt(abono ? abono.monto_usd : 0)}</p>
        <p style={{ margin: '4px 0' }}><strong>Total abonado hasta ahora:</strong> ${fmt(apartado.abonado_usd)}</p>
        <p style={{ margin: '4px 0', fontSize: '1.05rem' }}>
          <strong>Queda debiendo: </strong>
          <strong style={{ color: saldo > 0 ? '#b42318' : '#0b8f4e' }}>${fmt(saldo)}</strong>
        </p>

        {puedeFacturarAhora && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem', margin: '0.75rem 0' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>¿Cómo lo facturamos?</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleFacturar('factura')} disabled={procesandoFactura}>🧾 Generar factura</button>
              <button onClick={() => handleFacturar('notaVenta')} disabled={procesandoFactura}>📝 Nota de venta</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', flexWrap: 'wrap' }}>
          {!puedeFacturarAhora && abono && (
            <button onClick={handleImprimir} disabled={imprimiendo}>
              {imprimiendo ? 'Imprimiendo...' : '🖨️ Imprimir recibo'}
            </button>
          )}
          {!puedeFacturarAhora && <button onClick={onCerrar}>Cerrar</button>}
        </div>
        {errorImprimir && <p style={{ color: '#b42318', marginTop: 8, marginBottom: 0, fontSize: '0.85rem' }}>{errorImprimir}</p>}
      </div>
    </div>
  );
}

export default function Apartados({ currentUser, onIrAFacturar }) {
  const [vista, setVista] = useState('lista'); // 'lista' | 'nuevo' | 'detalle'
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [apartados, setApartados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [apartadoActivoId, setApartadoActivoId] = useState(null);
  const [settings, setSettings] = useState(null);
  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  // Ventanilla central con el resumen de la ultima transaccion (crear apartado o registrar un
  // abono): { apartado, items, abono }. abono puede ser null si se guardo el apartado sin abono
  // inicial -en ese caso el modal no ofrece "Imprimir recibo" porque no hubo dinero de por medio.
  // Vive aqui (y no dentro de ApartadoNuevo/ApartadoDetalle) para poder mostrarse encima de
  // cualquiera de las 3 vistas, incluso despues de que "Nuevo apartado" ya regreso a la lista.
  const [resumenTransaccion, setResumenTransaccion] = useState(null);
  const cerrarResumen = () => setResumenTransaccion(null);

  // Se dispara al presionar "Generar factura" / "Nota de venta" dentro de la ventanilla de
  // resumen (cuando el abono deja el apartado en $0). Primero lo marca 'listo_para_entregar'
  // (para que el producto se mantenga reservado mientras se factura) y despues avisa hacia
  // arriba (App.jsx) para que navegue a Facturacion/Nota de Venta con los datos precargados.
  const handleFacturarDesdeResumen = async (modo) => {
    const { apartado, items } = resumenTransaccion;
    const res = await window.api.marcarApartadoListoParaEntregar(apartado.id, currentUser?.username);
    if (!res.ok) return;
    setResumenTransaccion(null);
    if (onIrAFacturar) {
      onIrAFacturar({
        apartadoId: apartado.id,
        numero: apartado.numero,
        total: apartado.total_usd,
        depositoId: apartado.deposito_id,
        clienteId: apartado.cliente_id,
        clienteNombre: apartado.cliente_nombre,
        clienteTelefono: apartado.cliente_telefono,
        items
      }, modo);
    }
  };

  // Reimprime un recibo YA emitido (no genera un abono nuevo, ni le asigna otro numero -usa el
  // mismo numero_recibo que ya tenia). Sirve tanto desde "Buscar recibo" como desde "Buscar por
  // cliente", donde cada abono listado tiene su propio boton "Reimprimir".
  const reimprimirRecibo = async (apartado, items, abono) => {
    await generarReciboAbonoPDF(apartado, items, abono, settings, { imprimir: true });
  };

  // Buscador: por numero de Recibo de Abono (ej. "45" -> REC-000045), o por cliente (nombre,
  // cedula/RIF o telefono -coincidencia parcial), para ver de un vistazo todos sus apartados y
  // todos sus recibos de abono, sin tener que ir entrando uno por uno desde la lista general.
  const [modoBusqueda, setModoBusqueda] = useState(null); // null | 'recibo' | 'cliente'
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [resultadoRecibo, setResultadoRecibo] = useState(null);
  const [resultadoCliente, setResultadoCliente] = useState(null);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    const data = await window.api.listarApartados(filtroEstado === 'todos' ? null : filtroEstado);
    setApartados(data);
    setCargando(false);
  }, [filtroEstado]);

  useEffect(() => {
    if (vista === 'lista') cargarLista();
  }, [vista, cargarLista]);

  const abrirDetalle = (id) => {
    setApartadoActivoId(id);
    setVista('detalle');
  };

  // Al guardar un apartado nuevo: vuelve a la lista principal (no al detalle) y muestra la
  // ventanilla de resumen encima de ella.
  const handleApartadoGuardado = (apartado, items, abono) => {
    setVista('lista');
    setResumenTransaccion({ apartado, items, abono: abono || null });
  };

  // Al registrar un abono desde el detalle: se queda en la misma pantalla (no hace falta volver
  // a la lista, ya se esta viendo el apartado) y muestra el mismo resumen encima.
  const handleAbonoRegistrado = (apartado, items, abono) => {
    setResumenTransaccion({ apartado, items, abono });
  };

  const abrirBuscador = (modo) => {
    setModoBusqueda(modo);
    setTextoBusqueda('');
    setErrorBusqueda('');
    setResultadoRecibo(null);
    setResultadoCliente(null);
  };

  const ejecutarBusqueda = async () => {
    setErrorBusqueda('');
    setResultadoRecibo(null);
    setResultadoCliente(null);
    if (!textoBusqueda.trim()) return;
    setBuscando(true);
    try {
      if (modoBusqueda === 'recibo') {
        const res = await window.api.buscarReciboAbonoPorNumero(textoBusqueda.trim());
        if (!res.ok) { setErrorBusqueda(res.message); return; }
        setResultadoRecibo(res);
      } else if (modoBusqueda === 'numero') {
        // Este va directo al detalle del apartado (para abonar), no muestra una tarjeta de
        // resultado aparte como los otros dos modos.
        const res = await window.api.buscarApartadoPorNumero(textoBusqueda.trim());
        if (!res.ok) { setErrorBusqueda(res.message); return; }
        abrirBuscador(null);
        abrirDetalle(res.apartadoId);
      } else {
        const res = await window.api.buscarApartadosPorCliente(textoBusqueda.trim());
        if (!res.ok) { setErrorBusqueda(res.message); return; }
        if (res.apartados.length === 0) { setErrorBusqueda('No se encontró ningún apartado de ese cliente.'); return; }
        setResultadoCliente(res.apartados);
      }
    } finally {
      setBuscando(false);
    }
  };

  // El modal de resumen debe poder mostrarse encima de CUALQUIERA de las 3 vistas (lista, nuevo,
  // detalle), asi que en vez de "return" por separado para cada vista (como antes), se arma el
  // contenido en una variable y el modal se agrega siempre al final, fuera del if/else.
  let contenido;
  if (vista === 'nuevo') {
    contenido = (
      <ApartadoNuevo
        currentUser={currentUser}
        settings={settings}
        onCancelar={() => setVista('lista')}
        onGuardado={handleApartadoGuardado}
      />
    );
  } else if (vista === 'detalle' && apartadoActivoId) {
    contenido = (
      <ApartadoDetalle
        id={apartadoActivoId}
        currentUser={currentUser}
        settings={settings}
        onVolver={() => setVista('lista')}
        onAbonoRegistrado={handleAbonoRegistrado}
        onIrAFacturar={onIrAFacturar}
      />
    );
  } else {
    contenido = (
    <div>
      <h1>Apartados</h1>
      <p style={{ color: '#667085', marginTop: '-0.5rem' }}>
        Reservas de productos con abono: el cliente separa el producto y lo va pagando poco a poco.
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0', flexWrap: 'wrap', gap: '8px' }}>
        <div className="reportes-subtabs" style={{ marginBottom: 0 }}>
          {['activo', 'listo_para_entregar', 'completado', 'cancelado', 'todos'].map((e) => (
            <button
              key={e}
              className={filtroEstado === e ? 'active' : ''}
              onClick={() => setFiltroEstado(e)}
            >
              {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => abrirBuscador('recibo')}>🔎 Buscar recibo</button>
          <button onClick={() => abrirBuscador('numero')}>🔎 Buscar apartado</button>
          <button onClick={() => abrirBuscador('cliente')}>🔎 Buscar por cliente</button>
          <button onClick={() => setVista('nuevo')}>+ Nuevo apartado</button>
        </div>
      </div>

      {modoBusqueda && (
        <div className="form-box" style={{ marginBottom: '1.25rem', background: '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>
              {modoBusqueda === 'recibo'
                ? 'Buscar Recibo de Abono por número'
                : modoBusqueda === 'numero'
                  ? 'Buscar apartado por número (para abonar)'
                  : 'Buscar apartados por cliente'}
            </h3>
            <button onClick={() => abrirBuscador(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem', alignItems: 'center' }}>
            <input
              autoFocus
              value={textoBusqueda}
              onChange={(e) => setTextoBusqueda(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ejecutarBusqueda(); }}
              placeholder={
                modoBusqueda === 'recibo'
                  ? 'Ej: 45 o REC-000045'
                  : modoBusqueda === 'numero'
                    ? 'Ej: 9'
                    : 'Nombre, cédula/RIF o teléfono del cliente'
              }
              style={{ flex: 1, maxWidth: 360 }}
            />
            <button onClick={ejecutarBusqueda} disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
          </div>
          {errorBusqueda && <p style={{ color: '#b42318', marginBottom: 0 }}>{errorBusqueda}</p>}

          {resultadoRecibo && (
            <div style={{ marginTop: '1rem', background: '#fff', border: '1px solid #d0d5dd', borderRadius: 8, padding: '0.9rem' }}>
              <h4 style={{ margin: '0 0 6px' }}>
                Recibo REC-{String(resultadoRecibo.abono.numero_recibo).padStart(6, '0')}
              </h4>
              <p style={{ margin: '2px 0' }}><strong>Cliente:</strong> {resultadoRecibo.apartado.cliente_nombre} {resultadoRecibo.apartado.cliente_telefono ? `— ${resultadoRecibo.apartado.cliente_telefono}` : ''}</p>
              <p style={{ margin: '2px 0' }}><strong>Apartado N°:</strong> {resultadoRecibo.apartado.numero} <Badge estado={resultadoRecibo.apartado.estado} /></p>
              <p style={{ margin: '2px 0' }}><strong>Monto abonado en este recibo:</strong> ${fmt(resultadoRecibo.abono.monto_usd)}</p>
              <p style={{ margin: '2px 0' }}><strong>Fecha:</strong> {resultadoRecibo.abono.created_at} — <strong>Atendido por:</strong> {resultadoRecibo.abono.usuario || '—'}</p>
              <p style={{ margin: '2px 0' }}><strong>Productos del apartado:</strong> {resultadoRecibo.items.map((it) => it.descripcion).join(', ')}</p>
              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '8px' }}>
                <button onClick={() => abrirDetalle(resultadoRecibo.apartado.id)}>Ver apartado completo</button>
                <button onClick={() => reimprimirRecibo(resultadoRecibo.apartado, resultadoRecibo.items, resultadoRecibo.abono)}>Reimprimir recibo</button>
              </div>
            </div>
          )}

          {resultadoCliente && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {resultadoCliente.map((a) => (
                <div key={a.id} style={{ background: '#fff', border: '1px solid #d0d5dd', borderRadius: 8, padding: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>Apartado N° {a.numero} <Badge estado={a.estado} /></h4>
                    <button onClick={() => abrirDetalle(a.id)}>Ver apartado completo</button>
                  </div>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#475467' }}>
                    {a.cliente_nombre} {a.cliente_telefono ? `— ${a.cliente_telefono}` : ''} · {a.deposito_nombre || '—'} · {a.created_at}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    Productos: {a.items.map((it) => it.descripcion).join(', ')}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    Total: <strong>${fmt(a.total_usd)}</strong> — Abonado: <strong style={{ color: '#0b8f4e' }}>${fmt(a.abonado_usd)}</strong> — Saldo: <strong style={{ color: a.saldo_usd > 0 ? '#b42318' : '#0b8f4e' }}>${fmt(a.saldo_usd)}</strong>
                  </p>
                  {a.abonos.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee', color: '#667085' }}>
                          <th style={{ padding: '4px' }}>Recibo</th>
                          <th>Fecha</th>
                          <th>Monto</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.abonos.map((ab) => (
                          <tr key={ab.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                            <td style={{ padding: '4px' }}>REC-{String(ab.numero_recibo).padStart(6, '0')}</td>
                            <td>{ab.created_at}</td>
                            <td>${fmt(ab.monto_usd)}</td>
                            <td><button onClick={() => reimprimirRecibo(a, a.items, ab)} style={{ fontSize: '0.78rem' }}>Reimprimir</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : apartados.length === 0 ? (
        <p>No hay apartados en este estado.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>N°</th>
              <th>Cliente</th>
              <th>Depósito</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Abonado</th>
              <th>Saldo</th>
              <th>Documento</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apartados.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{a.numero}</td>
                <td>{a.cliente_nombre}</td>
                <td>{a.deposito_nombre || '—'}</td>
                <td><Badge estado={a.estado} /></td>
                <td>${fmt(a.total_usd)}</td>
                <td>${fmt(a.abonado_usd)}</td>
                <td style={{ color: a.saldo_usd > 0 ? '#b42318' : '#0b8f4e', fontWeight: 600 }}>
                  ${fmt(a.saldo_usd)}
                </td>
                <td style={{ fontSize: '0.85rem' }}>{textoDocumento(a) || '—'}</td>
                <td>{a.created_at}</td>
                <td>
                  <button onClick={() => abrirDetalle(a.id)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    );
  }

  return (
    <>
      {contenido}
      {resumenTransaccion && (
        <ModalResumenApartado
          apartado={resumenTransaccion.apartado}
          items={resumenTransaccion.items}
          abono={resumenTransaccion.abono}
          settings={settings}
          onImprimir={() => generarReciboAbonoPDF(resumenTransaccion.apartado, resumenTransaccion.items, resumenTransaccion.abono, settings, { imprimir: true })}
          onCerrar={cerrarResumen}
          onFacturar={handleFacturarDesdeResumen}
        />
      )}
    </>
  );
}

// ---------------- Nuevo apartado ----------------
function ApartadoNuevo({ currentUser, settings, onCancelar, onGuardado }) {
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');
  const [productos, setProductos] = useState([]);

  // Cliente: mismo patron de busqueda por cedula/RIF que Facturacion.
  const [cedula, setCedula] = useState('');
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarModalClienteNuevo, setMostrarModalClienteNuevo] = useState(false);

  const [productoIdFila, setProductoIdFila] = useState('');
  const [cantidadFila, setCantidadFila] = useState(1);
  const [precioFila, setPrecioFila] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [abonoInicial, setAbonoInicial] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Refs para el flujo de captura rapida por Enter del renglon "Productos a apartar":
  // Producto -> (Enter) -> Cantidad -> (Enter) -> Precio -> (Enter) agrega el renglon al
  // carrito y devuelve el foco a Producto, listo para cargar el siguiente item sin tocar
  // el mouse -igual que un punto de venta-.
  const refProducto = useRef(null);
  const refCantidad = useRef(null);
  const refPrecio = useRef(null);

  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!depositoId) return;
    window.api.listProducts(null, null, Number(depositoId)).then(setProductos);
  }, [depositoId]);

  // Al elegir un producto en el combobox, se sugiere su precio en USD (precio2) para no tener
  // que escribirlo a mano, pero se puede cambiar libremente antes de agregarlo.
  useEffect(() => {
    if (!productoIdFila) { setPrecioFila(''); return; }
    const p = productos.find((x) => String(x.id) === String(productoIdFila));
    if (p) setPrecioFila(String(p.precio2 || p.precio || ''));
  }, [productoIdFila, productos]);

  const buscarClientePorEnter = async () => {
    const texto = cedula.trim();
    if (!texto) return;
    setBuscandoCliente(true);
    try {
      const encontrado = await window.api.buscarClientePorCedula(texto);
      if (encontrado) {
        setClienteSeleccionado(encontrado);
        setCedula(encontrado.rif_cedula || texto);
      } else {
        setMostrarModalClienteNuevo(true);
      }
    } finally {
      setBuscandoCliente(false);
    }
  };

  const handleClienteCreado = (cliente) => {
    setClienteSeleccionado(cliente);
    setCedula(cliente.rif_cedula || '');
    setMostrarModalClienteNuevo(false);
  };

  const quitarCliente = () => {
    setClienteSeleccionado(null);
    setCedula('');
  };

  const productoSeleccionado = productos.find((p) => String(p.id) === String(productoIdFila));

  const agregarAlCarrito = () => {
    setError('');
    if (!productoSeleccionado) { setError('Selecciona un producto'); refProducto.current?.focus(); return; }
    const cant = parseInt(cantidadFila, 10) || 0;
    if (cant < 1) { setError('La cantidad debe ser al menos 1'); refCantidad.current?.focus(); return; }
    const yaEnCarrito = carrito.filter((c) => c.productId === productoSeleccionado.id).reduce((a, c) => a + c.cantidad, 0);
    if (cant + yaEnCarrito > (productoSeleccionado.stock_disponible || 0)) {
      setError(`Solo hay ${productoSeleccionado.stock_disponible || 0} disponibles de "${productoSeleccionado.nombre}"`);
      return;
    }
    const precio = parseFloat(precioFila) || 0;
    setCarrito([
      ...carrito,
      { key: `${productoSeleccionado.id}-${Date.now()}`, productId: productoSeleccionado.id, nombre: productoSeleccionado.nombre, cantidad: cant, precioUnitarioUsd: precio }
    ]);
    setProductoIdFila('');
    setCantidadFila(1);
    setPrecioFila('');
    // Vuelve el foco al selector de producto para cargar el siguiente item sin usar el mouse.
    refProducto.current?.focus();
  };

  const quitarDelCarrito = (key) => setCarrito(carrito.filter((c) => c.key !== key));

  const totalUsd = carrito.reduce((acc, c) => acc + c.cantidad * c.precioUnitarioUsd, 0);

  const handleGuardar = async () => {
    setError('');
    if (!clienteSeleccionado && !cedula.trim()) { setError('Indica el cliente que aparta'); return; }
    if (carrito.length === 0) { setError('Agrega al menos un producto al apartado'); return; }
    const abono = parseFloat(abonoInicial) || 0;
    if (abono > totalUsd + 0.005) { setError('El abono inicial no puede ser mayor al total'); return; }

    setGuardando(true);
    try {
      const res = await window.api.crearApartado({
        clienteId: clienteSeleccionado?.id || null,
        clienteNombre: clienteSeleccionado?.nombre || cedula.trim(),
        clienteTelefono: clienteSeleccionado?.telefono || '',
        depositoId: Number(depositoId),
        items: carrito.map((c) => ({
          productId: c.productId,
          descripcion: c.nombre,
          cantidad: c.cantidad,
          precioUnitarioUsd: c.precioUnitarioUsd
        })),
        abonoInicial: abono,
        notas,
        usuario: currentUser?.username
      });
      if (!res.ok) { setError(res.message || 'No se pudo crear el apartado'); return; }
      // Ya no se imprime automaticamente aqui: se vuelve a la lista principal y se muestra la
      // ventanilla de resumen (con el boton "Imprimir recibo" si hubo abono inicial).
      onGuardado(res.apartado, res.items, res.abonoInicial);
    } finally {
      setGuardando(false);
    }
  };

  const saldoInicial = Math.max(0, totalUsd - (parseFloat(abonoInicial) || 0));

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE APARTADOS</span>
        <span className="pos-topbar-center">NUEVO APARTADO</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Cliente (Cédula / RIF) <span className="required-mark">*</span></label>
            <input
              value={cedula}
              onChange={(e) => { setCedula(e.target.value); if (clienteSeleccionado) setClienteSeleccionado(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarClientePorEnter(); } }}
              placeholder="Cédula/RIF y Enter para buscar o crear"
              disabled={!!clienteSeleccionado || buscandoCliente}
            />
          </div>

          <div className="pos-field">
            <label>Depósito <span className="required-mark">*</span></label>
            <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
              {depositos.length === 0 && <option value="">-- No hay depósitos --</option>}
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.codigo ? `${d.codigo} - ` : ''}{d.nombre}</option>
              ))}
            </select>
          </div>

          {clienteSeleccionado && (
            <div className="pos-actions-row">
              <button type="button" className="pos-btn-link" onClick={quitarCliente}>Cambiar cliente</button>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscandoCliente ? (
            <div className="pos-stripe placeholder">Buscando cliente...</div>
          ) : clienteSeleccionado ? (
            <>
              <div className="pos-stripe">{clienteSeleccionado.nombre || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.rif_cedula || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.telefono || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe la cédula o RIF y presiona Enter</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Apartado</div>
          <div className="pos-right-row">
            <span>Total productos</span>
            <span>${fmt(totalUsd)}</span>
          </div>
          <div className="pos-right-row">
            <span>Abono inicial</span>
            <span>${fmt(parseFloat(abonoInicial) || 0)}</span>
          </div>
          <div className="pos-right-row total-final">
            <span>Saldo pendiente</span>
            <span>${fmt(saldoInicial)}</span>
          </div>
        </div>
      </div>

      {error && <div className="pos-error-banner">{error}</div>}

      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '46%' }}>Producto</th>
              <th style={{ width: '12%' }}>Cantidad</th>
              <th style={{ width: '16%' }}>Precio ($)</th>
              <th style={{ width: '16%', textAlign: 'right' }}>Subtotal ($)</th>
              <th style={{ width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="fila-entrada">
              <td>
                <SelectorProducto
                  ref={refProducto}
                  productos={productos}
                  value={productoIdFila}
                  onChange={setProductoIdFila}
                  onEnterSeleccionar={() => refCantidad.current?.focus()}
                  placeholder="Nombre o código de producto"
                />
              </td>
              <td>
                <input
                  ref={refCantidad}
                  type="number"
                  min="1"
                  value={cantidadFila}
                  onChange={(e) => setCantidadFila(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); refPrecio.current?.focus(); refPrecio.current?.select(); } }}
                />
              </td>
              <td>
                <input
                  ref={refPrecio}
                  type="number"
                  step="0.01"
                  value={precioFila}
                  onChange={(e) => setPrecioFila(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarAlCarrito(); } }}
                />
              </td>
              <td className="text-right" style={{ paddingTop: 8 }}>
                ${fmt((parseInt(cantidadFila, 10) || 0) * (parseFloat(precioFila) || 0))}
              </td>
              <td>
                <button type="button" className="pos-btn-link" onClick={agregarAlCarrito}>+ Agregar</button>
              </td>
            </tr>
            {carrito.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#98a2b3', padding: '1rem' }}>Aún no has agregado productos a este apartado.</td></tr>
            ) : (
              carrito.map((c) => (
                <tr key={c.key}>
                  <td>{c.nombre}</td>
                  <td>{c.cantidad}</td>
                  <td>${fmt(c.precioUnitarioUsd)}</td>
                  <td className="text-right">${fmt(c.cantidad * c.precioUnitarioUsd)}</td>
                  <td><button type="button" className="pos-btn-link" onClick={() => quitarDelCarrito(c.key)}>Quitar</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-panels" style={{ marginTop: '0.75rem' }}>
        <div className="pos-left">
          <div className="pos-field">
            <label>Abono inicial (USD, opcional)</label>
            <input type="number" step="0.01" value={abonoInicial} onChange={(e) => setAbonoInicial(e.target.value)} />
          </div>
        </div>
        <div className="pos-mid">
          <div className="pos-field">
            <label>Notas (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>
      </div>

      <div className="pos-footer-actions">
        <button type="button" className="btn-ghost" onClick={onCancelar} style={{ marginRight: 'auto' }}>Cancelar</button>
        <button type="button" className="pos-btn-totalizar" onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar apartado'}
        </button>
      </div>

      {mostrarModalClienteNuevo && (
        <ClienteNuevoModal
          cedulaInicial={cedula}
          onConfirm={handleClienteCreado}
          onCancel={() => setMostrarModalClienteNuevo(false)}
        />
      )}
    </div>
  );
}

// ---------------- Detalle de un apartado ----------------
function ApartadoDetalle({ id, currentUser, settings, onVolver, onAbonoRegistrado, onIrAFacturar }) {
  const [datos, setDatos] = useState(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [facturasCliente, setFacturasCliente] = useState([]);
  const [facturaElegida, setFacturaElegida] = useState('');

  const cargar = useCallback(async () => {
    const res = await window.api.detalleApartado(id);
    if (res.ok) setDatos(res);
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Para la pantalla de "listo para entregar": trae las facturas mas recientes del mismo
  // cliente, para que sea facil elegir cual es la que ya se hizo a mano en Facturacion (en vez
  // de tener que copiar el numero a mano). Siempre se puede cerrar sin elegir ninguna.
  useEffect(() => {
    if (datos?.apartado?.estado !== 'listo_para_entregar') return;
    window.api.listFacturas().then((todas) => {
      const nombre = (datos.apartado.cliente_nombre || '').trim().toLowerCase();
      setFacturasCliente(todas.filter((f) => (f.cliente_nombre || '').trim().toLowerCase() === nombre).slice(0, 15));
    });
  }, [datos]);

  if (!datos) return <div><button onClick={onVolver}>← Volver</button><p>Cargando...</p></div>;

  const { apartado, items, abonos } = datos;

  const handleAbonar = async () => {
    setError('');
    const m = parseFloat(montoAbono);
    if (!m || m <= 0) { setError('Monto invalido'); return; }
    setProcesando(true);
    try {
      const res = await window.api.abonarApartado(id, m, currentUser?.username);
      if (!res.ok) { setError(res.message || 'No se pudo registrar el abono'); return; }
      setMontoAbono('');
      cargar();
      // Ya no se imprime automaticamente aqui: se muestra la ventanilla de resumen (con el
      // boton "Imprimir recibo") encima de esta misma pantalla.
      onAbonoRegistrado(res.apartado, res.items, res.abono);
    } finally {
      setProcesando(false);
    }
  };

  const handleCancelar = async () => {
    setProcesando(true);
    try {
      const res = await window.api.cancelarApartado(id, currentUser?.username, motivoCancelar);
      if (!res.ok) { setError(res.message || 'No se pudo cancelar'); return; }
      setMostrarCancelar(false);
      cargar();
    } finally {
      setProcesando(false);
    }
  };

  const handleIrAFacturar = async (modo) => {
    setProcesando(true);
    setError('');
    try {
      // Se marca "listo_para_entregar" la PRIMERA vez, para que el producto se mantenga
      // reservado mientras se hace la factura/nota de venta. Si el apartado ya quedo en ese
      // estado (por ejemplo, un intento anterior se interrumpio a mitad de camino), no hay que
      // volver a marcarlo -de hecho el sistema lo rechazaria, porque esa accion exige que este
      // 'activo'- simplemente se reintenta el paso de facturar directamente.
      if (apartado.estado === 'activo') {
        const res = await window.api.marcarApartadoListoParaEntregar(id, currentUser?.username);
        if (!res.ok) { setError(res.message || 'No se pudo actualizar'); return; }
      }
      onIrAFacturar({
        apartadoId: apartado.id,
        numero: apartado.numero,
        total: apartado.total_usd,
        depositoId: apartado.deposito_id,
        clienteId: apartado.cliente_id,
        clienteNombre: apartado.cliente_nombre,
        clienteTelefono: apartado.cliente_telefono,
        items
      }, modo);
    } finally {
      setProcesando(false);
    }
  };

  const handleCerrarApartado = async () => {
    setProcesando(true);
    try {
      const res = await window.api.completarApartado(id, facturaElegida ? Number(facturaElegida) : null, currentUser?.username);
      if (!res.ok) { setError(res.message || 'No se pudo cerrar el apartado'); return; }
      cargar();
    } finally {
      setProcesando(false);
    }
  };

  const puedeEntregar = apartado.saldo_usd <= 0.005;

  return (
    <div>
      <button onClick={onVolver}>← Volver a la lista</button>
      <h1>Apartado N° {apartado.numero} <Badge estado={apartado.estado} /></h1>

      <div className="form-box" style={{ maxWidth: 560 }}>
        <p><strong>Cliente:</strong> {apartado.cliente_nombre} {apartado.cliente_telefono ? `— ${apartado.cliente_telefono}` : ''}</p>
        <p><strong>Depósito:</strong> {apartado.deposito_nombre || '—'}</p>
        <p><strong>Fecha:</strong> {apartado.created_at}</p>
        {apartado.notas && <p><strong>Notas:</strong> {apartado.notas}</p>}
        {apartado.estado === 'cancelado' && apartado.motivo_cancelacion && (
          <p style={{ color: '#b42318' }}><strong>Motivo de cancelación:</strong> {apartado.motivo_cancelacion}</p>
        )}
        {apartado.factura_id && <p><strong>Facturado con:</strong> {textoDocumento(apartado)}</p>}
      </div>

      <h3 style={{ marginTop: '1.25rem' }}>Productos</h3>
      <table style={{ width: '100%', maxWidth: 640, borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '0.5rem' }}>Producto</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{it.descripcion}</td>
              <td>{it.cantidad}</td>
              <td>${fmt(it.precio_unitario_usd)}</td>
              <td>${fmt(it.cantidad * it.precio_unitario_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="form-box" style={{ maxWidth: 420, marginTop: '1rem' }}>
        <p>Total: <strong>${fmt(apartado.total_usd)}</strong></p>
        <p>Abonado: <strong style={{ color: '#0b8f4e' }}>${fmt(apartado.abonado_usd)}</strong></p>
        <p style={{ fontSize: '1.1rem' }}>
          Saldo pendiente: <strong style={{ color: apartado.saldo_usd > 0 ? '#b42318' : '#0b8f4e' }}>${fmt(apartado.saldo_usd)}</strong>
        </p>
      </div>

      <h3 style={{ marginTop: '1.25rem' }}>Abonos</h3>
      {abonos.length === 0 ? <p>Todavía no hay abonos registrados.</p> : (
        <table style={{ width: '100%', maxWidth: 560, borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Recibo</th>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Usuario</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {abonos.map((ab) => (
              <tr key={ab.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>REC-{String(ab.numero_recibo).padStart(6, '0')}</td>
                <td>{ab.created_at}</td>
                <td>${fmt(ab.monto_usd)}</td>
                <td>{ab.usuario || '—'}</td>
                <td>
                  <button
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => generarReciboAbonoPDF(apartado, items, ab, settings, { imprimir: true })}
                  >
                    Reimprimir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {apartado.estado === 'activo' && !puedeEntregar && (
        <div className="form-box" style={{ maxWidth: 360, marginTop: '1rem' }}>
          <h4>Registrar abono</h4>
          <input type="number" step="0.01" value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)} placeholder="Monto en USD" />
          <button onClick={handleAbonar} disabled={procesando} style={{ marginTop: 6 }}>Abonar</button>
        </div>
      )}

      {apartado.estado === 'activo' && puedeEntregar && (
        <div className="form-box" style={{ maxWidth: 420, marginTop: '1rem', background: '#f0fdf4' }}>
          <h4>Ya está pagado por completo — ¿cómo lo facturamos?</h4>
          <p style={{ fontSize: '0.9rem', color: '#475467' }}>
            Te llevamos a la pantalla correspondiente con el cliente y el producto ya cargados
            (si es Teléfono, SIM o USIM, ahí mismo te pedirá el IMEI/código como siempre).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleIrAFacturar('factura')} disabled={procesando}>
              🧾 Generar factura
            </button>
            <button onClick={() => handleIrAFacturar('notaVenta')} disabled={procesando}>
              📝 Nota de venta
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#98a2b3', marginTop: 8, marginBottom: 0 }}>
            El producto sigue reservado hasta que termines de facturarlo.
          </p>
        </div>
      )}

      {apartado.estado === 'listo_para_entregar' && (
        <div className="form-box" style={{ maxWidth: 420, marginTop: '1rem', background: '#fffaeb', border: '1px solid #fedf89' }}>
          <h4 style={{ color: '#b54708' }}>⚠️ La factura de este apartado no se completó</h4>
          <p style={{ fontSize: '0.9rem', color: '#475467' }}>
            Se intentó facturar (o hacer nota de venta) pero el proceso no se terminó — puede que
            se haya cerrado el programa o se haya cancelado a mitad de camino. El producto sigue
            reservado. Puedes intentarlo de nuevo con confianza: el sistema no deja crear una
            factura duplicada para este apartado.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleIrAFacturar('factura')} disabled={procesando}>
              🧾 Generar factura
            </button>
            <button onClick={() => handleIrAFacturar('notaVenta')} disabled={procesando}>
              📝 Nota de venta
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475467', marginTop: '1rem' }}>
            O si ya la hiciste a mano en Facturación, vincúlala aquí para cerrar el apartado:
          </p>
          <label>Factura de este cliente (opcional)</label>
          <select value={facturaElegida} onChange={(e) => setFacturaElegida(e.target.value)}>
            <option value="">— Sin vincular factura —</option>
            {facturasCliente.map((f) => (
              <option key={f.id} value={f.id}>
                #{f.numero_factura || f.id} — ${fmt(f.total_usd)} — {f.created_at}
              </option>
            ))}
          </select>
          <button onClick={handleCerrarApartado} disabled={procesando} style={{ marginTop: 6 }}>
            Cerrar apartado
          </button>
        </div>
      )}

      {(apartado.estado === 'activo' || apartado.estado === 'listo_para_entregar') && (
        <div style={{ marginTop: '1rem' }}>
          {!mostrarCancelar ? (
            <button onClick={() => setMostrarCancelar(true)}>Cancelar apartado</button>
          ) : (
            <div className="form-box" style={{ maxWidth: 420 }}>
              <label>Motivo de la cancelación (opcional)</label>
              <input value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} />
              <div style={{ marginTop: 6 }}>
                <button onClick={handleCancelar} disabled={procesando}>Confirmar cancelación</button>{' '}
                <button onClick={() => setMostrarCancelar(false)}>Volver</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
