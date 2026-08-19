import React, { useState, useEffect, useRef } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';
import ClienteNuevoModal from '../components/ClienteNuevoModal.jsx';

const TIPOS = [
  { key: 'equipo', label: 'Equipo (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorio' }
];

export default function Facturacion({ currentUser }) {
  const [settings, setSettings] = useState(null);

  // Deposito: toda la factura se hace contra UN solo deposito (de ahi sale el stock y las
  // unidades disponibles que se muestran). Se elige aqui arriba, antes de agregar productos.
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // Precio 1 / Precio 2: identifica si el cliente paga en Bs o en Dolares (o el criterio que
  // el usuario le quiera dar a cada precio). Al elegir un producto, el precio unitario se toma
  // de "precio" (Precio 1) o "precio2" (Precio 2) segun lo que este seleccionado aqui.
  const [tipoPrecio, setTipoPrecio] = useState('precio'); // 'precio' | 'precio2'

  // Cliente: se busca EXACTO por cedula/RIF al presionar Enter. Si existe, se trae de una vez;
  // si no existe, se abre la ventana modal para registrarlo (ClienteNuevoModal).
  const [cedula, setCedula] = useState('');
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarModalClienteNuevo, setMostrarModalClienteNuevo] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteEdicion, setClienteEdicion] = useState({ nombre: '', rif_cedula: '', telefono: '', direccion: '', email: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Agregar item
  const [tipoSeleccionado, setTipoSeleccionado] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [codigoInput, setCodigoInput] = useState('');
  const [codigosPendientes, setCodigosPendientes] = useState([]);
  const [cantidad, setCantidad] = useState(1);
  const [precioUnitario, setPrecioUnitario] = useState('');

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  // Carga los depositos activos al entrar a Facturacion y deja el primero seleccionado por
  // defecto (normalmente "Principal"), para que el usuario pueda empezar a facturar de una
  // vez sin tener que elegir deposito manualmente si solo hay uno.
  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!depositoId) return;
    window.api.listProducts(tipoSeleccionado, undefined, Number(depositoId)).then((data) => {
      setProductos(data);
      setProductoId('');
      setUnidadesDisponibles([]);
      setCodigoInput('');
      setCodigosPendientes([]);
      setPrecioUnitario('');
      setCantidad(1);
    });
  }, [tipoSeleccionado, depositoId]);

  // Referencia siempre actualizada al carrito, para poder filtrar codigos ya usados sin tener
  // que agregar "carrito" a las dependencias del efecto de abajo (eso lo haria recargar y
  // limpiar los codigos pendientes cada vez que se quita o agrega algo al carrito).
  const carritoRef = useRef(carrito);
  useEffect(() => {
    carritoRef.current = carrito;
  }, [carrito]);

  useEffect(() => {
    setCodigoInput('');
    setCodigosPendientes([]);
    if (!productoId) return;
    const p = productos.find((x) => x.id === Number(productoId));
    if (p) setPrecioUnitario(tipoPrecio === 'precio2' ? p.precio2 : p.precio);
    if (tipoSeleccionado !== 'accesorio' && productoId && depositoId) {
      window.api.listUnits(Number(productoId), Number(depositoId)).then((data) => {
        // Un codigo/IMEI que ya esta agregado a la factura actual (carrito) no debe volver a
        // aparecer como "disponible", aunque en la base de datos siga marcado 'disponible'
        // (todavia no se marca 'vendido' hasta que se emite la factura). Sin este filtro, al
        // cambiar de producto y volver a seleccionar el mismo, el codigo ya agregado
        // reaparecia y se podia agregar dos veces a la misma factura.
        const codigosEnCarrito = new Set(
          carritoRef.current.filter((i) => i.codigo).map((i) => i.codigo.toLowerCase())
        );
        setUnidadesDisponibles(
          data.filter((u) => u.estado === 'disponible' && !codigosEnCarrito.has(u.codigo.toLowerCase()))
        );
      });
    }
  }, [productoId, productos, tipoSeleccionado, tipoPrecio, depositoId]);

  // Al escribir la cedula/RIF y presionar Enter, se busca EXACTO. Si el cliente ya existe, se
  // trae de una vez (queda seleccionado). Si no existe, se abre la ventana modal para
  // registrarlo, con la cedula ya escrita.
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

  const agregarCodigoUnidad = () => {
    setError('');
    const texto = codigoInput.trim();
    if (!texto) return;
    const textoLower = texto.toLowerCase();

    // Verificacion en tiempo real, antes de agregar: el codigo/IMEI no puede repetirse ni con
    // los que ya estan en la lista de items de la factura (carrito) ni con los que estan por
    // agregar (codigosPendientes de este mismo producto).
    if (codigosPendientes.some((u) => u.codigo.toLowerCase() === textoLower)) {
      setError('Ese codigo ya fue agregado a la lista de items por agregar');
      setCodigoInput('');
      return;
    }
    if (carrito.some((it) => it.codigo && it.codigo.toLowerCase() === textoLower)) {
      setError('Ese codigo ya esta agregado en la factura');
      setCodigoInput('');
      return;
    }
    const unidad = unidadesDisponibles.find((u) => u.codigo.toLowerCase() === textoLower);
    if (!unidad) {
      setError('Codigo no encontrado entre las unidades disponibles de este producto');
      return;
    }
    setCodigosPendientes([...codigosPendientes, unidad]);
    setCodigoInput('');
  };

  const quitarCodigoPendiente = (id) => {
    setCodigosPendientes(codigosPendientes.filter((u) => u.id !== id));
  };

  const agregarAlCarrito = () => {
    setError('');
    if (!depositoId) {
      setError('Selecciona el deposito antes de agregar productos');
      return;
    }
    if (!productoId) {
      setError('Selecciona un producto');
      return;
    }
    const producto = productos.find((p) => p.id === Number(productoId));

    if (tipoSeleccionado === 'accesorio') {
      const c = parseInt(cantidad, 10);
      if (!c || c <= 0) { setError('Cantidad invalida'); return; }
      if (c > producto.stock_disponible) { setError('No hay suficiente stock disponible'); return; }
      setCarrito([
        ...carrito,
        {
          key: `${producto.id}-${Date.now()}`,
          product_id: producto.id,
          tipo: producto.tipo,
          descripcion: producto.nombre,
          codigo: null,
          cantidad: c,
          precio_unitario: parseFloat(precioUnitario) || 0
        }
      ]);
    } else {
      if (codigosPendientes.length === 0) {
        setError('Escanea o escribe al menos un codigo (IMEI/ICCID) antes de agregar');
        return;
      }
      // Ultima verificacion antes de confirmar el "+ Agregar a la factura": por si algun
      // codigo pendiente quedo repetido con uno ya presente en el carrito.
      const codigosCarritoActual = new Set(
        carrito.filter((it) => it.codigo).map((it) => it.codigo.toLowerCase())
      );
      const duplicado = codigosPendientes.find((u) => codigosCarritoActual.has(u.codigo.toLowerCase()));
      if (duplicado) {
        setError(`El codigo ${duplicado.codigo} ya esta agregado en la factura`);
        return;
      }
      const nuevosItems = codigosPendientes.map((unidad) => ({
        key: `${producto.id}-${unidad.id}`,
        product_id: producto.id,
        unit_id: unidad.id,
        tipo: producto.tipo,
        descripcion: producto.nombre,
        codigo: unidad.codigo,
        cantidad: 1,
        precio_unitario: parseFloat(precioUnitario) || 0
      }));
      setCarrito([...carrito, ...nuevosItems]);
      const idsAgregados = new Set(codigosPendientes.map((u) => u.id));
      setUnidadesDisponibles(unidadesDisponibles.filter((u) => !idsAgregados.has(u.id)));
      setCodigosPendientes([]);
      setCodigoInput('');
    }

    // Limpiar los campos de "Agregar producto" tras agregarlo a la factura
    setProductoId('');
    setPrecioUnitario('');
    setCantidad(1);
  };

  const quitarDelCarrito = (key) => {
    // Confirmacion dentro de la propia app (no window.confirm) para evitar que el
    // dialogo nativo de Electron deje los campos de "Agregar producto" sin responder.
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

  const handleEmitirFactura = async () => {
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
    } catch (err) {
      console.error('Error al emitir factura:', err);
      setError('Ocurrio un error inesperado al emitir la factura: ' + (err?.message || String(err)));
    }
  };

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
          <button onClick={handleImprimir} disabled={imprimiendoFactura} style={{ marginRight: '8px' }}>
            {imprimiendoFactura ? 'Imprimiendo...' : 'Imprimir PDF'}
          </button>
          <button onClick={() => setConfirmacion(null)}>Hacer otra factura</button>
        </div>
      </div>
    );
  }

  const cambiarDeposito = (nuevoId) => {
    // Cambiar de deposito a mitad de una factura invalida los codigos/unidades que ya estaban
    // en el carrito (pertenecen al deposito anterior), asi que se avisa y se vacia el carrito
    // para no mezclar stock de dos depositos distintos en la misma factura.
    if (carrito.length > 0 && !window.confirm('Cambiar de deposito vacia los productos que ya agregaste a esta factura (pertenecen al deposito anterior). ¿Deseas continuar?')) {
      return;
    }
    setDepositoId(nuevoId);
    setCarrito([]);
    setProductoId('');
  };

  return (
    <div>
      <h1>Facturacion</h1>

      <div className="form-box" style={{ maxWidth: '520px' }}>
        <h3>Deposito y precio</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label>Deposito</label>
            <select value={depositoId} onChange={(e) => cambiarDeposito(e.target.value)}>
              {depositos.length === 0 && <option value="">-- No hay depositos --</option>}
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.codigo} - {d.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Precio</label>
            <select value={tipoPrecio} onChange={(e) => setTipoPrecio(e.target.value)}>
              <option value="precio">Bs.</option>
              <option value="precio2">Dolares</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-box" style={{ maxWidth: '520px' }}>
        <h3>Cliente</h3>

        <label>Cedula o RIF</label>
        <input
          placeholder="Escribe la cedula/RIF y presiona Enter"
          value={cedula}
          onChange={(e) => { setCedula(e.target.value); if (clienteSeleccionado) setClienteSeleccionado(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarClientePorEnter(); } }}
          disabled={!!clienteSeleccionado || buscandoCliente}
        />
        {buscandoCliente && <p style={{ fontSize: '0.85rem', color: '#666' }}>Buscando cliente...</p>}

        {clienteSeleccionado && !editandoCliente && (
          <p style={{ fontSize: '0.9rem', color: '#027a48', marginTop: '6px' }}>
            ✓ {clienteSeleccionado.nombre} {clienteSeleccionado.rif_cedula ? `(${clienteSeleccionado.rif_cedula})` : ''}
            {clienteSeleccionado.telefono ? ` — ${clienteSeleccionado.telefono}` : ''}{' '}
            <button type="button" onClick={quitarCliente}>Cambiar</button>{' '}
            <button type="button" onClick={abrirEdicionCliente}>Editar datos</button>
          </p>
        )}

        {clienteSeleccionado && editandoCliente && (
          <div style={{ marginTop: '6px' }}>
            <p style={{ fontSize: '0.85rem', color: '#666' }}>Editando datos del cliente:</p>
            <label>Cedula</label>
            <input placeholder="Cedula o RIF (ej: V-12345678)" value={clienteEdicion.rif_cedula}
              onChange={(e) => setClienteEdicion({ ...clienteEdicion, rif_cedula: e.target.value })} />
            <label>Nombre y apellido</label>
            <input placeholder="Nombre y apellido / Razon social" value={clienteEdicion.nombre}
              onChange={(e) => setClienteEdicion({ ...clienteEdicion, nombre: e.target.value })} />
            <label>Telefono</label>
            <input placeholder="Telefono" value={clienteEdicion.telefono}
              onChange={(e) => setClienteEdicion({ ...clienteEdicion, telefono: e.target.value })} />
            <label>Direccion</label>
            <input placeholder="Direccion" value={clienteEdicion.direccion}
              onChange={(e) => setClienteEdicion({ ...clienteEdicion, direccion: e.target.value })} />
            <label>Email (opcional)</label>
            <input placeholder="Email" value={clienteEdicion.email}
              onChange={(e) => setClienteEdicion({ ...clienteEdicion, email: e.target.value })} />
            <button type="button" onClick={guardarEdicionCliente} disabled={guardandoEdicion} style={{ marginRight: '8px' }}>
              {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={() => setEditandoCliente(false)}>Cancelar</button>
          </div>
        )}
      </div>

      {mostrarModalClienteNuevo && (
        <ClienteNuevoModal
          cedulaInicial={cedula}
          onConfirm={handleClienteCreado}
          onCancel={() => setMostrarModalClienteNuevo(false)}
        />
      )}

      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar producto</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {TIPOS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTipoSeleccionado(t.key)}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: tipoSeleccionado === t.key ? '#0b4f9e' : '#e2e8f0',
                color: tipoSeleccionado === t.key ? '#fff' : '#111',
                border: 'none', borderRadius: '4px', cursor: 'pointer'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <label>Producto</label>
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">-- Selecciona --</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} (disponible: {p.stock_disponible})</option>
          ))}
        </select>

        {tipoSeleccionado !== 'accesorio' && productoId && (
          <>
            <label>Codigo (IMEI / ICCID)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Escanea con la pistola o escribe el codigo y presiona Enter"
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCodigoUnidad(); } }}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={agregarCodigoUnidad} style={{ whiteSpace: 'nowrap', height: 'fit-content' }}>
                + Agregar codigo
              </button>
            </div>

            {codigosPendientes.length > 0 && (
              <div style={{ marginTop: '0.5rem', marginBottom: '10px' }}>
                <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>
                  Cantidad detectada: <strong>{codigosPendientes.length}</strong>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {codigosPendientes.map((u) => (
                    <li key={u.id} style={{
                      background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                      {u.codigo}
                      <button
                        type="button"
                        onClick={() => quitarCodigoPendiente(u.id)}
                        style={{ background: 'none', border: 'none', color: '#b42318', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {tipoSeleccionado === 'accesorio' && (
          <>
            <label>Cantidad</label>
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </>
        )}

        <label>Precio unitario ({tipoPrecio === 'precio2' ? 'Dolares' : 'Bs.'})</label>
        <input type="number" step="0.01" value={precioUnitario} readOnly disabled />

        <button type="button" onClick={agregarAlCarrito}>+ Agregar a la factura</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h3>Detalle de la factura</h3>
      <div>
        {carrito.length === 0 ? (
          <p>Aun no has agregado productos.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '1rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.5rem' }}>Producto</th>
                <th>Codigo</th>
                <th>Cant.</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((item) => (
                <tr key={item.key} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{item.descripcion}</td>
                  <td>{item.codigo || '—'}</td>
                  <td>{item.cantidad}</td>
                  <td>${fmt(item.precio_unitario)}</td>
                  <td>${fmt((item.precio_unitario * item.cantidad))}</td>
                  <td>
                    {keyPendienteQuitar === item.key ? (
                      <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: '#b42318' }}>¿Quitar?</span>
                        <button type="button" onClick={confirmarQuitarDelCarrito} style={{ color: '#b42318' }}>Si</button>
                        <button type="button" onClick={cancelarQuitarDelCarrito}>No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => quitarDelCarrito(item.key)}>Quitar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* El cuadro de totales siempre se ubica debajo de todos los items agregados,
            alineado a la derecha, para que nunca quede montado sobre otra informacion. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div className="form-box" style={{ width: '340px', flex: '0 0 auto', margin: 0 }}>
            <p>Subtotal: <strong>${fmt(subtotal)}</strong></p>
            <p>IVA ({ivaPorcentaje}%): <strong>${fmt(iva)}</strong></p>
            <p>Total: <strong>${fmt(total)}</strong></p>
            <p style={{ color: '#666' }}>Tasa: {tasaCambio} Bs/USD</p>
            <p>Total en Bs: <strong>Bs {fmt(totalBs)}</strong></p>
            <button onClick={handleEmitirFactura} style={{ marginTop: '8px' }}>Emitir factura</button>
          </div>
        </div>
      </div>
    </div>
  );
}
