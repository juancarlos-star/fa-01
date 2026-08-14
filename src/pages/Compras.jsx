import React, { useState, useEffect, useRef, useCallback } from 'react';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

export default function Compras({ currentUser }) {
  const [proveedor, setProveedor] = useState('');
  const [numeroFacturaCompra, setNumeroFacturaCompra] = useState('');

  const [tipoSeleccionado, setTipoSeleccionado] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [cantidadDeseada, setCantidadDeseada] = useState('');

  const [modoEscaneo, setModoEscaneo] = useState('manual'); // 'manual' | 'rango'

  const [codigosEscaneados, setCodigosEscaneados] = useState([]);
  const [valorEscaneo, setValorEscaneo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [errorEscaneo, setErrorEscaneo] = useState('');
  const scanInputRef = useRef(null);

  const [codigoInicioRango, setCodigoInicioRango] = useState('');
  const [codigoFinRango, setCodigoFinRango] = useState('');
  const [generandoRango, setGenerandoRango] = useState(false);

  const [carrito, setCarrito] = useState([]);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);



  const esAccesorio = tipoSeleccionado === 'accesorio';
  const cantidadNum = parseInt(cantidadDeseada, 10) || 0;
  const listoParaEscanear = !esAccesorio && productoId && costoUnitario !== '' && cantidadNum > 0;
  const escaneoCompleto = listoParaEscanear && codigosEscaneados.length === cantidadNum;

  const permiteRango = tipoSeleccionado === 'simcard' || tipoSeleccionado === 'usim';

  const resetearFormularioProducto = () => {
    setProductoId('');
    setCostoUnitario('');
    setCantidadDeseada('');
    setCodigosEscaneados([]);
    setValorEscaneo('');
    setErrorEscaneo('');
    setCodigoInicioRango('');
    setCodigoFinRango('');
    setModoEscaneo('manual');
  };

  useEffect(() => {
    window.api.listProducts(tipoSeleccionado).then((data) => {
      setProductos(data);
      resetearFormularioProducto();
    });
  }, [tipoSeleccionado]);

  useEffect(() => {
    if (listoParaEscanear && modoEscaneo === 'manual' && !escaneoCompleto && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [listoParaEscanear, escaneoCompleto, codigosEscaneados.length, modoEscaneo]);

  const handleScanKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = valorEscaneo.trim();
    setValorEscaneo('');
    if (!codigo) return;
    setErrorEscaneo('');

    if (codigosEscaneados.length >= cantidadNum) {
      setErrorEscaneo(`Ya escaneaste los ${cantidadNum} codigos declarados. Quita alguno si necesitas corregir.`);
      return;
    }
    if (codigosEscaneados.includes(codigo)) {
      setErrorEscaneo(`El codigo "${codigo}" ya fue escaneado en esta misma compra`);
      return;
    }

    setVerificando(true);
    try {
      const res = await window.api.codigoExiste({ codigo });
      if (res.existe) {
        setErrorEscaneo(`El codigo "${codigo}" ya esta registrado en el inventario`);
      } else {
        setCodigosEscaneados((prev) => [...prev, codigo]);
      }
    } catch (err) {
      setErrorEscaneo('Error verificando el codigo: ' + (err?.message || String(err)));
    } finally {
      setVerificando(false);
      if (scanInputRef.current) scanInputRef.current.focus();
    }
  };

  const quitarCodigoEscaneado = (index) => {
    setCodigosEscaneados((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerarRango = async () => {
    setErrorEscaneo('');
    if (!codigoInicioRango.trim() || !codigoFinRango.trim()) {
      setErrorEscaneo('Escanea o escribe el primer y el ultimo codigo de la caja');
      return;
    }
    if (cantidadNum <= 0) {
      setErrorEscaneo('Indica primero la cantidad declarada en la factura del proveedor');
      return;
    }
    setGenerandoRango(true);
    try {
      const res = await window.api.calcularRangoCompra(codigoInicioRango.trim(), codigoFinRango.trim());
      if (!res.ok) {
        setErrorEscaneo(res.message);
        return;
      }
      if (res.yaExisten.length > 0) {
        setErrorEscaneo(
          `${res.yaExisten.length} codigo(s) del rango ya estan registrados en el inventario (ej: ${res.yaExisten[0]}). Corrige el rango o usa escaneo manual para los que faltan.`
        );
        return;
      }
      if (res.total !== cantidadNum) {
        setErrorEscaneo(`El rango genero ${res.total} codigo(s) pero declaraste ${cantidadNum}. Verifica los codigos de la caja.`);
        return;
      }
      setCodigosEscaneados(res.disponibles);
    } catch (err) {
      setErrorEscaneo('Error calculando el rango: ' + (err?.message || String(err)));
    } finally {
      setGenerandoRango(false);
    }
  };

  const agregarProductoAlCarrito = () => {
    setError('');
    const producto = productos.find((p) => p.id === Number(productoId));
    if (!producto) { setError('Selecciona un producto'); return; }
    const costo = parseFloat(costoUnitario);
    if (isNaN(costo) || costo < 0) { setError('Indica el costo unitario'); return; }

    if (esAccesorio) {
      const cantidad = parseInt(cantidadDeseada, 10);
      if (!cantidad || cantidad <= 0) { setError('Cantidad invalida'); return; }
      setCarrito((prev) => [...prev, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        costoUnitario: costo, cantidad, subtotal: costo * cantidad
      }]);
    } else {
      if (!escaneoCompleto) { setError(`Faltan codigos por escanear (${codigosEscaneados.length} de ${cantidadNum})`); return; }
      setCarrito((prev) => [...prev, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        costoUnitario: costo, codigos: [...codigosEscaneados], cantidadDeclarada: cantidadNum,
        subtotal: costo * codigosEscaneados.length
      }]);
    }
    resetearFormularioProducto();
  };

  const quitarDelCarrito = (key) => setCarrito((prev) => prev.filter((i) => i.key !== key));

  const totalEstimado = carrito.reduce((acc, i) => acc + i.subtotal, 0);

  const handleRegistrarCompra = async () => {
    setError('');
    if (!proveedor.trim()) { setError('Indica el nombre del proveedor'); return; }
    if (!numeroFacturaCompra.trim()) { setError('Indica el numero de factura de compra'); return; }
    if (carrito.length === 0) { setError('Agrega al menos un producto'); return; }

    const items = carrito.map((i) => ({
      product_id: i.product_id,
      costoUnitario: i.costoUnitario,
      cantidad: i.cantidad,
      codigos: i.codigos,
      cantidadDeclarada: i.cantidadDeclarada
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
    } catch (err) {
      setError('Error inesperado: ' + (err?.message || String(err)));
    }
  };

  if (confirmacion) {
    return (
      <div>
        <h1>Compra registrada</h1>
        <div className="form-box" style={{ maxWidth: '400px' }}>
          <p><strong>Total de la compra:</strong> ${confirmacion.totalUsd.toFixed(2)}</p>
          <p style={{ color: '#666', fontSize: '0.85rem' }}>
            Consulta el historial completo de compras en Reportes.
          </p>
          <button onClick={() => setConfirmacion(null)}>Registrar otra compra</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Compras</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '600px' }}>
        Registra aqui todos los productos de una misma factura de proveedor. Para agregar una sola unidad
        suelta sin factura de proveedor, usa los botones dentro de Inventario.
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
        <select value={productoId} onChange={(e) => { setProductoId(e.target.value); setCodigosEscaneados([]); }}>
          <option value="">-- Selecciona --</option>
          {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        <label>Costo unitario sin IVA (USD)</label>
        <input type="number" step="0.01" value={costoUnitario}
          onChange={(e) => { setCostoUnitario(e.target.value); setCodigosEscaneados([]); }} />

        <label>Cantidad {esAccesorio ? '' : 'que llego segun la factura'}</label>
        <input type="number" min="1" value={cantidadDeseada}
          onChange={(e) => { setCantidadDeseada(e.target.value); setCodigosEscaneados([]); }} />

        {listoParaEscanear && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f4f7fb', borderRadius: '6px' }}>
            {permiteRango && codigosEscaneados.length === 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setModoEscaneo('manual')}
                  style={{
                    padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                    backgroundColor: modoEscaneo === 'manual' ? '#0b4f9e' : '#e2e8f0', color: modoEscaneo === 'manual' ? '#fff' : '#111'
                  }}
                >
                  Manual (pistola, uno por uno)
                </button>
                <button
                  type="button"
                  onClick={() => setModoEscaneo('rango')}
                  style={{
                    padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                    backgroundColor: modoEscaneo === 'rango' ? '#0b4f9e' : '#e2e8f0', color: modoEscaneo === 'rango' ? '#fff' : '#111'
                  }}
                >
                  Por rango (primer y ultimo codigo de la caja)
                </button>
              </div>
            )}

            <p style={{ margin: '0 0 0.4rem 0', fontWeight: 'bold' }}>
              Escaneados: {codigosEscaneados.length} de {cantidadNum}
            </p>

            {modoEscaneo === 'manual' && !escaneoCompleto && (
              <input
                ref={scanInputRef}
                value={valorEscaneo}
                onChange={(e) => setValorEscaneo(e.target.value)}
                onKeyDown={handleScanKeyDown}
                placeholder={verificando ? 'Verificando...' : 'Dispara la pistola aqui o escribe y presiona Enter'}
                disabled={verificando}
                autoFocus
              />
            )}

            {modoEscaneo === 'rango' && codigosEscaneados.length === 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: '0.75rem' }}>Primer codigo de la caja</label><br />
                  <input placeholder="Ej: 190000" value={codigoInicioRango} onChange={(e) => setCodigoInicioRango(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem' }}>Ultimo codigo de la caja</label><br />
                  <input placeholder="Ej: 190050" value={codigoFinRango} onChange={(e) => setCodigoFinRango(e.target.value)} />
                </div>
                <button type="button" onClick={handleGenerarRango} disabled={generandoRango}>
                  {generandoRango ? 'Generando...' : 'Generar rango completo'}
                </button>
              </div>
            )}

            {errorEscaneo && <p style={{ color: 'red', fontSize: '0.85rem' }}>{errorEscaneo}</p>}
            {codigosEscaneados.length > 0 && (
              <ul style={{ maxHeight: '150px', overflowY: 'auto', margin: '0.5rem 0 0 0', paddingLeft: '1.2rem' }}>
                {codigosEscaneados.map((c, i) => (
                  <li key={`${c}-${i}`} style={{ fontSize: '0.85rem' }}>
                    {c} <button type="button" onClick={() => quitarCodigoEscaneado(i)} style={{ fontSize: '0.75rem' }}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={agregarProductoAlCarrito}
          disabled={!esAccesorio && !escaneoCompleto}
          style={{ marginTop: '0.75rem' }}
        >
          + Agregar a la compra
        </button>
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
              <th>Cantidad</th>
              <th>Costo unit.</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carrito.map((item) => (
              <tr key={item.key} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{item.descripcion}</td>
                <td>{item.codigos ? item.codigos.length : item.cantidad}</td>
                <td>${item.costoUnitario.toFixed(2)}</td>
                <td>${item.subtotal.toFixed(2)}</td>
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

      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '2rem' }}>
        El historial de compras ahora se consulta desde <strong>Reportes → Reporte de compras</strong>,
        con filtros por dia, semana, mes, año o rango de fechas.
      </p>
    </div>
  );
}
