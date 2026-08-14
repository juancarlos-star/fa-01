import React, { useState, useEffect, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

function estimarCantidadRango(codigoInicio, codigoFin) {
  try {
    const a = codigoInicio.trim();
    const b = codigoFin.trim();
    if (a.length !== b.length) return null;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const restoA = a.slice(i);
    const restoB = b.slice(i);
    if (!/^\d+$/.test(restoA) || !/^\d+$/.test(restoB)) return null;
    const numA = parseInt(restoA, 10);
    const numB = parseInt(restoB, 10);
    if (numA > numB) return null;
    return numB - numA + 1;
  } catch {
    return null;
  }
}

export default function Compras({ currentUser }) {
  const [proveedor, setProveedor] = useState('');
  const [numeroFacturaCompra, setNumeroFacturaCompra] = useState('');

  const [tipoSeleccionado, setTipoSeleccionado] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [modoRango, setModoRango] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [costoUnitario, setCostoUnitario] = useState('');

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);

  const [historial, setHistorial] = useState([]);
  const [detalleVer, setDetalleVer] = useState(null);

  useEffect(() => {
    window.api.listProducts(tipoSeleccionado).then((data) => {
      setProductos(data);
      setProductoId('');
      setCodigo('');
      setCodigoInicio('');
      setCodigoFin('');
      setCantidad(1);
      setCostoUnitario('');
      setModoRango(false);
    });
  }, [tipoSeleccionado]);

  const cargarHistorial = useCallback(async () => {
    const data = await window.api.listComprasEncabezados();
    setHistorial(data);
  }, []);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const agregarAlCarrito = () => {
    setError('');
    if (!productoId) { setError('Selecciona un producto'); return; }
    const producto = productos.find((p) => p.id === Number(productoId));
    const costo = parseFloat(costoUnitario);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo unitario'); return; }

    if (tipoSeleccionado === 'accesorio') {
      const c = parseInt(cantidad, 10);
      if (!c || c <= 0) { setError('Cantidad invalida'); return; }
      setCarrito([...carrito, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        cantidad: c, costoUnitario: costo, subtotalEstimado: costo * c
      }]);
    } else if (modoRango) {
      if (!codigoInicio.trim() || !codigoFin.trim()) { setError('Escribe el primer y el ultimo codigo del rango'); return; }
      const est = estimarCantidadRango(codigoInicio, codigoFin);
      setCarrito([...carrito, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        rango: true, codigoInicio: codigoInicio.trim(), codigoFin: codigoFin.trim(),
        costoUnitario: costo, cantidadEstimada: est, subtotalEstimado: est ? costo * est : null
      }]);
    } else {
      if (!codigo.trim()) { setError('Escribe o escanea el codigo'); return; }
      setCarrito([...carrito, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        codigo: codigo.trim(), costoUnitario: costo, subtotalEstimado: costo
      }]);
    }
    setCodigo(''); setCodigoInicio(''); setCodigoFin(''); setCantidad(1); setCostoUnitario('');
  };

  const quitarDelCarrito = (key) => setCarrito(carrito.filter((i) => i.key !== key));

  const totalEstimado = carrito.reduce((acc, i) => acc + (i.subtotalEstimado || 0), 0);

  const handleRegistrarCompra = async () => {
    setError('');
    if (!proveedor.trim()) { setError('Indica el nombre del proveedor'); return; }
    if (!numeroFacturaCompra.trim()) { setError('Indica el numero de factura de compra'); return; }
    if (carrito.length === 0) { setError('Agrega al menos un producto'); return; }

    const items = carrito.map((i) => ({
      product_id: i.product_id,
      costoUnitario: i.costoUnitario,
      cantidad: i.cantidad,
      codigo: i.codigo,
      rango: i.rango || false,
      codigoInicio: i.codigoInicio,
      codigoFin: i.codigoFin
    }));

    try {
      const res = await window.api.crearCompraLote({
        proveedor: proveedor.trim(),
        numeroFacturaCompra: numeroFacturaCompra.trim(),
        items,
        usuario: currentUser?.username
      });
      if (!res.ok) { setError(res.message); return; }
      setConfirmacion(res);
      setCarrito([]);
      setProveedor('');
      setNumeroFacturaCompra('');
      cargarHistorial();
    } catch (err) {
      setError('Error inesperado: ' + (err?.message || String(err)));
    }
  };

  const verDetalle = async (id) => {
    const res = await window.api.detalleCompraEncabezado(id);
    if (res.ok) setDetalleVer(res);
  };

  if (confirmacion) {
    return (
      <div>
        <h1>Compra registrada</h1>
        <div className="form-box" style={{ maxWidth: '400px' }}>
          <p><strong>Total de la compra:</strong> ${confirmacion.totalUsd.toFixed(2)}</p>
          <button onClick={() => setConfirmacion(null)}>Registrar otra compra</button>
        </div>
      </div>
    );
  }

  if (detalleVer) {
    const { encabezado, items } = detalleVer;
    return (
      <div>
        <button onClick={() => setDetalleVer(null)}>&larr; Volver</button>
        <h1>Compra #{encabezado.id}</h1>
        <p><strong>Proveedor:</strong> {encabezado.proveedor}</p>
        <p><strong>N° factura de compra:</strong> {encabezado.numero_factura_compra}</p>
        <p><strong>Fecha:</strong> {encabezado.created_at}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', margin: '1rem 0' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Producto</th>
              <th>Cantidad</th>
              <th>Costo unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{i.descripcion}</td>
                <td>{i.cantidad}</td>
                <td>${i.costo_unitario_usd.toFixed(2)}</td>
                <td>${i.total_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><strong>Total: ${encabezado.total_usd.toFixed(2)}</strong></p>
      </div>
    );
  }

  return (
    <div>
      <h1>Compras</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '600px' }}>
        Registra aqui todos los productos de una misma factura de proveedor (telefonos, simcards, usim y accesorios
        que llegaron juntos). Para agregar una sola unidad suelta sin factura de proveedor, usa los botones dentro
        de Inventario.
      </p>

      <div className="form-box" style={{ maxWidth: '500px' }}>
        <h3>Datos del proveedor</h3>
        <label>Proveedor</label>
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej: Distribuidora XYZ" />
        <label>N° de factura de compra</label>
        <input value={numeroFacturaCompra} onChange={(e) => setNumeroFacturaCompra(e.target.value)} placeholder="Ej: 00458" />
      </div>

      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar producto a la compra</h3>
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
          {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        {tipoSeleccionado === 'accesorio' && (
          <>
            <label>Cantidad</label>
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </>
        )}

        {(tipoSeleccionado === 'simcard' || tipoSeleccionado === 'usim') && (
          <p style={{ fontSize: '0.8rem' }}>
            <label>
              <input type="checkbox" checked={modoRango} onChange={(e) => setModoRango(e.target.checked)} /> Ingresar como rango (caja completa)
            </label>
          </p>
        )}

        {tipoSeleccionado !== 'accesorio' && !modoRango && (
          <>
            <label>Codigo (IMEI/SIM/USIM)</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Manual o pistola" />
          </>
        )}

        {tipoSeleccionado !== 'accesorio' && modoRango && (
          <>
            <label>Primer codigo</label>
            <input value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} />
            <label>Ultimo codigo</label>
            <input value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} />
          </>
        )}

        <label>Costo unitario (USD)</label>
        <input type="number" step="0.01" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />

        <button type="button" onClick={agregarAlCarrito}>+ Agregar a la compra</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h3>Items de esta compra</h3>
      {carrito.length === 0 ? (
        <p>Aun no has agregado productos.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Producto</th>
              <th>Detalle</th>
              <th>Costo unit.</th>
              <th>Subtotal est.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carrito.map((item) => (
              <tr key={item.key} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{item.descripcion}</td>
                <td>
                  {item.rango
                    ? `Rango ${item.codigoInicio} - ${item.codigoFin}${item.cantidadEstimada ? ` (~${item.cantidadEstimada})` : ''}`
                    : item.codigo || `Cantidad: ${item.cantidad}`}
                </td>
                <td>${item.costoUnitario.toFixed(2)}</td>
                <td>{item.subtotalEstimado != null ? `$${item.subtotalEstimado.toFixed(2)}` : '—'}</td>
                <td><button onClick={() => quitarDelCarrito(item.key)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="form-box" style={{ maxWidth: '340px' }}>
        <p>Total estimado: <strong>${totalEstimado.toFixed(2)}</strong></p>
        <button onClick={handleRegistrarCompra} style={{ marginTop: '8px' }}>Registrar compra</button>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Historial de compras</h3>
      {historial.length === 0 ? (
        <p>Aun no se ha registrado ninguna compra.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Fecha</th>
              <th>Proveedor</th>
              <th>N° factura</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {historial.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{c.created_at}</td>
                <td>{c.proveedor}</td>
                <td>{c.numero_factura_compra}</td>
                <td>${c.total_usd.toFixed(2)}</td>
                <td><button onClick={() => verDetalle(c.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
