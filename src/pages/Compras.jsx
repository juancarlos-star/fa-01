import React, { useState, useEffect, useRef } from 'react';
import { generarCompraFacturaPDF } from '../utils/generarCompraFacturaPDF.js';
import { fmt } from '../utils/format.js';
import ProveedorNuevoModal from '../components/ProveedorNuevoModal.jsx';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
import CodigosNuevosModal from '../components/CodigosNuevosModal.jsx';

// Modulo de Compras, con el mismo diseno y forma de trabajar que Facturacion: un renglon de
// entrada donde se escribe el codigo o nombre del producto y Enter, franjas azules con los
// datos del proveedor, y el cuadro de totales arriba a la derecha. La diferencia principal es
// que aqui el "Precio" de cada renglon es en realidad el COSTO de compra (editable, porque
// cambia segun el proveedor/lote), y en vez de elegir unidades YA existentes (como en
// Facturacion), aqui se ingresan los codigos/IMEI NUEVOS que estan entrando al inventario.
export default function Compras({ currentUser }) {
  const [settings, setSettings] = useState(null);

  // Deposito que recibe la mercancia de esta compra: toda la compra entra a UN solo deposito.
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // La moneda en la que se compra cada producto ya NO se elige a mano: se decide sola segun
  // el tipo de producto (SimCard y USIM siempre se compran en Bs.; Equipo y Accesorio siempre
  // en Dolares), que es como este negocio realmente trabaja con sus proveedores. El campo
  // "Costo" de la fila de entrada se etiqueta segun corresponda, y si es Bs. se convierte a $
  // automaticamente usando la tasa de cambio del dia (settings.tasa_cambio) ANTES de guardar,
  // para que el costo promedio, el valor del inventario y las ganancias sigan siempre en
  // dolares (que no cambian de valor de un dia a otro) y no se corrompan con montos en Bs.
  const monedaDeTipo = (tipo) => (tipo === 'simcard' || tipo === 'usim') ? 'Bs' : 'Dolares';
  const tasaCambio = settings ? (parseFloat(settings.tasa_cambio) || 1) : 1;

  // Documento de compra: numero de factura/nota de entrega del proveedor.
  const [documentoCompra, setDocumentoCompra] = useState('');

  // Numero de compra consecutivo que le asigna el sistema (id de compras_encabezado). Se
  // muestra como vista previa antes de registrar.
  const [proximoNumeroCompra, setProximoNumeroCompra] = useState(null);

  // Proveedor: se busca EXACTO por RIF al presionar Enter. Si existe, se trae de una vez (se
  // muestra en las franjas azules); si no existe, se abre la ventana modal para registrarlo.
  const [rifProveedor, setRifProveedor] = useState('');
  const [buscandoProveedor, setBuscandoProveedor] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [mostrarModalProveedorNuevo, setMostrarModalProveedorNuevo] = useState(false);
  const [editandoProveedor, setEditandoProveedor] = useState(false);
  const [proveedorEdicion, setProveedorEdicion] = useState({ nombre: '', rif: '', telefono: '', direccion: '' });
  const [guardandoEdicionProveedor, setGuardandoEdicionProveedor] = useState(false);

  // ---- Renglon de entrada (fila superior de la tabla) ----
  // Se escribe el codigo o nombre del producto y se presiona Enter: si se encuentra, se
  // muestran Descripcion/Costo y el foco pasa a Cantidad. Si NUNCA se ha creado ese producto,
  // se abre la ventana para crearlo al vuelo. Al confirmar Cantidad, si el producto requiere
  // codigo/IMEI individual (equipos, SIM, USIM), se abre la ventana para ir tipiando o leyendo
  // con la pistola los codigos NUEVOS que estan entrando.
  const [filaCodigo, setFilaCodigo] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [filaProducto, setFilaProducto] = useState(null);
  const [filaCosto, setFilaCosto] = useState('');
  const [filaCantidad, setFilaCantidad] = useState(1);
  const [errorFila, setErrorFila] = useState('');
  const [mostrarModalProductoNuevo, setMostrarModalProductoNuevo] = useState(false);
  const [mostrarModalCodigosNuevos, setMostrarModalCodigosNuevos] = useState(false);

  // ---- Editar el producto que esta actualmente en la fila de entrada ----
  // Reutiliza la misma ventana "PRODUCTO NUEVO" (ProductoRapidoModal) que crea productos al
  // vuelo, pero en modo edicion (le pasa el producto actual y ella misma decide entre crear
  // o actualizar).
  const [mostrarModalEditarProducto, setMostrarModalEditarProducto] = useState(false);

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);
  const proveedorRef = useRef(null);
  const documentoRef = useRef(null);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  // Ventana "Ver todo": igual que en Facturacion, muestra en grande todos los productos ya
  // agregados a la compra actual.
  const [mostrarModalVerTodo, setMostrarModalVerTodo] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  // Carga los depositos activos al entrar a Compras y deja el primero seleccionado por
  // defecto (normalmente "Principal"), igual que en Facturacion.
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

  // Al abrir el modulo de Compras el foco debe estar en el RIF del proveedor, listo para
  // empezar a registrar la compra.
  useEffect(() => {
    setTimeout(() => proveedorRef.current?.focus(), 0);
  }, []);

  // ---- Proveedor: buscar por RIF al presionar Enter ----
  const buscarProveedorPorEnter = async () => {
    const texto = rifProveedor.trim();
    if (!texto) return;
    setBuscandoProveedor(true);
    try {
      const encontrado = await window.api.buscarProveedorPorRif(texto);
      if (encontrado) {
        setProveedorSeleccionado(encontrado);
        setRifProveedor(encontrado.rif || texto);
        // Proveedor ya registrado: el foco pasa a Documento de compra (el siguiente dato que
        // hace falta llenar), sin que el usuario tenga que hacer click.
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

  // ---- Renglon de entrada: buscar producto por codigo o nombre ----
  const limpiarFila = () => {
    setFilaCodigo('');
    setFilaProducto(null);
    setFilaCosto('');
    setFilaCantidad(1);
    setErrorFila('');
    setMostrarModalCodigosNuevos(false);
  };

  // El costo promedio del producto (costo_promedio_usd) siempre esta guardado en dolares. Si
  // el producto se compra en Bs. (SimCard/USIM), se convierte a Bs. con la tasa del dia para
  // prellenar el campo "Costo" con un numero que tiene sentido en la moneda que se va a
  // escribir; si se compra en dolares, se deja tal cual.
  const prefillCosto = (p) => {
    const costoUsd = p.costo_promedio_usd != null ? Number(p.costo_promedio_usd) : 0;
    return monedaDeTipo(p.tipo) === 'Bs' ? String(Math.round(costoUsd * tasaCambio * 100) / 100) : String(costoUsd);
  };

  const seleccionarProductoEnFila = (p) => {
    setFilaProducto(p);
    setFilaCosto(prefillCosto(p));
    setFilaCantidad(1);
    setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
  };

  // ---- Editar el producto de la fila de entrada (misma ventana "PRODUCTO NUEVO") ----
  const abrirEdicionProducto = () => {
    if (!filaProducto) return;
    setMostrarModalEditarProducto(true);
  };

  const confirmarEdicionProducto = (productoActualizado) => {
    setMostrarModalEditarProducto(false);
    // Refleja de inmediato los cambios en la fila de entrada, sin tener que volver a buscar
    // el producto. El costo de la fila tambien se actualiza si cambio el costo promedio.
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
        // Nunca se ha creado este producto: se abre la ventana para crearlo al vuelo, con el
        // codigo/nombre que ya se escribio.
        setMostrarModalProductoNuevo(true);
        return;
      }
      if (p.multiplesCoincidencias) {
        setErrorFila(`Hay ${p.cantidad} productos que coinciden con "${texto}". Se mas especifico o usa el codigo exacto.`);
        return;
      }
      if (p.noDisponible || p.otroDeposito) {
        // Esto pasa si lo que se escribio coincide con un codigo/IMEI individual ya
        // registrado en el inventario, en vez del codigo o nombre del PRODUCTO. En Compras no
        // aplica (no se esta vendiendo ni verificando disponibilidad), asi que se avisa.
        setErrorFila(`"${texto}" corresponde a un codigo/IMEI individual ya registrado, no a un producto. Escribe el codigo o nombre del producto para comprar.`);
        return;
      }
      seleccionarProductoEnFila(p);
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const handleProductoNuevoCreado = (producto) => {
    setMostrarModalProductoNuevo(false);
    seleccionarProductoEnFila(producto);
  };

  // Costo de la fila actual, siempre convertido a dolares: si el producto se compra en Bs.
  // (SimCard/USIM), se divide entre la tasa del dia; si se compra en dolares, se usa tal cual.
  const costoUsdFila = () => {
    if (!filaProducto) return 0;
    const c = parseFloat(filaCosto) || 0;
    return monedaDeTipo(filaProducto.tipo) === 'Bs' ? c / tasaCambio : c;
  };

  const totalFila = () => costoUsdFila() * (parseInt(filaCantidad, 10) || 0);

  // Confirma la cantidad (Enter en Cantidad o en Costo). Para accesorios se agrega directo a
  // la compra (solo hace falta la cantidad total). Para equipos/SIM/USIM se abre la ventana
  // para ir ingresando, uno por uno, los codigos/IMEI NUEVOS de las unidades que estan
  // entrando, hasta completar la cantidad indicada.
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
          costoOriginalUnitario: costo,
          monedaItem: monedaDeTipo('accesorio'),
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
        costoOriginalUnitario: parseFloat(filaCosto) || 0,
        monedaItem: monedaDeTipo(filaProducto.tipo),
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
    // Confirmacion dentro de la propia app (no window.confirm), igual que en Facturacion, para
    // evitar que el dialogo nativo de Electron deje los campos de la fila de entrada sin
    // responder.
    setKeyPendienteQuitar(key);
  };

  const confirmarQuitarDelCarrito = () => {
    setCarrito(carrito.filter((item) => item.key !== keyPendienteQuitar));
    setKeyPendienteQuitar(null);
  };

  const cancelarQuitarDelCarrito = () => {
    setKeyPendienteQuitar(null);
  };

  const baseImponible = carrito.reduce((acc, i) => acc + i.costoUnitario * i.cantidad, 0);
  const ivaPorcentaje = settings ? parseFloat(settings.iva_porcentaje) : 0;
  const iva = baseImponible * (ivaPorcentaje / 100);
  const total = baseImponible + iva;
  const totalPiezas = carrito.reduce((acc, i) => acc + (parseInt(i.cantidad, 10) || 0), 0);

  // Moneda del documento completo, derivada automaticamente de lo que hay en el carrito (ya
  // no se elige a mano): si todos los renglones son Bs. o todos son Dolares, se muestra esa;
  // si hay de ambas (por ejemplo SimCards en Bs. junto con un equipo en dolares en la misma
  // compra), se muestra "Mixta".
  const monedasEnCarrito = new Set(carrito.map((i) => i.monedaItem));
  const monedaDocumento = monedasEnCarrito.size === 0
    ? 'Dolares'
    : monedasEnCarrito.size > 1
      ? 'Mixta'
      : [...monedasEnCarrito][0];
  const numeroCompraPreview = proximoNumeroCompra != null ? String(proximoNumeroCompra).padStart(6, '0') : '------';

  // Mismo guard que en Facturacion: evita que la compra se pueda registrar/imprimir dos veces
  // si se mantiene presionada la tecla F10 o se hace doble clic muy rapido.
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
        moneda: monedaDocumento,
        tasaCambio,
        numeroFacturaCompra: documentoCompra.trim(),
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

      // La compra se imprime automaticamente al registrarla, ANTES de mostrar la pantalla de
      // "Compra registrada" (mismo orden que se corrigio en Facturacion, para evitar que el
      // usuario alcance a presionar "Reimprimir PDF" pensando que no se imprimio, generando el
      // PDF dos veces para la misma compra).
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

  // Atajo de teclado F10 = Registrar compra, igual que en Facturacion.
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
    // Cambiar de deposito a mitad de una compra no invalida nada tecnicamente (no hay codigos
    // ya escaneados que dependan del deposito, como en Facturacion), pero se avisa igual para
    // que quede claro que la mercancia entrara a un almacen distinto al que se venia usando.
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
        <span className="pos-topbar-center">COMPRAS</span>
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
              {/* Nombre, RIF y direccion son obligatorios para todo proveedor, asi que siempre
                  deberian traer un valor; el telefono es opcional. */}
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
            <span>{fmt(baseImponible)}</span>
          </div>
          <div className="pos-right-row">
            <span>IVA ({ivaPorcentaje}%)</span>
            <span>{fmt(iva)}</span>
          </div>
          <div className="pos-right-row total-final">
            <span>Total</span>
            <span>{fmt(total)}</span>
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
              <th style={{ width: '11%', textAlign: 'right' }}>
                Costo {filaProducto ? (monedaDeTipo(filaProducto.tipo) === 'Bs' ? '(Bs.)' : '($)') : ''}
              </th>
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
                  <input
                    ref={codigoRef}
                    type="text"
                    placeholder="Código + Enter"
                    value={filaCodigo}
                    onChange={(e) => setFilaCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarProductoPorCodigoEnter(); } }}
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
                  <>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={filaCosto}
                      onChange={(e) => setFilaCosto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarFila(); } }}
                      style={{ width: '90px', textAlign: 'right' }}
                    />
                    {monedaDeTipo(filaProducto.tipo) === 'Bs' && (
                      <div style={{ fontSize: '0.7rem', color: '#667085' }}>
                        ≈ ${fmt(costoUsdFila())} c/u (tasa {fmt(tasaCambio)})
                      </div>
                    )}
                  </>
                ) : ''}
              </td>
              <td className="text-right">{filaProducto ? fmt(totalFila()) : ''}</td>
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
                  <td className="text-right">
                    {item.monedaItem === 'Bs' ? `Bs. ${fmt(item.costoOriginalUnitario)}` : `$${fmt(item.costoOriginalUnitario)}`}
                  </td>
                  <td className="text-right">
                    ${fmt(item.costoUnitario * item.cantidad)}
                    {item.monedaItem === 'Bs' && (
                      <div style={{ fontSize: '0.7rem', color: '#667085' }}>
                        Bs. {fmt(item.costoOriginalUnitario * item.cantidad)}
                      </div>
                    )}
                  </td>
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
          Moneda: {monedaDocumento === 'Mixta' ? 'Mixta ($ y Bs.)' : monedaDocumento === 'Bs' ? 'Bs.' : 'Dólares'}
          {' '}— Tasa: {fmt(tasaCambio)} Bs/USD
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
                      <th className="text-right">Costo Und</th>
                      <th className="text-right">Total</th>
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
                        <td className="text-right">
                          {item.monedaItem === 'Bs' ? `Bs. ${fmt(item.costoOriginalUnitario)}` : `$${fmt(item.costoOriginalUnitario)}`}
                        </td>
                        <td className="text-right">
                          ${fmt(item.costoUnitario * item.cantidad)}
                          {item.monedaItem === 'Bs' && (
                            <div style={{ fontSize: '0.7rem', color: '#667085' }}>
                              Bs. {fmt(item.costoOriginalUnitario * item.cantidad)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pos-vertodo-footer">
              <span>Total cantidad de items: <strong>{totalPiezas}</strong></span>
              <span>Total: <strong>{fmt(total)}</strong></span>
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
