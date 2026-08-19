import React, { useState, useEffect, useRef } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';
import ClienteNuevoModal from '../components/ClienteNuevoModal.jsx';

export default function Facturacion({ currentUser }) {
  const [settings, setSettings] = useState(null);

  // Deposito: toda la factura se hace contra UN solo deposito (de ahi sale el stock y las
  // unidades disponibles que se muestran). Se elige aqui arriba, antes de agregar productos.
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // Precio 1 / Precio 2 -> Bs. / Dolares. Al buscar un producto por su codigo, el precio
  // unitario se toma de "precio" (Bs.) o "precio2" (Dolares) segun lo que este seleccionado aqui.
  const [tipoPrecio, setTipoPrecio] = useState('precio'); // 'precio' | 'precio2'

  // Cliente: se busca EXACTO por cedula/RIF al presionar Enter. Si existe, se trae de una vez
  // (se muestra en las franjas azules); si no existe, se abre la ventana modal para registrarlo.
  const [cedula, setCedula] = useState('');
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarModalClienteNuevo, setMostrarModalClienteNuevo] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteEdicion, setClienteEdicion] = useState({ nombre: '', rif_cedula: '', telefono: '', direccion: '', email: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // ---- Renglon de entrada (fila superior de la tabla) ----
  // Se escribe el "codigo de producto" (el codigo corto, ej. "ss24") y se presiona Enter: si se
  // encuentra, se muestran Descripcion/Precio/Total y el foco pasa a Cantidad (accesorios) o al
  // codigo individual IMEI/ICCID (equipos, SIM, USIM), ya que esos si necesitan un codigo unico
  // por unidad para poder facturarse.
  const [filaCodigo, setFilaCodigo] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [filaProducto, setFilaProducto] = useState(null);
  const [filaCantidad, setFilaCantidad] = useState(1);
  const [filaImei, setFilaImei] = useState('');
  const [filaUnidadesDisponibles, setFilaUnidadesDisponibles] = useState([]);
  const [errorFila, setErrorFila] = useState('');

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);
  const imeiRef = useRef(null);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  // Carga los depositos activos al entrar a Facturacion y deja el primero seleccionado por
  // defecto (normalmente "Principal").
  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    setTimeout(() => codigoRef.current?.focus(), 0);
  }, []);

  // ---- Cliente: buscar por cedula/RIF al presionar Enter ----
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
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const quitarCliente = () => {
    setClienteSeleccionado(null);
    setEditandoCliente(false);
    setMostrarModalClienteNuevo(false);
    setCedula('');
  };

  const abrirEdicionCliente = () => {
    if (!clienteSeleccionado) return;
    setClienteEdicion({
      nombre: clienteSeleccionado.nombre || '',
      rif_cedula: clienteSeleccionado.rif_cedula || '',
      telefono: clienteSeleccionado.telefono || '',
      direccion: clienteSeleccionado.direccion || '',
      email: clienteSeleccionado.email || ''
    });
    setEditandoCliente(true);
  };

  const guardarEdicionCliente = async () => {
    setError('');
    if (!clienteEdicion.nombre.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }
    setGuardandoEdicion(true);
    try {
      const res = await window.api.updateCliente(clienteSeleccionado.id, clienteEdicion);
      if (!res.ok) {
        setError(res.message || 'No se pudo actualizar el cliente');
        return;
      }
      setClienteSeleccionado(res.cliente);
      setCedula(res.cliente.rif_cedula || '');
      setEditandoCliente(false);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // ---- Renglon de entrada: buscar producto por codigo ----
  const limpiarFila = () => {
    setFilaCodigo('');
    setFilaProducto(null);
    setFilaCantidad(1);
    setFilaImei('');
    setFilaUnidadesDisponibles([]);
    setErrorFila('');
  };

  const codigosEnCarritoSet = () =>
    new Set(carrito.filter((i) => i.codigo).map((i) => i.codigo.toLowerCase()));

  const buscarProductoPorCodigoEnter = async () => {
    setErrorFila('');
    const texto = filaCodigo.trim();
    if (!texto) return;
    if (!depositoId) {
      setErrorFila('Selecciona primero el deposito');
      return;
    }
    setBuscandoCodigo(true);
    try {
      const p = await window.api.buscarProductoPorCodigo(texto, Number(depositoId));
      if (!p) {
        setErrorFila(`No se encontro ningun producto con el codigo "${texto}"`);
        return;
      }
      if ((p.stock_disponible || 0) <= 0) {
        setErrorFila(`"${p.nombre}" no tiene stock disponible en este deposito`);
        return;
      }
      setFilaProducto(p);
      if (p.tipo === 'accesorio') {
        setFilaCantidad(1);
        setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
      } else {
        const unidades = await window.api.listUnits(p.id, Number(depositoId));
        const usados = codigosEnCarritoSet();
        setFilaUnidadesDisponibles(
          unidades.filter((u) => u.estado === 'disponible' && !usados.has(u.codigo.toLowerCase()))
        );
        setTimeout(() => imeiRef.current?.focus(), 0);
      }
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const precioFila = () => {
    if (!filaProducto) return 0;
    const p = tipoPrecio === 'precio2' ? filaProducto.precio2 : filaProducto.precio;
    return parseFloat(p) || 0;
  };

  const totalFila = () => {
    if (!filaProducto) return 0;
    if (filaProducto.tipo === 'accesorio') {
      return precioFila() * (parseInt(filaCantidad, 10) || 0);
    }
    return precioFila();
  };

  // Confirma la fila de un accesorio (Enter en Cantidad) y la agrega a la factura.
  const confirmarFilaAccesorio = () => {
    setErrorFila('');
    const c = parseInt(filaCantidad, 10);
    if (!c || c <= 0) { setErrorFila('Cantidad invalida'); return; }
    if (c > filaProducto.stock_disponible) { setErrorFila('No hay suficiente stock disponible'); return; }
    setCarrito((prev) => [
      ...prev,
      {
        key: `${filaProducto.id}-${Date.now()}`,
        product_id: filaProducto.id,
        tipo: 'accesorio',
        descripcion: filaProducto.nombre,
        codigo: filaProducto.codigo_producto || null,
        cantidad: c,
        precio_unitario: precioFila()
      }
    ]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  // Confirma la fila de un equipo/SIM/USIM (Enter en el codigo IMEI/ICCID individual).
  const confirmarFilaImei = () => {
    setErrorFila('');
    const texto = filaImei.trim();
    if (!texto) return;
    const textoLower = texto.toLowerCase();
    if (carrito.some((it) => it.codigo && it.codigo.toLowerCase() === textoLower)) {
      setErrorFila('Ese codigo ya esta agregado en la factura');
      return;
    }
    const unidad = filaUnidadesDisponibles.find((u) => u.codigo.toLowerCase() === textoLower);
    if (!unidad) {
      setErrorFila('Codigo no encontrado entre las unidades disponibles de este producto');
      return;
    }
    setCarrito((prev) => [
      ...prev,
      {
        key: `${filaProducto.id}-${unidad.id}`,
        product_id: filaProducto.id,
        unit_id: unidad.id,
        tipo: filaProducto.tipo,
        descripcion: filaProducto.nombre,
        codigo: unidad.codigo,
        cantidad: 1,
        precio_unitario: precioFila()
      }
    ]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const quitarDelCarrito = (key) => {
    // Confirmacion dentro de la propia app (no window.confirm) para evitar que el
    // dialogo nativo de Electron deje los campos de la fila de entrada sin responder.
    setKeyPendienteQuitar(key);
  };

  const confirmarQuitarDelCarrito = () => {
    setCarrito(carrito.filter((item) => item.key !== keyPendienteQuitar));
    setKeyPendienteQuitar(null);
  };

  const cancelarQuitarDelCarrito = () => {
    setKeyPendienteQuitar(null);
  };

  const subtotal = carrito.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
  const ivaPorcentaje = settings ? parseFloat(settings.iva_porcentaje) : 0;
  const tasaCambio = settings ? parseFloat(settings.tasa_cambio) : 1;
  const iva = subtotal * (ivaPorcentaje / 100);
  const total = subtotal + iva;
  const totalBs = total * tasaCambio;
  const totalPiezas = carrito.reduce((acc, i) => acc + (parseInt(i.cantidad, 10) || 0), 0);
  const numeroFacturaPreview = settings && settings.numero_factura_siguiente
    ? String(settings.numero_factura_siguiente).padStart(6, '0')
    : '------';

  const handleTotalizar = async () => {
    setError('');
    if (carrito.length === 0) {
      setError('Agrega al menos un producto a la factura');
      return;
    }
    if (!clienteSeleccionado) {
      setError('Escribe la cedula del cliente y presiona Enter para buscarlo o registrarlo');
      return;
    }
    if (!depositoId) {
      setError('Selecciona el deposito del cual se factura');
      return;
    }
    const cliente = { id: clienteSeleccionado.id };
    setEmitiendo(true);
    try {
      const res = await window.api.crearFactura({
        cliente,
        items: carrito,
        usuario: currentUser?.username,
        depositoId: Number(depositoId)
      });

      if (!res.ok) {
        setError(res.message);
        return;
      }

      const detalle = await window.api.detalleFactura(res.facturaId);
      setConfirmacion({ ...res, detalle: detalle.ok ? detalle : null });
      setCarrito([]);
      quitarCliente();
      window.api.getSettings().then(setSettings);

      // La factura se imprime automaticamente al totalizar, sin que el usuario tenga que
      // pedirlo aparte (igual que ya ocurre en Cargos y Descargos). El boton "Imprimir PDF" de
      // la pantalla de confirmacion queda disponible por si hace falta reimprimir.
      if (detalle.ok) {
        try {
          await generarFacturaPDF(detalle.factura, detalle.items, { imprimir: true });
        } catch (errImpresion) {
          console.error('Error al imprimir la factura automaticamente:', errImpresion);
        }
      }
    } catch (err) {
      console.error('Error al emitir factura:', err);
      setError('Ocurrio un error inesperado al emitir la factura: ' + (err?.message || String(err)));
    } finally {
      setEmitiendo(false);
    }
  };

  // Atajo de teclado F10 = Totalizar, disponible en toda la pantalla de Facturacion (no solo
  // con el boton), igual que en el sistema de referencia.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10') {
        e.preventDefault();
        handleTotalizar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const [imprimiendoFactura, setImprimiendoFactura] = useState(false);

  const handleImprimir = async () => {
    if (!confirmacion?.detalle) return;
    setImprimiendoFactura(true);
    try {
      await generarFacturaPDF(confirmacion.detalle.factura, confirmacion.detalle.items, { imprimir: true });
    } finally {
      setImprimiendoFactura(false);
    }
  };

  if (confirmacion) {
    return (
      <div>
        <h1>Factura emitida</h1>
        <div className="form-box" style={{ maxWidth: '400px' }}>
          <p><strong>N° de factura:</strong> {confirmacion.numero}</p>
          <p><strong>Total:</strong> ${fmt(confirmacion.totalUsd)} USD (Bs {fmt(confirmacion.totalBs)})</p>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>La factura ya se envio a imprimir automaticamente.</p>
          <button onClick={handleImprimir} disabled={imprimiendoFactura} style={{ marginRight: '8px' }}>
            {imprimiendoFactura ? 'Imprimiendo...' : 'Reimprimir PDF'}
          </button>
          <button onClick={() => setConfirmacion(null)}>Hacer otra factura</button>
        </div>
      </div>
    );
  }

  const cambiarDeposito = (nuevoId) => {
    // Cambiar de deposito a mitad de una factura invalida los codigos/unidades que ya estaban
    // en el carrito (pertenecen al deposito anterior), asi que se avisa y se vacia el carrito.
    if (carrito.length > 0 && !window.confirm('Cambiar de deposito vacia los productos que ya agregaste a esta factura (pertenecen al deposito anterior). ¿Deseas continuar?')) {
      return;
    }
    setDepositoId(nuevoId);
    setCarrito([]);
    limpiarFila();
  };

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE VENTAS</span>
        <span className="pos-topbar-center">FACTURACIÓN</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Cliente <span className="required-mark">*</span></label>
            <input
              placeholder="Cedula o RIF + Enter"
              value={cedula}
              onChange={(e) => { setCedula(e.target.value); if (clienteSeleccionado) setClienteSeleccionado(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarClientePorEnter(); } }}
              disabled={!!clienteSeleccionado || buscandoCliente}
            />
          </div>

          <div className="pos-field">
            <label>Vendedor <span className="required-mark">*</span></label>
            <input value={currentUser?.username || ''} disabled />
          </div>

          <div className="pos-field">
            <label>Depósito <span className="required-mark">*</span></label>
            <select value={depositoId} onChange={(e) => cambiarDeposito(e.target.value)}>
              {depositos.length === 0 && <option value="">-- No hay depositos --</option>}
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.codigo} - {d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="pos-field">
            <label>Precio</label>
            <select value={tipoPrecio} onChange={(e) => setTipoPrecio(e.target.value)}>
              <option value="precio">Bs.</option>
              <option value="precio2">Dólares</option>
            </select>
          </div>

          {clienteSeleccionado && !editandoCliente && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem' }}>
              <button type="button" onClick={quitarCliente}>Cambiar cliente</button>
              <button type="button" onClick={abrirEdicionCliente}>Editar datos</button>
            </div>
          )}

          {clienteSeleccionado && editandoCliente && (
            <div style={{ marginTop: '4px', background: '#f2f4f7', padding: '8px', borderRadius: '6px' }}>
              <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 6px' }}>Editando datos del cliente:</p>
              <input placeholder="Cedula o RIF" value={clienteEdicion.rif_cedula}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, rif_cedula: e.target.value })}
                style={{ width: '100%', marginBottom: '6px', padding: '5px' }} />
              <input placeholder="Nombre y apellido" value={clienteEdicion.nombre}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, nombre: e.target.value })}
                style={{ width: '100%', marginBottom: '6px', padding: '5px' }} />
              <input placeholder="Telefono" value={clienteEdicion.telefono}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, telefono: e.target.value })}
                style={{ width: '100%', marginBottom: '6px', padding: '5px' }} />
              <input placeholder="Direccion" value={clienteEdicion.direccion}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, direccion: e.target.value })}
                style={{ width: '100%', marginBottom: '6px', padding: '5px' }} />
              <input placeholder="Email (opcional)" value={clienteEdicion.email}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, email: e.target.value })}
                style={{ width: '100%', marginBottom: '6px', padding: '5px' }} />
              <button type="button" onClick={guardarEdicionCliente} disabled={guardandoEdicion} style={{ marginRight: '8px' }}>
                {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => setEditandoCliente(false)}>Cancelar</button>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscandoCliente ? (
            <div className="pos-stripe placeholder">Buscando cliente...</div>
          ) : clienteSeleccionado ? (
            <>
              <div className="pos-stripe">{clienteSeleccionado.nombre}</div>
              <div className="pos-stripe">{clienteSeleccionado.rif_cedula || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.telefono || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe la cedula o RIF y presiona Enter</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Factura N° {numeroFacturaPreview}</div>
          <div className="pos-right-row">
            <span>Total renglones</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="pos-right-row">
            <span>Impuestos</span>
            <span>{fmt(iva)}</span>
          </div>
          <div className="pos-right-row total-final">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
          <div className="pos-right-row">
            <span>Vuelto</span>
            <span>{fmt(0)}</span>
          </div>
          <div className="pos-right-footer">
            <span>Total cantidad o piezas</span>
            <span>{carrito.length}&nbsp;&nbsp;{totalPiezas}</span>
          </div>
        </div>
      </div>

      {(error || errorFila) && <div className="pos-error-banner">{error || errorFila}</div>}

      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '16%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '10%' }}>Cantidad</th>
              <th style={{ width: '8%' }}>Und</th>
              <th style={{ width: '13%' }}>Precio</th>
              <th style={{ width: '13%' }}>Total</th>
              <th style={{ width: '6%' }}></th>
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
                    disabled={buscandoCodigo}
                  />
                ) : filaProducto.tipo === 'accesorio' ? (
                  <span>{filaProducto.codigo_producto || '—'}</span>
                ) : (
                  <input
                    ref={imeiRef}
                    type="text"
                    placeholder="IMEI / código + Enter"
                    value={filaImei}
                    onChange={(e) => setFilaImei(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmarFilaImei(); }
                      if (e.key === 'Escape') { e.preventDefault(); limpiarFila(); setTimeout(() => codigoRef.current?.focus(), 0); }
                    }}
                  />
                )}
              </td>
              <td>{filaProducto ? filaProducto.nombre : <span style={{ color: '#98a2b3' }}>—</span>}</td>
              <td>
                {filaProducto && filaProducto.tipo === 'accesorio' ? (
                  <input
                    ref={cantidadRef}
                    type="number"
                    min="1"
                    value={filaCantidad}
                    onChange={(e) => setFilaCantidad(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarFilaAccesorio(); } }}
                  />
                ) : (
                  <span>{filaProducto ? 1 : ''}</span>
                )}
              </td>
              <td>{filaProducto ? 'UND' : ''}</td>
              <td className="text-right">{filaProducto ? fmt(precioFila()) : ''}</td>
              <td className="text-right">{filaProducto ? fmt(totalFila()) : ''}</td>
              <td>
                {filaProducto && (
                  <button type="button" onClick={() => { limpiarFila(); setTimeout(() => codigoRef.current?.focus(), 0); }}>×</button>
                )}
              </td>
            </tr>

            {carrito.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Aun no has agregado productos.
                </td>
              </tr>
            ) : (
              carrito.map((item) => (
                <tr key={item.key}>
                  <td>{item.codigo || '—'}</td>
                  <td>{item.descripcion}</td>
                  <td>{item.cantidad}</td>
                  <td>UND</td>
                  <td className="text-right">{fmt(item.precio_unitario)}</td>
                  <td className="text-right">{fmt(item.precio_unitario * item.cantidad)}</td>
                  <td>
                    {keyPendienteQuitar === item.key ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', fontSize: '0.75rem' }}>
                        <button type="button" onClick={confirmarQuitarDelCarrito} style={{ color: '#b42318' }}>Si</button>
                        <button type="button" onClick={cancelarQuitarDelCarrito}>No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => quitarDelCarrito(item.key)}>×</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-footer-actions">
        <span style={{ marginRight: '16px', color: '#667085', fontSize: '0.85rem', alignSelf: 'center' }}>
          Tasa: {tasaCambio} Bs/USD — Total en Bs: <strong>Bs {fmt(totalBs)}</strong>
        </span>
        <button type="button" className="pos-btn-totalizar" onClick={handleTotalizar} disabled={emitiendo}>
          {emitiendo ? 'Totalizando...' : 'F10 Totalizar'}
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
