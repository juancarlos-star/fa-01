import React, { useState, useEffect, useRef, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Card' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

const IVA_TASA = 0.16;

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
  // Confirmacion propia (sin dialogo nativo): { tipo: 'quitarCodigo'|'eliminarTodos'|'quitarCarrito', index?, key? }
  const [confirmando, setConfirmando] = useState(null);

  const esAccesorio = tipoSeleccionado === 'accesorio';
  const cantidadNum = parseInt(cantidadDeseada, 10) || 0;
  const permiteRango = tipoSeleccionado === 'simcard' || tipoSeleccionado === 'usim';
  const modoRangoActivo = permiteRango && modoEscaneo === 'rango';

  // Datos base (producto + costo) ya definidos: a partir de aqui se puede elegir modo manual o por rango.
  const datosBaseListos = !esAccesorio && productoId !== '' && costoUnitario !== '';
  // En modo rango no se pide cantidad: la calcula el sistema a partir del primer y el ultimo codigo.
  const listoParaEscanear = datosBaseListos && (modoRangoActivo || cantidadNum > 0);
  const cantidadEfectiva = modoRangoActivo ? codigosEscaneados.length : cantidadNum;
  const escaneoCompleto = modoRangoActivo
    ? codigosEscaneados.length > 0
    : listoParaEscanear && codigosEscaneados.length === cantidadNum;

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

  // El salto de foco hacia el cuadro de escaneo NUNCA ocurre mientras el usuario esta
  // escribiendo en otro campo (cantidad, costo, etc). Solo se dispara con eventos explicitos:
  // al salir (blur) de cantidad/costo, al quitar un codigo, al agregar un codigo manual,
  // o al cambiar a modo manual.
  // Importante: nunca usar autoFocus en el input de escaneo, porque robaria el foco del
  // campo Cantidad apenas se muestre este bloque (eso causaba que solo se pudiera escribir
  // 1 digito en Cantidad).
  // Importante tambien: las confirmaciones de "quitar/eliminar" en esta pantalla usan un
  // modal propio (ConfirmDialog), NO window.confirm() nativo. El dialogo nativo le quita la
  // activacion de la ventana a Windows a nivel de sistema operativo y no siempre se recupera
  // (eso causaba que el campo se viera activo pero no aceptara texto ni pistola hasta cambiar
  // de ventana y volver). Un modal de React nunca sale de la ventana del programa, asi que
  // este problema no puede volver a pasar mientras no se reintroduzca window.confirm() aqui.
  const enfocarEscaneoSiListo = () => {
    if (datosBaseListos && modoEscaneo === 'manual' && cantidadNum > 0 && !escaneoCompleto && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  };

  useEffect(() => {
    if (modoEscaneo === 'manual') enfocarEscaneoSiListo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEscaneo]);

  const agregarCodigoEscaneado = async () => {
    const codigo = valorEscaneo.trim();
    setValorEscaneo('');
    if (!codigo) return;
    setErrorEscaneo('');

    if (codigosEscaneados.length >= cantidadNum) {
      setErrorEscaneo(`Ya llegaste a los ${cantidadNum} codigos declarados. Quita alguno si necesitas corregir.`);
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
      // El foco se pide en el siguiente tick (no de inmediato), porque el input todavia esta
      // marcado como disabled en el DOM en este instante (React aun no aplico el cambio de
      // "verificando"); un input disabled no acepta foco, por eso antes se quedaba sin
      // regresar el cursor automaticamente al campo para escribir el siguiente codigo.
      setTimeout(() => { if (scanInputRef.current) scanInputRef.current.focus(); }, 0);
    }
  };

  // La pistola escaneadora manda un "Enter" automatico al terminar de leer el codigo de barras,
  // por eso el Enter agrega el codigo solo. Al escribir a mano el usuario debe presionar Enter
  // o el boton "Agregar codigo" de al lado, ya que el teclado no manda ese Enter automatico.
  const handleScanKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    agregarCodigoEscaneado();
  };

  const quitarCodigoEscaneado = (index) => {
    setConfirmando({ tipo: 'quitarCodigo', index });
  };

  const eliminarTodosLosCodigos = () => {
    if (codigosEscaneados.length === 0) return;
    setConfirmando({ tipo: 'eliminarTodos' });
  };

  const ejecutarQuitarCodigo = (index) => {
    setCodigosEscaneados((prev) => prev.filter((_, i) => i !== index));
    setErrorEscaneo('');
    setConfirmando(null);
    // Al ser un modal propio de React (no window.confirm nativo), la ventana nunca pierde
    // el foco a nivel de sistema operativo, asi que el input recupera el foco sin trucos.
    setTimeout(enfocarEscaneoSiListo, 0);
  };

  const ejecutarEliminarTodos = () => {
    setCodigosEscaneados([]);
    setErrorEscaneo('');
    setConfirmando(null);
    setTimeout(enfocarEscaneoSiListo, 0);
  };

  const handleGenerarRango = async () => {
    setErrorEscaneo('');
    if (!codigoInicioRango.trim() || !codigoFinRango.trim()) {
      setErrorEscaneo('Escanea o escribe el primer y el ultimo codigo de la caja');
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
      if (modoRangoActivo && codigosEscaneados.length === 0) { setError('Genera el rango de codigos antes de agregar'); return; }
      if (!escaneoCompleto) { setError(`Faltan codigos por escanear (${codigosEscaneados.length} de ${cantidadNum})`); return; }
      setCarrito((prev) => [...prev, {
        key: `${producto.id}-${Date.now()}`,
        product_id: producto.id, tipo: producto.tipo, descripcion: producto.nombre,
        costoUnitario: costo, codigos: [...codigosEscaneados], cantidadDeclarada: cantidadEfectiva,
        subtotal: costo * codigosEscaneados.length
      }]);
    }
    resetearFormularioProducto();
  };

  const quitarDelCarrito = (key) => {
    setConfirmando({ tipo: 'quitarCarrito', key });
  };

  const ejecutarQuitarDelCarrito = (key) => {
    setCarrito((prev) => prev.filter((i) => i.key !== key));
    setConfirmando(null);
  };

  const baseImponible = carrito.reduce((acc, i) => acc + i.subtotal, 0);
  const totalIva = baseImponible * IVA_TASA;
  const totalCompra = baseImponible + totalIva;

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
      setTipoSeleccionado('equipo');
      resetearFormularioProducto();
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

      <div className="form-box" style={{ maxWidth: '500px' }}>
        <h3>Datos del proveedor</h3>
        <label>Proveedor</label>
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej: Distribuidora XYZ" />
        <label>N° de factura de compra</label>
        <input value={numeroFacturaCompra} onChange={(e) => setNumeroFacturaCompra(e.target.value)} placeholder="Ej: 00458" />
      </div>

      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar producto a la compra</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
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
          onChange={(e) => { setCostoUnitario(e.target.value); setCodigosEscaneados([]); }}
          onBlur={enfocarEscaneoSiListo} />

        {datosBaseListos && permiteRango && codigosEscaneados.length === 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0 0.25rem 0', flexWrap: 'wrap' }}>
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

        {!modoRangoActivo && (
          <>
            <label>Cantidad {esAccesorio ? '' : 'que llego segun la factura'}</label>
            <input type="number" min="1" value={cantidadDeseada}
              onChange={(e) => { setCantidadDeseada(e.target.value); setCodigosEscaneados([]); }}
              onBlur={enfocarEscaneoSiListo} />
          </>
        )}

        {listoParaEscanear && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f4f7fb', borderRadius: '6px' }}>

            {!modoRangoActivo && (
              <p style={{ margin: '0 0 0.4rem 0', fontWeight: '600', fontSize: '0.9rem' }}>
                Escaneados: {codigosEscaneados.length} de {cantidadNum}
              </p>
            )}
            {modoRangoActivo && codigosEscaneados.length > 0 && (
              <p style={{ margin: '0 0 0.4rem 0', fontWeight: '600', fontSize: '0.9rem' }}>
                Codigos generados: {codigosEscaneados.length}
              </p>
            )}

            {modoEscaneo === 'manual' && !escaneoCompleto && (
              <>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    ref={scanInputRef}
                    value={valorEscaneo}
                    onChange={(e) => setValorEscaneo(e.target.value)}
                    onKeyDown={handleScanKeyDown}
                    placeholder={verificando ? 'Verificando...' : 'Dispara la pistola aqui o escribe y presiona Enter'}
                    disabled={verificando}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={agregarCodigoEscaneado}
                    disabled={verificando || !valorEscaneo.trim()}
                  >
                    Agregar codigo
                  </button>
                </div>
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem', color: '#888' }}>
                  Con la pistola se agrega solo al disparar. Si lo escribes a mano, presiona Enter o el boton "Agregar codigo".
                </p>
              </>
            )}

            {modoEscaneo === 'manual' && escaneoCompleto && (
              <p style={{ margin: 0, color: '#027a48', fontWeight: 'bold', fontSize: '0.9rem' }}>
                Ha llegado a los {cantidadNum} items
              </p>
            )}

            {modoRangoActivo && codigosEscaneados.length === 0 && (
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
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0.4rem 0' }}>
                  <button
                    type="button"
                    onClick={eliminarTodosLosCodigos}
                    style={{
                      fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '4px', border: 'none',
                      cursor: 'pointer', backgroundColor: '#b42318', color: '#fff'
                    }}
                  >
                    Eliminar todos
                  </button>
                </div>
                <ul style={{ maxHeight: '150px', overflowY: 'auto', margin: 0, paddingLeft: '1.2rem' }}>
                  {codigosEscaneados.map((c, i) => (
                    <li key={`${c}-${i}`} style={{ fontSize: '0.85rem' }}>
                      {c} <button type="button" onClick={() => quitarCodigoEscaneado(i)} style={{ fontSize: '0.75rem' }}>Quitar</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={agregarProductoAlCarrito}
          style={{ marginTop: '0.75rem' }}
        >
          + Agregar a la compra
        </button>
        {!esAccesorio && !escaneoCompleto && (
          <p style={{ color: '#666', fontSize: '0.8rem', margin: '0.3rem 0 0 0' }}>
            {modoRangoActivo
              ? 'Genera el rango de codigos antes de agregar.'
              : `Debes completar el escaneo (${codigosEscaneados.length} de ${cantidadNum || 0}) antes de agregar.`}
          </p>
        )}
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
              <th>Costo unit. sin IVA</th>
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
        <p style={{ margin: '0 0 0.3rem 0' }}>Base imponible sin IVA: <strong>${baseImponible.toFixed(2)}</strong></p>
        <p style={{ margin: '0 0 0.3rem 0' }}>IVA (16%): <strong>${totalIva.toFixed(2)}</strong></p>
        <p style={{ margin: '0 0 0.3rem 0' }}>Total de la compra: <strong>${totalCompra.toFixed(2)}</strong></p>
        <button onClick={handleRegistrarCompra} style={{ marginTop: '8px' }}>Registrar compra</button>
      </div>

      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '2rem' }}>
        El historial de compras ahora se consulta desde <strong>Reportes → Reporte de compras</strong>,
        con filtros por dia, semana, mes, año o rango de fechas.
      </p>

      {confirmando?.tipo === 'quitarCodigo' && (
        <ConfirmDialog
          message="¿Seguro que deseas quitar este codigo de la lista?"
          confirmLabel="Si, quitar"
          onConfirm={() => ejecutarQuitarCodigo(confirmando.index)}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {confirmando?.tipo === 'eliminarTodos' && (
        <ConfirmDialog
          message={`¿Seguro que deseas eliminar los ${codigosEscaneados.length} codigo(s) escaneados/generados?`}
          confirmLabel="Si, eliminar todos"
          onConfirm={ejecutarEliminarTodos}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {confirmando?.tipo === 'quitarCarrito' && (
        <ConfirmDialog
          message="¿Seguro que deseas quitar este producto de la compra?"
          confirmLabel="Si, quitar"
          onConfirm={() => ejecutarQuitarDelCarrito(confirmando.key)}
          onCancel={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}
