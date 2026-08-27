import React, { useState, useEffect, useRef } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';
import ClienteNuevoModal from '../components/ClienteNuevoModal.jsx';
import SeleccionUnidadesModal from '../components/SeleccionUnidadesModal.jsx';

export default function Facturacion({ currentUser, modo = 'factura' }) {
  // modo='notaVenta': mismo modulo, pero IVA siempre 0%, numeracion propia (separada de
  // Factura) y textos ajustados. Se guarda en la misma tabla facturas (columna es_nota_venta),
  // asi que los reportes de ventas/ganancias ya la toman en cuenta sin cambios aparte.
  const esNotaVenta = modo === 'notaVenta';
  const [settings, setSettings] = useState(null);

  // Deposito: toda la factura se hace contra UN solo deposito (de ahi sale el stock y las
  // unidades disponibles que se muestran). Se elige aqui arriba, antes de agregar productos.
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // Precio de venta: se escribe en DOLARES en el momento de facturar (se sugiere el
  // "Precio Dolares" guardado en el producto, pero el vendedor lo puede cambiar libremente
  // -por ejemplo para elegir entre los distintos planes de SimCard/USIM: $5, $7, $12, $29, o
  // $10 para cambio de SimCard). El equivalente en Bs. se calcula solo, en vivo, con la tasa
  // del dia (settings.tasa_cambio) - nunca se guarda un "precio en Bs." fijo, asi nunca queda
  // desactualizado aunque el dolar cambie de un dia a otro.
  const [filaPrecio, setFilaPrecio] = useState('');
  // Cuando se lee el codigo/IMEI individual exacto con la pistola, la unidad especifica ya se
  // conoce de una vez (no hace falta abrir el selector de unidades); se guarda aqui para que
  // "confirmarFila" la agregue directo al carrito con el precio que se haya escrito.
  const [filaUnidadEncontrada, setFilaUnidadEncontrada] = useState(null);

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
  const [filaUnidadesDisponibles, setFilaUnidadesDisponibles] = useState([]);
  const [errorFila, setErrorFila] = useState('');
  // Cuando se lee el IMEI/codigo individual directamente con la pistola, ya se sabe la unidad
  // exacta a facturar: se salta el paso de Cantidad y el modal de seleccion.
  const [mostrarModalUnidades, setMostrarModalUnidades] = useState(false);

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);
  const cedulaRef = useRef(null);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  // Ventana "Ver todo": muestra en grande, sin la limitacion de alto/scroll de la tabla
  // chica, todos los productos que ya estan agregados a la factura actual.
  const [mostrarModalVerTodo, setMostrarModalVerTodo] = useState(false);

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

  // Al abrir el modulo de ventas el foco debe estar en Cedula/RIF, listo para que el
  // vendedor empiece a facturar metiendo de una vez el documento del cliente.
  useEffect(() => {
    setTimeout(() => cedulaRef.current?.focus(), 0);
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
        // Cliente ya registrado: el foco pasa directo a Codigo para seguir agregando
        // productos a la factura, sin que el vendedor tenga que hacer click.
        setTimeout(() => codigoRef.current?.focus(), 0);
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
    setTimeout(() => cedulaRef.current?.focus(), 0);
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
    if (!clienteEdicion.rif_cedula.trim()) {
      setError('La cedula o RIF del cliente es obligatoria');
      return;
    }
    if (!clienteEdicion.direccion.trim()) {
      setError('La direccion del cliente es obligatoria');
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
    setFilaUnidadesDisponibles([]);
    setFilaUnidadEncontrada(null);
    setFilaPrecio('');
    setErrorFila('');
    setMostrarModalUnidades(false);
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
        setErrorFila(`No se encontro ningun producto con el codigo, IMEI o nombre "${texto}"`);
        return;
      }
      if (p.noDisponible) {
        setErrorFila(`El codigo "${p.codigo}" (${p.nombre}) ya fue vendido o no esta disponible`);
        return;
      }
      if (p.otroDeposito) {
        setErrorFila(`El codigo "${p.codigo}" (${p.nombre}) pertenece a otro deposito`);
        return;
      }
      if (p.multiplesCoincidencias) {
        setErrorFila(`Hay ${p.cantidad} productos que coinciden con "${texto}". Se mas especifico o usa el codigo exacto.`);
        return;
      }
      if ((p.stock_disponible || 0) <= 0) {
        setErrorFila(`"${p.nombre}" no tiene stock disponible en este deposito`);
        return;
      }

      // Se leyo (con pistola o a mano) el codigo individual exacto de una unidad: ya se sabe
      // cual pieza fisica es, asi que se salta el paso de "elegir unidades", pero SI se deja
      // que el vendedor confirme/edite el precio (importante para SimCard/USIM, que tienen
      // varios planes posibles) antes de agregarla a la factura.
      if (p.unidad_encontrada) {
        setFilaProducto(p);
        setFilaCantidad(1);
        setFilaUnidadEncontrada(p.unidad_encontrada);
        setFilaUnidadesDisponibles([p.unidad_encontrada]);
        setFilaPrecio(p.precio2 && parseFloat(p.precio2) > 0 ? String(p.precio2) : '');
        setFilaCodigo('');
        setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
        return;
      }

      setFilaProducto(p);
      setFilaCantidad(1);
      setFilaPrecio(p.precio2 && parseFloat(p.precio2) > 0 ? String(p.precio2) : '');
      if (p.tipo === 'accesorio') {
        setFilaUnidadesDisponibles([]);
      } else {
        // Para equipos/SIM/USIM se traen las unidades disponibles (con IMEI/ICCID propio) para
        // luego poder elegirlas en el selector de unidades segun la cantidad pedida.
        const unidades = await window.api.listUnits(p.id, Number(depositoId));
        const usados = codigosEnCarritoSet();
        setFilaUnidadesDisponibles(
          unidades.filter((u) => u.estado === 'disponible' && !usados.has(u.codigo.toLowerCase()))
        );
      }
      setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const precioFila = () => parseFloat(filaPrecio) || 0;

  const totalFila = () => {
    if (!filaProducto) return 0;
    return precioFila() * (parseInt(filaCantidad, 10) || 0);
  };

  // Cantidad maxima que se puede pedir en la fila actual: el stock del deposito para
  // accesorios, o la cantidad de unidades (IMEI/ICCID) disponibles para equipos/SIM/USIM.
  const maxDisponibleFila = () => {
    if (!filaProducto) return 0;
    return filaProducto.tipo === 'accesorio'
      ? (filaProducto.stock_disponible || 0)
      : filaUnidadesDisponibles.length;
  };

  // Confirma la cantidad (Enter en Cantidad). Para accesorios se agrega directo a la factura
  // (se descuenta del stock general del deposito). Para equipos/SIM/USIM se abre el selector de
  // unidades para escoger cuales IMEI/codigos puntuales se van a facturar.
  const confirmarFila = () => {
    setErrorFila('');
    const c = parseInt(filaCantidad, 10);
    if (!c || c <= 0) { setErrorFila('Cantidad invalida'); return; }
    if (c > maxDisponibleFila()) {
      setErrorFila(filaProducto.tipo === 'accesorio'
        ? 'No hay suficiente stock disponible'
        : `Solo hay ${maxDisponibleFila()} unidad(es) disponible(s) de "${filaProducto.nombre}" en este deposito`);
      return;
    }
    if (precioFila() <= 0) {
      setErrorFila('Escribe el precio en dolares ($) al que se vende este producto');
      return;
    }

    if (filaProducto.tipo === 'accesorio') {
      setCarrito((prev) => [
        ...prev,
        {
          key: `${filaProducto.id}-${Date.now()}`,
          product_id: filaProducto.id,
          tipo: 'accesorio',
          descripcion: filaProducto.nombre,
          producto_codigo: filaProducto.codigo_producto || null,
          codigo: filaProducto.codigo_producto || null,
          cantidad: c,
          precio_unitario: precioFila()
        }
      ]);
      limpiarFila();
      setTimeout(() => codigoRef.current?.focus(), 0);
    } else if (filaUnidadEncontrada) {
      // Unidad exacta ya conocida (se escaneo su codigo/IMEI directamente): se agrega de una
      // vez con el precio confirmado, sin pasar por el selector de unidades.
      setCarrito((prev) => [
        ...prev,
        {
          key: `${filaProducto.id}-${filaUnidadEncontrada.id}`,
          product_id: filaProducto.id,
          unit_id: filaUnidadEncontrada.id,
          tipo: filaProducto.tipo,
          descripcion: filaProducto.nombre,
          producto_codigo: filaProducto.codigo_producto || null,
          codigo: filaUnidadEncontrada.codigo,
          cantidad: 1,
          precio_unitario: precioFila()
        }
      ]);
      limpiarFila();
      setTimeout(() => codigoRef.current?.focus(), 0);
    } else {
      setMostrarModalUnidades(true);
    }
  };

  // Se llama cuando en el selector de unidades ya se escogieron todos los IMEI/codigos
  // pedidos: se agregan a la factura (uno por renglon, cada uno con su codigo real) y el foco
  // vuelve a Codigo para seguir cargando articulos.
  const confirmarSeleccionUnidades = (unidadesSeleccionadas) => {
    const nuevosItems = unidadesSeleccionadas.map((unidad) => ({
      key: `${filaProducto.id}-${unidad.id}`,
      product_id: filaProducto.id,
      unit_id: unidad.id,
      tipo: filaProducto.tipo,
      descripcion: filaProducto.nombre,
      producto_codigo: filaProducto.codigo_producto || null,
      codigo: unidad.codigo,
      cantidad: 1,
      precio_unitario: precioFila()
    }));
    setCarrito((prev) => [...prev, ...nuevosItems]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const cancelarSeleccionUnidades = () => {
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const quitarDelCarrito = (key) => {
    // Confirmacion dentro de la propia app (no window.confirm) para evitar que el
    // dialogo nativo de Electron deje los campos de la fila de entrada sin responder.
    setKeyPendienteQuitar(key);
  };

  const confirmarQuitarDelCarrito = () => {
    // keyPendienteQuitar puede ser la key de un solo item, o (cuando se quita un grupo entero
    // de la tabla ya agrupada) un array con varias keys.
    const keys = Array.isArray(keyPendienteQuitar) ? keyPendienteQuitar : [keyPendienteQuitar];
    setCarrito(carrito.filter((item) => !keys.includes(item.key)));
    setKeyPendienteQuitar(null);
  };

  const cancelarQuitarDelCarrito = () => {
    setKeyPendienteQuitar(null);
  };

  // Agrupa el carrito por producto (y precio unitario) para mostrar una sola fila por producto
  // en la tabla, con la cantidad total y -si tiene IMEI/codigos individuales- todos ellos
  // listados debajo de la descripcion, en vez de una fila por cada unidad.
  const gruposCarrito = (() => {
    const mapa = new Map();
    const orden = [];
    for (const item of carrito) {
      const groupKey = `${item.product_id}-${item.precio_unitario}`;
      if (!mapa.has(groupKey)) {
        mapa.set(groupKey, {
          groupKey,
          producto_codigo: item.producto_codigo || item.codigo || '—',
          descripcion: item.descripcion,
          tipo: item.tipo,
          codigosIndividuales: [],
          cantidad: 0,
          precio_unitario: item.precio_unitario,
          keys: []
        });
        orden.push(groupKey);
      }
      const g = mapa.get(groupKey);
      g.cantidad += item.cantidad;
      g.keys.push(item.key);
      if (item.tipo !== 'accesorio' && item.codigo) g.codigosIndividuales.push(item.codigo);
    }
    return orden.map((k) => {
      const g = mapa.get(k);
      g.codigosIndividuales.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return g;
    });
  })();

  const subtotal = carrito.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
  const ivaPorcentaje = esNotaVenta ? 0 : (settings ? parseFloat(settings.iva_porcentaje) : 0);
  const tasaCambio = settings ? parseFloat(settings.tasa_cambio) : 1;
  const iva = subtotal * (ivaPorcentaje / 100);
  const total = subtotal + iva;
  const totalBs = total * tasaCambio;
  const totalPiezas = carrito.reduce((acc, i) => acc + (parseInt(i.cantidad, 10) || 0), 0);
  const numeroSettingKey = esNotaVenta ? 'numero_nota_venta_siguiente' : 'numero_factura_siguiente';
  const numeroFacturaPreview = settings && settings[numeroSettingKey]
    ? String(settings[numeroSettingKey]).padStart(6, '0')
    : '------';

  // Guarda ademas del estado "emitiendo" (que solo controla el disabled visual del boton, y
  // tarda un instante en re-renderizar) una referencia que se activa de forma INMEDIATA y
  // sincronica. Esto evita que la factura se pueda emitir/imprimir dos veces si, por ejemplo,
  // se mantiene presionada la tecla F10 (el teclado repite el evento keydown) o se hace doble
  // clic muy rapido, justo en la ventana de tiempo antes de que el boton alcance a deshabilitarse.
  const totalizandoRef = useRef(false);

  const handleTotalizar = async () => {
    if (totalizandoRef.current) return;
    setError('');
    if (carrito.length === 0) {
      setError(`Agrega al menos un producto a la ${esNotaVenta ? 'nota de venta' : 'factura'}`);
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
    totalizandoRef.current = true;
    setEmitiendo(true);
    try {
      const res = await window.api.crearFactura({
        cliente,
        items: carrito,
        usuario: currentUser?.username,
        depositoId: Number(depositoId),
        esNotaVenta
      });

      if (!res.ok) {
        setError(res.message);
        return;
      }

      const detalle = await window.api.detalleFactura(res.facturaId);
      setCarrito([]);
      quitarCliente();
      window.api.getSettings().then(setSettings);

      // La factura se imprime automaticamente al totalizar, sin que el usuario tenga que
      // pedirlo aparte (igual que ya ocurre en Cargos y Descargos). Esto se hace ANTES de
      // mostrar la pantalla de "Factura emitida" (setConfirmacion) a proposito: esa pantalla
      // dice "la factura ya se envio a imprimir" y tiene el boton "Reimprimir PDF" habilitado
      // de inmediato. Si se mostrara esa pantalla antes de que termine esta impresion
      // automatica, el usuario podia alcanzar a presionar "Reimprimir PDF" pensando que no se
      // habia impreso, generando el PDF DOS VECES para la misma factura (Windows guarda la
      // segunda copia con el sufijo " (1)" porque la primera ya esta abierta/bloqueada por el
      // visor de PDF, y al abrir el mismo archivo dos veces casi al mismo tiempo el visor a
      // veces muestra una de las dos copias en blanco/negro).
      if (detalle.ok) {
        try {
          await generarFacturaPDF(detalle.factura, detalle.items, settings, { imprimir: true });
        } catch (errImpresion) {
          console.error('Error al imprimir la factura automaticamente:', errImpresion);
        }
      }

      setConfirmacion({ ...res, detalle: detalle.ok ? detalle : null });
    } catch (err) {
      console.error('Error al emitir factura:', err);
      setError('Ocurrio un error inesperado al emitir la factura: ' + (err?.message || String(err)));
    } finally {
      setEmitiendo(false);
      totalizandoRef.current = false;
    }
  };

  // Atajo de teclado F10 = Totalizar, disponible en toda la pantalla de Facturacion (no solo
  // con el boton), igual que en el sistema de referencia. e.repeat evita que, si se mantiene
  // presionada la tecla, el sistema operativo repita el evento keydown y se dispare la
  // totalizacion varias veces (ademas del guard totalizandoRef de arriba).
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10' && !e.repeat) {
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
      await generarFacturaPDF(confirmacion.detalle.factura, confirmacion.detalle.items, settings, { imprimir: true });
    } finally {
      setImprimiendoFactura(false);
    }
  };

  if (confirmacion) {
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <div className="check">✓</div>
          <h1>{esNotaVenta ? 'Nota de venta emitida' : 'Factura emitida'}</h1>
        </div>
        <div className="pos-receipt-body">
          <div className="pos-receipt-row">
            <span>N° de {esNotaVenta ? 'nota de venta' : 'factura'}</span>
            <strong>{confirmacion.numero}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Total USD</span>
            <strong>${fmt(confirmacion.totalUsd)}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Total Bs</span>
            <strong>Bs {fmt(confirmacion.totalBs)}</strong>
          </div>
          <p className="pos-receipt-note">La {esNotaVenta ? 'nota de venta' : 'factura'} ya se envio a imprimir automaticamente.</p>
        </div>
        <div className="pos-receipt-actions">
          <button className="btn-ghost" onClick={handleImprimir} disabled={imprimiendoFactura}>
            {imprimiendoFactura ? 'Imprimiendo...' : 'Reimprimir PDF'}
          </button>
          <button className="btn-primary" onClick={() => setConfirmacion(null)}>Hacer otra {esNotaVenta ? 'nota de venta' : 'factura'}</button>
        </div>
      </div>
    );
  }

  const cambiarDeposito = (nuevoId) => {
    // Cambiar de deposito a mitad de una factura invalida los codigos/unidades que ya estaban
    // en el carrito (pertenecen al deposito anterior), asi que se avisa y se vacia el carrito.
    if (carrito.length > 0 && !window.confirm(`Cambiar de deposito vacia los productos que ya agregaste a esta ${esNotaVenta ? 'nota de venta' : 'factura'} (pertenecen al deposito anterior). ¿Deseas continuar?`)) {
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
        <span className="pos-topbar-center">{esNotaVenta ? 'NOTA DE VENTA' : 'FACTURACIÓN'}</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Cliente <span className="required-mark">*</span></label>
            <input
              ref={cedulaRef}
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

          {clienteSeleccionado && !editandoCliente && (
            <div className="pos-actions-row">
              <button type="button" className="pos-btn-link" onClick={quitarCliente}>Cambiar cliente</button>
              <button type="button" className="pos-btn-link" onClick={abrirEdicionCliente}>Editar datos</button>
            </div>
          )}

          {clienteSeleccionado && editandoCliente && (
            <div className="pos-edit-box">
              <p>Editando datos del cliente:</p>
              <input placeholder="Cedula o RIF *" value={clienteEdicion.rif_cedula}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, rif_cedula: e.target.value })} />
              <input placeholder="Nombre y apellido *" value={clienteEdicion.nombre}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, nombre: e.target.value })} />
              <input placeholder="Telefono (opcional)" value={clienteEdicion.telefono}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, telefono: e.target.value })} />
              <input placeholder="Direccion *" value={clienteEdicion.direccion}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, direccion: e.target.value })} />
              <input placeholder="Email (opcional)" value={clienteEdicion.email}
                onChange={(e) => setClienteEdicion({ ...clienteEdicion, email: e.target.value })} />
              <div className="pos-edit-actions">
                <button type="button" className="btn-primary" onClick={guardarEdicionCliente} disabled={guardandoEdicion}>
                  {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditandoCliente(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscandoCliente ? (
            <div className="pos-stripe placeholder">Buscando cliente...</div>
          ) : clienteSeleccionado ? (
            <>
              {/* Nombre, cedula y direccion son obligatorios para todo cliente, asi que
                  siempre deberian traer un valor; el resto (ej. telefono) es opcional y
                  se muestra con un guion cuando no fue registrado. */}
              <div className="pos-stripe">{clienteSeleccionado.nombre || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.rif_cedula || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.telefono || '—'}</div>
              <div className="pos-stripe">{clienteSeleccionado.direccion || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe la cedula o RIF y presiona Enter</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">{esNotaVenta ? 'Nota de Venta' : 'Factura'} N° {numeroFacturaPreview}</div>
          <div className="pos-right-row">
            <span>Base imponible</span>
            <span>{fmt(subtotal)}</span>
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
              <th style={{ width: '13%', textAlign: 'right' }}>Precio ($)</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Total ($)</th>
              <th style={{ width: '15%', textAlign: 'right' }}>
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
              <td>{filaProducto ? 'UND' : ''}</td>
              <td className="text-right">
                {filaProducto ? (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={filaPrecio}
                      onChange={(e) => setFilaPrecio(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarFila(); } }}
                      placeholder="0.00"
                      style={{ width: '90px', textAlign: 'right' }}
                    />
                    <div style={{ fontSize: '0.7rem', color: '#667085' }}>
                      ≈ Bs {fmt(precioFila() * tasaCambio)} (tasa {fmt(tasaCambio)})
                    </div>
                  </>
                ) : ''}
              </td>
              <td className="text-right">{filaProducto ? fmt(totalFila()) : ''}</td>
              <td>
                <div className="pos-entrada-acciones">
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
              gruposCarrito.map((g) => (
                <tr key={g.groupKey}>
                  <td>{g.producto_codigo}</td>
                  <td>
                    <div>{g.descripcion}</div>
                    {g.codigosIndividuales.length > 0 && (
                      <div style={codigosListStyle}>
                        {g.codigosIndividuales.map((cod) => (
                          <div key={cod} style={codigoLineStyle}>{cod}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{g.cantidad}</td>
                  <td>UND</td>
                  <td className="text-right">{fmt(g.precio_unitario)}</td>
                  <td className="text-right">{fmt(g.precio_unitario * g.cantidad)}</td>
                  <td>
                    {Array.isArray(keyPendienteQuitar) && keyPendienteQuitar[0] === g.keys[0] ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <button type="button" className="pos-confirm-btn yes" onClick={confirmarQuitarDelCarrito}>Si</button>
                        <button type="button" className="pos-confirm-btn no" onClick={cancelarQuitarDelCarrito}>No</button>
                      </span>
                    ) : (
                      <button type="button" className="pos-remove-btn" onClick={() => quitarDelCarrito(g.keys)}>×</button>
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

      {mostrarModalUnidades && filaProducto && (
        <SeleccionUnidadesModal
          nombreProducto={filaProducto.nombre}
          cantidadNecesaria={parseInt(filaCantidad, 10) || 1}
          unidadesDisponibles={filaUnidadesDisponibles}
          onConfirm={confirmarSeleccionUnidades}
          onCancel={cancelarSeleccionUnidades}
        />
      )}

      {mostrarModalVerTodo && (
        <div className="pos-vertodo-overlay" onClick={() => setMostrarModalVerTodo(false)}>
          <div className="pos-vertodo-box" onClick={(e) => e.stopPropagation()}>
            <div className="pos-vertodo-header">
              <span>Productos de la factura</span>
              <button type="button" className="pos-vertodo-cerrar" onClick={() => setMostrarModalVerTodo(false)}>×</button>
            </div>
            <div className="pos-vertodo-body">
              {gruposCarrito.length === 0 ? (
                <p className="pos-vertodo-vacio">Aun no has agregado productos a esta {esNotaVenta ? 'nota de venta' : 'factura'}.</p>
              ) : (
                <table className="pos-vertodo-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Und</th>
                      <th style={{ textAlign: 'right' }}>Precio</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruposCarrito.map((g) => (
                      <tr key={g.groupKey}>
                        <td>{g.producto_codigo}</td>
                        <td>
                          <div>{g.descripcion}</div>
                          {g.codigosIndividuales.length > 0 && (
                            <div className="pos-vertodo-codigos">
                              {g.codigosIndividuales.map((cod) => (
                                <div key={cod}>{cod}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>{g.cantidad}</td>
                        <td>UND</td>
                        <td className="text-right">{fmt(g.precio_unitario)}</td>
                        <td className="text-right">{fmt(g.precio_unitario * g.cantidad)}</td>
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
