import React, { useState, useEffect, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipo (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorio' }
];

export default function Facturacion({ currentUser }) {
  const [settings, setSettings] = useState(null);

  // Cliente
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultadosCliente, setResultadosCliente] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [clienteNuevo, setClienteNuevo] = useState({ nombre: '', rif_cedula: '', telefono: '' });

  // Agregar item
  const [tipoSeleccionado, setTipoSeleccionado] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precioUnitario, setPrecioUnitario] = useState('');

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    window.api.listProducts(tipoSeleccionado).then((data) => {
      setProductos(data);
      setProductoId('');
      setUnidadesDisponibles([]);
      setUnitId('');
      setPrecioUnitario('');
    });
  }, [tipoSeleccionado]);

  useEffect(() => {
    if (!productoId) return;
    const p = productos.find((x) => x.id === Number(productoId));
    if (p) setPrecioUnitario(p.precio);
    if (tipoSeleccionado !== 'accesorio' && productoId) {
      window.api.listUnits(Number(productoId)).then((data) => {
        setUnidadesDisponibles(data.filter((u) => u.estado === 'disponible'));
      });
    }
  }, [productoId, productos, tipoSeleccionado]);

  const buscarCliente = async (texto) => {
    setBusquedaCliente(texto);
    if (texto.trim().length < 2) {
      setResultadosCliente([]);
      return;
    }
    const data = await window.api.searchClientes(texto);
    setResultadosCliente(data);
  };

  const seleccionarCliente = (c) => {
    setClienteSeleccionado(c);
    setBusquedaCliente(c.nombre);
    setResultadosCliente([]);
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
      if (!c || c <= 0) {
        setError('Cantidad invalida');
        return;
      }
      if (c > producto.stock_disponible) {
        setError('No hay suficiente stock disponible');
        return;
      }
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
      if (!unitId) {
        setError('Selecciona el codigo (IMEI/SIM/USIM) especifico');
        return;
      }
      const unidad = unidadesDisponibles.find((u) => u.id === Number(unitId));
      setCarrito([
        ...carrito,
        {
          key: `${producto.id}-${unitId}`,
          product_id: producto.id,
          unit_id: Number(unitId),
          tipo: producto.tipo,
          descripcion: producto.nombre,
          codigo: unidad?.codigo,
          cantidad: 1,
          precio_unitario: parseFloat(precioUnitario) || 0
        }
      ]);
      // Quita la unidad ya agregada de la lista para no repetirla
      setUnidadesDisponibles(unidadesDisponibles.filter((u) => u.id !== Number(unitId)));
      setUnitId('');
    }
  };

  const quitarDelCarrito = (key) => {
    setCarrito(carrito.filter((item) => item.key !== key));
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
    } else if (clienteNuevo.nombre.trim()) {
      cliente = clienteNuevo;
    }

    const res = await window.api.crearFactura({
      cliente,
      items: carrito,
      usuario: currentUser?.username
    });

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setConfirmacion(res);
    setCarrito([]);
    setClienteSeleccionado(null);
    setClienteNuevo({ nombre: '', rif_cedula: '', telefono: '' });
    setBusquedaCliente('');
  };

  if (confirmacion) {
    return (
      <div>
        <h1>Factura emitida</h1>
        <div className="form-box" style={{ maxWidth: '400px' }}>
          <p><strong>N° de factura:</strong> {confirmacion.numero}</p>
          <p><strong>Total:</strong> ${confirmacion.totalUsd.toFixed(2)} USD (Bs {confirmacion.totalBs.toFixed(2)})</p>
          <button onClick={() => setConfirmacion(null)}>Hacer otra factura</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Facturacion</h1>

      <div className="form-box" style={{ maxWidth: '500px' }}>
        <h3>Cliente</h3>
        <input
          placeholder="Buscar cliente por nombre o RIF/cedula (opcional)"
          value={busquedaCliente}
          onChange={(e) => buscarCliente(e.target.value)}
        />
        {resultadosCliente.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px' }}>
            {resultadosCliente.map((c) => (
              <li
                key={c.id}
                onClick={() => seleccionarCliente(c)}
                style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
              >
                {c.nombre} {c.rif_cedula ? `(${c.rif_cedula})` : ''}
              </li>
            ))}
          </ul>
        )}
        {clienteSeleccionado ? (
          <p style={{ fontSize: '0.85rem', color: '#027a48' }}>
            Cliente seleccionado: {clienteSeleccionado.nombre}{' '}
            <button type="button" onClick={() => { setClienteSeleccionado(null); setBusquedaCliente(''); }}>
              Quitar
            </button>
          </p>
        ) : (
          <div style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '0.8rem', color: '#666' }}>
              Si no encontraste al cliente, escribe sus datos (se creara automaticamente). Si lo dejas vacio, se factura a "Consumidor final".
            </p>
            <input
              placeholder="Nombre del cliente nuevo"
              value={clienteNuevo.nombre}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, nombre: e.target.value })}
            />
            <input
              placeholder="RIF o cedula"
              value={clienteNuevo.rif_cedula}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, rif_cedula: e.target.value })}
            />
            <input
              placeholder="Telefono"
              value={clienteNuevo.telefono}
              onChange={(e) => setClienteNuevo({ ...clienteNuevo, telefono: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar producto</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {TIPOS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipoSeleccionado(t.key)}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: tipoSeleccionado === t.key ? '#0b4f9e' : '#e2e8f0',
                color: tipoSeleccionado === t.key ? '#fff' : '#111',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label>Producto</label>
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">-- Selecciona --</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} (disponible: {p.stock_disponible})
            </option>
          ))}
        </select>

        {tipoSeleccionado !== 'accesorio' && productoId && (
          <>
            <label>Codigo especifico</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">-- Selecciona codigo --</option>
              {unidadesDisponibles.map((u) => (
                <option key={u.id} value={u.id}>{u.codigo}</option>
              ))}
            </select>
          </>
        )}

        {tipoSeleccionado === 'accesorio' && (
          <>
            <label>Cantidad</label>
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </>
        )}

        <label>Precio unitario (USD)</label>
        <input type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} />

        <button type="button" onClick={agregarAlCarrito}>+ Agregar a la factura</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h3>Detalle de la factura</h3>
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
                <td>${item.precio_unitario.toFixed(2)}</td>
                <td>${(item.precio_unitario * item.cantidad).toFixed(2)}</td>
                <td><button onClick={() => quitarDelCarrito(item.key)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="form-box" style={{ maxWidth: '340px' }}>
        <p>Subtotal: <strong>${subtotal.toFixed(2)}</strong></p>
        <p>IVA ({ivaPorcentaje}%): <strong>${iva.toFixed(2)}</strong></p>
        <p>Total: <strong>${total.toFixed(2)}</strong></p>
        <p style={{ color: '#666' }}>Tasa: {tasaCambio} Bs/USD</p>
        <p>Total en Bs: <strong>Bs {totalBs.toFixed(2)}</strong></p>
        <button onClick={handleEmitirFactura} style={{ marginTop: '8px' }}>Emitir factura</button>
      </div>
    </div>
  );
}
