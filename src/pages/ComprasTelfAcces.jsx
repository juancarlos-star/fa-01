import React, { useState, useEffect, useRef } from 'react';
import { generarCompraFacturaPDF } from '../utils/generarCompraFacturaPDF.js';
import { fmt } from '../utils/format.js';
import ProveedorNuevoModal from '../components/ProveedorNuevoModal.jsx';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
import BuscadorProductoInput from '../components/BuscadorProductoInput.jsx';
import CodigosNuevosModal from '../components/CodigosNuevosModal.jsx';

// Modulo de compras para Telefonos y Accesorios (proveedores que venden sin IVA). Es un
// "hermano" del modulo "Compras" (ese quedo restringido solo a SIM/USIM, en Bs. con IVA
// normal): mismo diseno y misma forma de trabajar, pero aqui:
//   - Solo se pueden comprar productos de categoria Equipo o Accesorio.
//   - Todo se expresa y se guarda en DOLARES, nunca en Bs. (no hay conversion de por medio).
//   - El IVA siempre es 0,00% (proveedores que no cobran IVA), sin importar el % configurado
//     en Ajustes para el resto del sistema (Facturacion si lo sigue usando normal).
//   - El costo de cada renglon es editable, igual que en "Compras".
// Comparte el mismo backend/tabla (compras_encabezado, compras, inventory_units) que
// "Compras", asi que la numeracion de compra sigue el mismo consecutivo, y los reportes de
// ganancias/inventario no necesitan ningun cambio (todo ya queda en dolares).
export default function ComprasTelfAcces({ currentUser }) {
  const [settings, setSettings] = useState(null);

  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // Documento de compra: numero de factura/nota de entrega del proveedor.
  const [documentoCompra, setDocumentoCompra] = useState('');

  const [proximoNumeroCompra, setProximoNumeroCompra] = useState(null);

  const [rifProveedor, setRifProveedor] = useState('');
  const [buscandoProveedor, setBuscandoProveedor] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [mostrarModalProveedorNuevo, setMostrarModalProveedorNuevo] = useState(false);
  const [editandoProveedor, setEditandoProveedor] = useState(false);
  const [proveedorEdicion, setProveedorEdicion] = useState({ nombre: '', rif: '', telefono: '', direccion: '' });
  const [guardandoEdicionProveedor, setGuardandoEdicionProveedor] = useState(false);

  const [filaCodigo, setFilaCodigo] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [filaProducto, setFilaProducto] = useState(null);
  const [filaCosto, setFilaCosto] = useState('');
  const [filaCantidad, setFilaCantidad] = useState(1);
  const [errorFila, setErrorFila] = useState('');
  const [mostrarModalProductoNuevo, setMostrarModalProductoNuevo] = useState(false);
  const [mostrarModalCodigosNuevos, setMostrarModalCodigosNuevos] = useState(false);

  const [mostrarModalEditarProducto, setMostrarModalEditarProducto] = useState(false);

  // Lista de productos Equipo/Accesorio ya existentes, cargada una sola vez (y cuando cambia el
  // deposito), para alimentar el desplegable de sugerencias de BuscadorProductoInput mientras
  // se escribe -no reemplaza la busqueda exacta por codigo, que sigue yendo contra la base de
  // datos al presionar Enter (buscarProductoPorCodigoEnter, mas abajo).
  const [productosParaSugerencias, setProductosParaSugerencias] = useState([]);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const [equipo, accesorio] = await Promise.all([
        window.api.listProducts('equipo'),
        window.api.listProducts('accesorio')
      ]);
      if (!cancelado) setProductosParaSugerencias([...equipo, ...accesorio]);
    })();
    return () => { cancelado = true; };
  }, [depositoId]);

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);
  const proveedorRef = useRef(null);
  const documentoRef = useRef(null);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  const [mostrarModalVerTodo, setMostrarModalVerTodo] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  const cargarProximoNumeroCompra = () => {
    window.api.proximoNumeroCompra().then((res) => setProximoNumeroCompra(res.proximoNumero));
  };
  useEffect(() => { cargarProximoNumeroCompra(); }, []);

  useEffect(() => {
    setTimeout(() => proveedorRef.current?.focus(), 0);
  }, []);

  const buscarProveedorPorEnter = async () => {
    const texto = rifProveedor.trim();
    if (!texto) return;
    setBuscandoProveedor(true);
    try {
      const encontrado = await window.api.buscarProveedorPorRif(texto);
      if (encontrado) {
        setProveedorSeleccionado(encontrado);
        setRifProveedor(encontrado.rif || texto);
        // Igual que en "Compras": al aceptar el proveedor, el foco pasa directo a Documento
        // de compra, sin que el usuario tenga que hacer click.
        setTimeout(() => documentoRef.current?.focus(), 0);
      } else {
        setMostrarModalProveedorNuevo(true);
      }
    } finally {
      setBuscandoProveedor(false);
    }
  };

  const handleProveedorCreado = (proveedor) => {
    setProveedorSeleccionado(proveedor);
    setRifProveedor(proveedor.rif || '');
    setMostrarModalProveedorNuevo(false);
    setTimeout(() => documentoRef.current?.focus(), 0);
  };

  const quitarProveedor = () => {
    setProveedorSeleccionado(null);
    setEditandoProveedor(false);
    setMostrarModalProveedorNuevo(false);
    setRifProveedor('');
    setTimeout(() => proveedorRef.current?.focus(), 0);
  };

  const abrirEdicionProveedor = () => {
    if (!proveedorSeleccionado) return;
    setProveedorEdicion({
      nombre: proveedorSeleccionado.nombre || '',
      rif: proveedorSeleccionado.rif || '',
      telefono: proveedorSeleccionado.telefono || '',
      direccion: proveedorSeleccionado.direccion || ''
    });
    setEditandoProveedor(true);
  };

  const guardarEdicionProveedor = async () => {
    setError('');
    if (!proveedorEdicion.nombre.trim()) { setError('El nombre del proveedor es obligatorio'); return; }
    if (!proveedorEdicion.rif.trim()) { setError('El RIF del proveedor es obligatorio'); return; }
    if (!proveedorEdicion.direccion.trim()) { setError('La direccion del proveedor es obligatoria'); return; }
    setGuardandoEdicionProveedor(true);
    try {
      const res = await window.api.updateProveedor(proveedorSeleccionado.id, proveedorEdicion);
      if (!res.ok) {
        setError(res.message || 'No se pudo actualizar el proveedor');
        return;
      }
      setProveedorSeleccionado(res.proveedor);
      setRifProveedor(res.proveedor.rif || '');
      setEditandoProveedor(false);
    } finally {
      setGuardandoEdicionProveedor(false);
    }
  };

  const limpiarFila = () => {
    setFilaCodigo('');
    setFilaProducto(null);
    setFilaCosto('');
    setFilaCantidad(1);
    setErrorFila('');
    setMostrarModalCodigosNuevos(false);
  };

  // El costo aqui SIEMPRE es en dolares (no hay conversion de por medio), asi que el
  // "prellenado" es directo con el costo promedio guardado (que tambien esta en dolares).
  const prefillCosto = (p) => String(p.costo_promedio_usd != null ? Number(p.costo_promedio_usd) : 0);

  const seleccionarProductoEnFila = (p) => {
    setFilaProducto(p);
    setFilaCosto(prefillCosto(p));
    setFilaCantidad(1);
    setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
  };

  const abrirEdicionProducto = () => {
    if (!filaProducto) return;
    setMostrarModalEditarProducto(true);
  };

  const confirmarEdicionProducto = (productoActualizado) => {
    setMostrarModalEditarProducto(false);
    setFilaProducto(productoActualizado);
    setFilaCosto(prefillCosto(productoActualizado));
  };

  const buscarProductoPorCodigoEnter = async () => {
    setErrorFila('');
    const texto = filaCodigo.trim();
    if (!texto) return;
    setBuscandoCodigo(true);
    try {
      const p = await window.api.buscarProductoPorCodigo(texto, depositoId ? Number(depositoId) : undefined);
      if (!p) {
        setMostrarModalProductoNuevo(true);
        return;
      }
      if (p.multiplesCoincidencias) {
        setErrorFila(`Hay ${p.cantidad} productos que coinciden con "${texto}". Se mas especifico o usa el codigo exacto.`);
        return;
      }
      if (p.noDisponible || p.otroDeposito) {
        setErrorFila(`"${texto}" corresponde a un codigo/IMEI individual ya registrado, no a un producto. Escribe el codigo o nombre del producto para comprar.`);
        return;
      }
      if (p.tipo !== 'equipo' && p.tipo !== 'accesorio') {
        setErrorFila('Este módulo "Compras Telf/Acces" solo admite Teléfonos o Accesorios. Para SIM/USIM, usa el módulo "Compras".');
        return;
      }
      seleccionarProductoEnFila(p);
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const handleProductoNuevoCreado = (producto) => {
    setMostrarModalProductoNuevo(false);
    setProductosParaSugerencias((prev) => [...prev, producto]);
    seleccionarProductoEnFila(producto);
  };

  const costoUsdFila = () => (filaProducto ? (parseFloat(filaCosto) || 0) : 0);

  const totalFila = () => costoUsdFila() * (parseInt(filaCantidad, 10) || 0);

  const confirmarFila = () => {
    setErrorFila('');
    const cant = parseInt(filaCantidad, 10);
    if (!cant || cant <= 0) { setErrorFila('Cantidad invalida'); return; }
    const costo = parseFloat(filaCosto);
    if (isNaN(costo) || costo < 0) { setErrorFila('Costo invalido'); return; }

    if (filaProducto.tipo === 'accesorio') {
      setCarrito((prev) => [
        ...prev,
        {
          key: `${filaProducto.id}-${Date.now()}`,
          product_id: filaProducto.id,
          tipo: 'accesorio',
          descripcion: filaProducto.nombre,
          producto_codigo: filaProducto.codigo_producto || null,
          costoUnitario: costoUsdFila(),
          cantidad: cant,
          codigos: null
        }
      ]);
      limpiarFila();
      setTimeout(() => codigoRef.current?.focus(), 0);
    } else {
      setMostrarModalCodigosNuevos(true);
    }
  };

  const confirmarCodigosNuevos = (codigosNuevos) => {
    setCarrito((prev) => [
      ...prev,
      {
        key: `${filaProducto.id}-${Date.now()}`,
        product_id: filaProducto.id,
        tipo: filaProducto.tipo,
        descripcion: filaProducto.nombre,
        producto_codigo: filaProducto.codigo_producto || null,
        costoUnitario: costoUsdFila(),
        cantidad: codigosNuevos.length,
        codigos: codigosNuevos
      }
    ]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const cancelarCodigosNuevos = () => {
    setMostrarModalCodigosNuevos(false);
  };

  const quitarDelCarrito = (key) => {
    setKeyPendienteQuitar(key);
  };

  const confirmarQuitarDelCarrito = () => {
    setCarrito(carrito.filter((item) => item.key !== keyPendienteQuitar));
    setKeyPendienteQuitar(null);
  };

  const cancelarQuitarDelCarrito = () => {
    setKeyPendienteQuitar(null);
  };

  // El IVA en este modulo SIEMPRE es 0,00% (proveedores que no cobran IVA), sin importar el %
  // configurado en Ajustes para el resto del sistema.
  const ivaPorcentaje = 0;
  const baseImponible = carrito.reduce((acc, i) => acc + i.costoUnitario * i.cantidad, 0);
  const iva = 0;
  const total = baseImponible;
  const totalPiezas = carrito.reduce((acc, i) => acc + (parseInt(i.cantidad, 10) || 0), 0);

  const numeroCompraPreview = proximoNumeroCompra != null ? String(proximoNumeroCompra).padStart(6, '0') : '------';

  const totalizandoRef = useRef(false);

  const handleRegistrarCompra = async () => {
    if (totalizandoRef.current) return;
    setError('');
    if (carrito.length === 0) {
      setError('Agrega al menos un producto a la compra');
      return;
    }
    if (!proveedorSeleccionado) {
      setError('Escribe el RIF del proveedor y presiona Enter para buscarlo o registrarlo');
      return;
    }
    if (!depositoId) {
      setError('Selecciona el deposito que recibe la mercancia');
      return;
    }
    if (!documentoCompra.trim()) {
      setError('Indica el numero de documento de compra');
      return;
    }

    totalizandoRef.current = true;
    setEmitiendo(true);
    try {
      const res = await window.api.crearCompraLote({
        proveedor: proveedorSeleccionado.nombre,
        proveedorId: proveedorSeleccionado.id,
        proveedorRif: proveedorSeleccionado.rif,
        proveedorTelefono: proveedorSeleccionado.telefono,
        proveedorDireccion: proveedorSeleccionado.direccion,
        moneda: 'Dolares',
        tasaCambio: settings ? (parseFloat(settings.tasa_cambio) || 1) : 1,
        numeroFacturaCompra: documentoCompra.trim(),
        // Proveedores sin IVA: se manda 0 explicito para que esta compra quede guardada con
        // 0,00% aunque el resto del sistema (Facturacion) use otro % configurado en Ajustes.
        ivaPorcentaje: 0,
        items: carrito.map((i) => ({
          product_id: i.product_id,
          costoUnitario: i.costoUnitario,
          cantidad: i.cantidad,
          codigos: i.codigos || undefined
        })),
        usuario: currentUser?.full_name || currentUser?.username,
        depositoId: Number(depositoId)
      });

      if (!res.ok) {
        setError(res.message);
        return;
      }

      const detalle = await window.api.detalleCompraEncabezado(res.encabezadoId);
      setCarrito([]);
      quitarProveedor();
      setDocumentoCompra('');
      cargarProximoNumeroCompra();

      if (detalle.ok) {
        try {
          await generarCompraFacturaPDF(detalle.encabezado, detalle.items, settings, { imprimir: true });
        } catch (errImpresion) {
          console.error('Error al imprimir la compra automaticamente:', errImpresion);
        }
      }

      setConfirmacion({ encabezadoId: res.encabezadoId, totalUsd: res.totalUsd, detalle: detalle.ok ? detalle : null });
    } catch (err) {
      console.error('Error al registrar la compra:', err);
      setError('Ocurrio un error inesperado al registrar la compra: ' + (err?.message || String(err)));
    } finally {
      setEmitiendo(false);
      totalizandoRef.current = false;
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10' && !e.repeat) {
        e.preventDefault();
        handleRegistrarCompra();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const [imprimiendoCompra, setImprimiendoCompra] = useState(false);

  const handleReimprimir = async () => {
    if (!confirmacion?.detalle) return;
    setImprimiendoCompra(true);
    try {
      await generarCompraFacturaPDF(confirmacion.detalle.encabezado, confirmacion.detalle.items, settings, { imprimir: true });
    } finally {
      setImprimiendoCompra(false);
    }
  };

  if (confirmacion) {
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <div className="check">✓</div>
          <h1>Compra registrada</h1>
        </div>
        <div className="pos-receipt-body">
          <div className="pos-receipt-row">
            <span>N° de compra</span>
            <strong>{String(confirmacion.encabezadoId).padStart(6, '0')}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Total USD</span>
            <strong>${fmt(confirmacion.totalUsd)}</strong>
          </div>
          <p className="pos-receipt-note">La compra ya se envio a imprimir automaticamente.</p>
        </div>
        <div className="pos-receipt-actions">
          <button className="btn-ghost" onClick={handleReimprimir} disabled={imprimiendoCompra}>
            {imprimiendoCompra ? 'Imprimiendo...' : 'Reimprimir PDF'}
          </button>
          <button className="btn-primary" onClick={() => setConfirmacion(null)}>Hacer otra compra</button>
        </div>
      </div>
    );
  }

  const cambiarDeposito = (nuevoId) => {
    if (carrito.length > 0 && !window.confirm('Cambiar de deposito vacia los productos que ya agregaste a esta compra. ¿Deseas continuar?')) {
      return;
    }
    setDepositoId(nuevoId);
    setCarrito([]);
    limpiarFila();
  };

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE COMPRAS</span>
        <span className="pos-topbar-center">COMPRAS TELF/ACCES</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Proveedor <span className="required-mark">*</span></label>
            <input
              ref={proveedorRef}
              placeholder="RIF + Enter"
              value={rifProveedor}
              onChange={(e) => { setRifProveedor(e.target.value); if (proveedorSeleccionado) setProveedorSeleccionado(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarProveedorPorEnter(); } }}
              disabled={!!proveedorSeleccionado || buscandoProveedor}
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
            <label>Documento de compra <span className="required-mark">*</span></label>
            <input
              ref={documentoRef}
              placeholder="N° de factura o nota de entrega"
              value={documentoCompra}
              onChange={(e) => setDocumentoCompra(e.target.value)}
            />
          </div>

          {proveedorSeleccionado && !editandoProveedor && (
            <div className="pos-actions-row">
              <button type="button" className="pos-btn-link" onClick={quitarProveedor}>Cambiar proveedor</button>
              <button type="button" className="pos-btn-link" onClick={abrirEdicionProveedor}>Editar datos</button>
            </div>
          )}

          {proveedorSeleccionado && editandoProveedor && (
            <div className="pos-edit-box">
              <p>Editando datos del proveedor:</p>
              <input placeholder="RIF *" value={proveedorEdicion.rif}
                onChange={(e) => setProveedorEdicion({ ...proveedorEdicion, rif: e.target.value })} />
              <input placeholder="Nombre / Razon social *" value={proveedorEdicion.nombre}
                onChange={(e) => setProveedorEdicion({ ...proveedorEdicion, nombre: e.target.value })} />
              <input placeholder="Telefono (opcional)" value={proveedorEdicion.telefono}
                onChange={(e) => setProveedorEdicion({ ...proveedorEdicion, telefono: e.target.value })} />
              <input placeholder="Direccion *" value={proveedorEdicion.direccion}
                onChange={(e) => setProveedorEdicion({ ...proveedorEdicion, direccion: e.target.value })} />
              <div className="pos-edit-actions">
                <button type="button" className="btn-primary" onClick={guardarEdicionProveedor} disabled={guardandoEdicionProveedor}>
                  {guardandoEdicionProveedor ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditandoProveedor(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscandoProveedor ? (
            <div className="pos-stripe placeholder">Buscando proveedor...</div>
          ) : proveedorSeleccionado ? (
            <>
              <div className="pos-stripe">{proveedorSeleccionado.nombre || '—'}</div>
              <div className="pos-stripe">{proveedorSeleccionado.rif || '—'}</div>
              <div className="pos-stripe">{proveedorSeleccionado.telefono || '—'}</div>
              <div className="pos-stripe">{proveedorSeleccionado.direccion || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe el RIF y presiona Enter</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Compra N° {numeroCompraPreview}</div>
          <div className="pos-right-row">
            <span>Base imponible</span>
            <span>${fmt(baseImponible)}</span>
          </div>
          <div className="pos-right-row">
            <span>IVA ({ivaPorcentaje}%)</span>
            <span>${fmt(iva)}</span>
          </div>
          <div className="pos-right-row total-final">
            <span>Total</span>
            <span>${fmt(total)}</span>
          </div>
          <div className="pos-right-footer">
            <span>Total cantidad de Items</span>
            <span>{totalPiezas}</span>
          </div>
        </div>
      </div>

      {(error || errorFila) && <div className="pos-error-banner">{error || errorFila}</div>}

      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '13%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '8%' }}>Cantidad</th>
              <th style={{ width: '6%' }}>Und</th>
              <th style={{ width: '11%', textAlign: 'right' }}>Costo Und ($)</th>
              <th style={{ width: '11%', textAlign: 'right' }}>Total ($)</th>
              <th style={{ width: '17%', textAlign: 'right' }}>
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
                  <BuscadorProductoInput
                    inputRef={codigoRef}
                    placeholder="Código + Enter"
                    value={filaCodigo}
                    onChangeValue={setFilaCodigo}
                    productos={productosParaSugerencias}
                    onSeleccionar={(p) => { setFilaCodigo(''); seleccionarProductoEnFila(p); }}
                    onEnterSinSeleccion={buscarProductoPorCodigoEnter}
                    disabled={buscandoCodigo}
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
              <td>{filaProducto ? 'UND' : ''}</td>
              <td className="text-right">
                {filaProducto ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={filaCosto}
                    onChange={(e) => setFilaCosto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarFila(); } }}
                    style={{ width: '90px', textAlign: 'right' }}
                  />
                ) : ''}
              </td>
              <td className="text-right">{filaProducto ? `$${fmt(totalFila())}` : ''}</td>
              <td>
                <div className="pos-entrada-acciones">
                  {filaProducto && (
                    <button type="button" className="pos-agregar-btn" onClick={confirmarFila}>
                      Agregar
                    </button>
                  )}
                  {filaProducto && (
                    <button type="button" className="pos-ver-todo-btn" onClick={abrirEdicionProducto}>
                      ✎ Editar
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
                <td colSpan={7} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Aun no has agregado productos.
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
                  <td className="text-right">${fmt(item.costoUnitario)}</td>
                  <td className="text-right">${fmt(item.costoUnitario * item.cantidad)}</td>
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
        <span style={{ marginRight: '16px', color: '#667085', fontSize: '0.85rem', alignSelf: 'center' }}>
          Moneda: Dólares — Sin IVA (proveedor exento)
        </span>
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarCompra} disabled={emitiendo}>
          {emitiendo ? 'Registrando...' : 'F10 Registrar compra'}
        </button>
      </div>

      {mostrarModalProveedorNuevo && (
        <ProveedorNuevoModal
          rifInicial={rifProveedor}
          onConfirm={handleProveedorCreado}
          onCancel={() => setMostrarModalProveedorNuevo(false)}
        />
      )}

      {mostrarModalProductoNuevo && (
        <ProductoRapidoModal
          codigoInicial={filaCodigo}
          tiposPermitidos={['equipo', 'accesorio']}
          onConfirm={handleProductoNuevoCreado}
          onCancel={() => setMostrarModalProductoNuevo(false)}
        />
      )}

      {mostrarModalCodigosNuevos && filaProducto && (
        <CodigosNuevosModal
          nombreProducto={filaProducto.nombre}
          tipo={filaProducto.tipo}
          cantidadNecesaria={parseInt(filaCantidad, 10) || 1}
          onConfirm={confirmarCodigosNuevos}
          onCancel={cancelarCodigosNuevos}
        />
      )}

      {mostrarModalEditarProducto && filaProducto && (
        <ProductoRapidoModal
          productoEditar={filaProducto}
          tiposPermitidos={['equipo', 'accesorio']}
          onConfirm={confirmarEdicionProducto}
          onCancel={() => setMostrarModalEditarProducto(false)}
        />
      )}

      {mostrarModalVerTodo && (
        <div className="pos-vertodo-overlay" onClick={() => setMostrarModalVerTodo(false)}>
          <div className="pos-vertodo-box" onClick={(e) => e.stopPropagation()}>
            <div className="pos-vertodo-header">
              <span>Productos de la compra</span>
              <button type="button" className="pos-vertodo-cerrar" onClick={() => setMostrarModalVerTodo(false)}>×</button>
            </div>
            <div className="pos-vertodo-body">
              {carrito.length === 0 ? (
                <p className="pos-vertodo-vacio">Aun no has agregado productos a esta compra.</p>
              ) : (
                <table className="pos-vertodo-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Und</th>
                      <th className="text-right">Costo Und ($)</th>
                      <th className="text-right">Total ($)</th>
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
                        <td className="text-right">${fmt(item.costoUnitario)}</td>
                        <td className="text-right">${fmt(item.costoUnitario * item.cantidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pos-vertodo-footer">
              <span>Total cantidad de items: <strong>{totalPiezas}</strong></span>
              <span>Total: <strong>${fmt(total)}</strong></span>
              <button type="button" className="btn-primary" onClick={() => setMostrarModalVerTodo(false)}>Cerrar</button>
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
