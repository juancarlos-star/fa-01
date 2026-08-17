import React, { useState, useEffect } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';

const TIPOS = [
  { key: 'equipo', label: 'Equipo (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorio' }
];

export default function Facturacion({ currentUser }) {
  const [settings, setSettings] = useState(null);

  // Cliente (el filtrado y registro se hacen por cedula/RIF)
  const [cedula, setCedula] = useState('');
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [clienteNuevo, setClienteNuevo] = useState({ nombre: '', telefono: '', direccion: '', email: '' });
  const [mostrarRegistroNuevo, setMostrarRegistroNuevo] = useState(false);
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

  useEffect(() => {
    window.api.listProducts(tipoSeleccionado).then((data) => {
      setProductos(data);
      setProductoId('');
      setUnidadesDisponibles([]);
      setCodigoInput('');
      setCodigosPendientes([]);
      setPrecioUnitario('');
      setCantidad(1);
    });
  }, [tipoSeleccionado]);

  useEffect(() => {
    setCodigoInput('');
    setCodigosPendientes([]);
    if (!productoId) return;
    const p = productos.find((x) => x.id === Number(productoId));
    if (p) setPrecioUnitario(p.precio);
    if (tipoSeleccionado !== 'accesorio' && productoId) {
      window.api.listUnits(Number(productoId)).then((data) => {
        setUnidadesDisponibles(data.filter((u) => u.estado === 'disponible'));
      });
    }
  }, [productoId, productos, tipoSeleccionado]);

  const buscarPorCedula = async (texto) => {
    setCedula(texto);
    setClienteSeleccionado(null);
    setEditandoCliente(false);
    setMostrarRegistroNuevo(false);
    setClienteNuevo({ nombre: '', telefono: '', direccion: '', email: '' });
    if (texto.trim().length < 2) {
      setResultadosCliente([]);
      return;
    }
    const data = await window.api.searchClientes(texto);
    setResultadosCliente(data);
  };

  const abrirRegistroNuevo = () => {
    setMostrarRegistroNuevo(true);
  };

  const seleccionarCliente = (c) => {
    setClienteSeleccionado(c);
    setCedula(c.rif_cedula || '');
    setResultadosCliente([]);
    setEditandoCliente(false);
    setMostrarRegistroNuevo(false);
  };

  const quitarCliente = () => {
    setClienteSeleccionado(null);
    setEditandoCliente(false);
    setMostrarRegistroNuevo(false);
    setCedula('');
    setResultadosCliente([]);
    setClienteNuevo({ nombre: '', telefono: '', direccion: '', email: '' });
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
    if (codigosPendientes.some((u) => u.codigo.toLowerCase() === texto.toLowerCase())) {
      setError('Ese codigo ya fue agregado a la lista');
      setCodigoInput('');
      return;
    }
    const unidad = unidadesDisponibles.find((u) => u.codigo.toLowerCase() === texto.toLowerCase());
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

    let cliente = null;
    if (clienteSeleccionado) {
      cliente = { id: clienteSeleccionado.id };
    } else if (cedula.trim() && clienteNuevo.nombre.trim()) {
      cliente = { ...clienteNuevo, rif_cedula: cedula.trim() };
    } else {
      setError('Escribe la cedula del cliente y su nombre para continuar');
      return;
    }

    try {
      const res = await window.api.crearFactura({
        cliente,
        items: carrito,
        usuario: currentUser?.username
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

  return (
    <div>
      <h1>Facturacion</h1>

      <div className="form-box" style={{ maxWidth: '520px' }}>
        <h3>Cliente</h3>

        <label>Cedula</label>
        <input
          placeholder="Escribe la cedula del cliente"
          value={cedula}
          onChange={(e) => buscarPorCedula(e.target.value)}
          disabled={!!clienteSeleccionado}
        />

        {clienteSeleccionado && !editandoCliente && (
          <p style={{ fontSize: '0.9rem', color: '#027a48', marginTop: '6px' }}>
            ✓ {clienteSeleccionado.nombre} {clienteSeleccionado.rif_cedula ? `(${clienteSeleccionado.rif_cedula})` : ''}{' '}
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

        {!clienteSeleccionado && resultadosCliente.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}>
            {resultadosCliente.map((c) => (
              <li key={c.id} onClick={() => seleccionarCliente(c)}
                style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                {c.nombre} {c.rif_cedula ? `(${c.rif_cedula})` : ''}
              </li>
            ))}
          </ul>
        )}

        {!clienteSeleccionado && cedula.trim().length >= 2 && resultadosCliente.length === 0 && !mostrarRegistroNuevo && (
          <p style={{ fontSize: '0.85rem', color: '#b42318', marginTop: '6px' }}>
            No se encontro ningun cliente con esa cedula.{' '}
            <button type="button" onClick={abrirRegistroNuevo}>Registrar cliente</button>
          </p>
        )}

        {!clienteSeleccionado && mostrarRegistroNuevo && (
          <div style={{ marginTop: '6px' }}>
            <p style={{ fontSize: '0.85rem', color: '#666' }}>Registrando cliente nuevo:</p>
            <label>Nombre y apellido</label>
            <input placeholder="Nombre y apellido / Razon social" value={clienteNuevo.nombre}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, nombre: e.target.value })} />
            <label>Telefono</label>
            <input placeholder="Telefono" value={clienteNuevo.telefono}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, telefono: e.target.value })} />
            <label>Direccion</label>
            <input placeholder="Direccion" value={clienteNuevo.direccion}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, direccion: e.target.value })} />
            <label>Email (opcional)</label>
            <input placeholder="Email" value={clienteNuevo.email}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, email: e.target.value })} />
          </div>
        )}
      </div>

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

        <label>Precio unitario (USD)</label>
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
