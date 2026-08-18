import React, { useState, useEffect, useCallback, useRef } from 'react';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import { generarCargoDescargoDocumentoPDF } from '../utils/generarCargoDescargoPDF.js';

const TIPOS = [
  { key: 'equipo', label: 'Equipos (IMEI)' },
  { key: 'simcard', label: 'SIM Cards' },
  { key: 'usim', label: 'USIM' },
  { key: 'accesorio', label: 'Accesorios' }
];

// Copia liviana (sin tocar la base de datos) de calcularRango() en electron/main.js, usada
// solo por la herramienta de "agregar por rango" al dar de baja (descargo), para generar la
// lista completa de codigos del rango y despues buscarlos entre las unidades disponibles del
// producto seleccionado. Para el CARGO no hace falta esta funcion: se usa directamente el
// handler compras:calcularRango, que ya hace este mismo calculo en el proceso principal.
function calcularCodigosRango(codigoInicio, codigoFin) {
  const partirDigitosFinales = (s) => {
    let i = s.length;
    while (i > 0 && /\d/.test(s[i - 1])) i--;
    return { prefijo: s.slice(0, i), digitos: s.slice(i) };
  };
  const a = (codigoInicio || '').trim();
  const b = (codigoFin || '').trim();
  if (!a || !b) return null;
  const pa = partirDigitosFinales(a);
  const pb = partirDigitosFinales(b);
  if (pa.prefijo !== pb.prefijo || !pa.digitos || !pb.digitos) return null;
  const numA = parseInt(pa.digitos, 10);
  const numB = parseInt(pb.digitos, 10);
  if (isNaN(numA) || isNaN(numB) || numA > numB) return null;
  if (numB - numA + 1 > 5000) return null;
  const ancho = Math.max(pa.digitos.length, pb.digitos.length);
  const codigos = [];
  for (let n = numA; n <= numB; n++) codigos.push(pa.prefijo + String(n).padStart(ancho, '0'));
  return codigos;
}

let contadorKeyItem = 0;
function nuevaKeyItem() {
  contadorKeyItem += 1;
  return `item-${Date.now()}-${contadorKeyItem}`;
}

export default function CargosDescargos({ currentUser }) {
  // ---- El documento que se esta armando: puede incluir varios productos y tipos distintos
  // (equipos, simcards, usim y accesorios mezclados) en un mismo procedimiento. Nada se
  // guarda en la base de datos hasta que se presiona "Registrar documento": todo lo de abajo
  // es solo un borrador en memoria. ----
  const [tipoDocumento, setTipoDocumento] = useState('cargo'); // 'cargo' | 'descargo'
  const [itemsDocumento, setItemsDocumento] = useState([]);
  const [motivoDocumento, setMotivoDocumento] = useState('');
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { encabezadoId, registros, tipoDocumento }
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null); // una linea del documento ya emitido
  const [generandoPDF, setGenerandoPDF] = useState(false);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  const hayItems = itemsDocumento.length > 0;

  const cambiarTipoDocumento = (valor) => {
    if (valor === tipoDocumento) return;
    if (hayItems && !window.confirm('Cambiar de Cargo a Descargo (o viceversa) vacia el documento que estas armando. ¿Deseas continuar?')) {
      return;
    }
    setTipoDocumento(valor);
    setItemsDocumento([]);
    setMotivoDocumento('');
    setError('');
  };

  const quitarItem = (key) => {
    setItemsDocumento((prev) => prev.filter((it) => it.key !== key));
  };

  const agregarItem = (item) => {
    setError('');
    setItemsDocumento((prev) => {
      // Al escanear el mismo codigo de barras de un accesorio varias veces (descargo), en vez
      // de crear una linea nueva por cada escaneo, se suma 1 a la cantidad de la linea ya
      // existente para ese mismo producto.
      if (item._incrementable) {
        const idx = prev.findIndex((it) => it.esAccesorio && it.productId === item.productId && it._incrementable);
        if (idx !== -1) {
          const copia = [...prev];
          copia[idx] = { ...copia[idx], cantidad: (parseInt(copia[idx].cantidad, 10) || 0) + 1 };
          return copia;
        }
      }
      return [...prev, { key: nuevaKeyItem(), ...item }];
    });
  };

  const totalDocumentoUsd = itemsDocumento.reduce((acc, it) => {
    if (tipoDocumento !== 'cargo') return acc;
    const costo = parseFloat(it.costoUnitario) || 0;
    const cantidad = it.esAccesorio ? (parseInt(it.cantidad, 10) || 0) : 1;
    return acc + costo * cantidad;
  }, 0);

  const handleRegistrarDocumento = async () => {
    setError('');
    if (itemsDocumento.length === 0) {
      setError('Agrega al menos un articulo al documento antes de registrarlo');
      return;
    }
    if (tipoDocumento === 'descargo' && !motivoDocumento.trim()) {
      setError('Indica el motivo del descargo (aplica a todo el documento)');
      return;
    }
    setEnviando(true);
    try {
      const payload = {
        tipoDocumento,
        motivo: motivoDocumento.trim(),
        usuario: currentUser?.username,
        items: itemsDocumento.map((it) => ({
          productId: it.productId,
          esAccesorio: it.esAccesorio,
          cantidad: it.esAccesorio ? it.cantidad : undefined,
          codigo: !it.esAccesorio && tipoDocumento === 'cargo' ? it.codigo : undefined,
          unitId: !it.esAccesorio && tipoDocumento === 'descargo' ? it.unitId : undefined,
          costoUnitario: tipoDocumento === 'cargo' ? it.costoUnitario : undefined
        }))
      };
      const res = await window.api.crearDocumentoCargoDescargo(payload);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setConfirmacion({ encabezadoId: res.encabezadoId, registros: res.registros, tipoDocumento });
      setItemsDocumento([]);
      setMotivoDocumento('');
      // El comprobante consolidado (con todos los articulos del documento, aunque sean de
      // productos distintos) se genera e imprime automaticamente, sin que el usuario tenga
      // que pedirlo aparte.
      await generarCargoDescargoDocumentoPDF(res.encabezadoId, res.registros, tipoDocumento, settings, { imprimir: true });
    } catch (err) {
      setError('Ocurrio un error inesperado al registrar el documento: ' + (err?.message || String(err)));
    } finally {
      setEnviando(false);
    }
  };

  const nuevoDocumento = () => {
    setConfirmacion(null);
    setComprobanteAbierto(null);
  };

  if (comprobanteAbierto) {
    return (
      <CargoDescargoDetalle
        registro={comprobanteAbierto}
        tipoDocumento={confirmacion?.tipoDocumento || tipoDocumento}
        onVolver={() => setComprobanteAbierto(null)}
      />
    );
  }

  if (confirmacion) {
    const esCargo = confirmacion.tipoDocumento === 'cargo';
    const totalConfirmacion = confirmacion.registros.reduce((acc, r) => acc + (r.total_usd || 0), 0);
    return (
      <div>
        <h1>Documento registrado</h1>
        <div className="form-box" style={{ maxWidth: '620px' }}>
          <p>
            <strong>N° de documento:</strong> {esCargo ? 'CAR' : 'DES'}-{String(confirmacion.encabezadoId).padStart(5, '0')}
          </p>
          <p><strong>Articulos incluidos:</strong> {confirmacion.registros.length}</p>
          {esCargo && <p><strong>Total del documento:</strong> ${totalConfirmacion.toFixed(2)}</p>}
          <ul style={{ listStyle: 'none', padding: 0, maxHeight: '260px', overflowY: 'auto', margin: '0.75rem 0' }}>
            {confirmacion.registros.map((r) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #eee' }}>
                <span>
                  {r.producto_nombre} {r.unidad_codigo ? `— ${r.unidad_codigo}` : `(x${r.cantidad})`}
                </span>
                <button type="button" onClick={() => setComprobanteAbierto(r)}>Ver comprobante</button>
              </li>
            ))}
          </ul>
          <button
            onClick={async () => {
              setGenerandoPDF(true);
              try {
                await generarCargoDescargoDocumentoPDF(confirmacion.encabezadoId, confirmacion.registros, confirmacion.tipoDocumento, settings);
              } finally {
                setGenerandoPDF(false);
              }
            }}
            disabled={generandoPDF}
            style={{ marginRight: '8px' }}
          >
            {generandoPDF ? 'Generando...' : 'Descargar PDF del documento'}
          </button>
          <button onClick={nuevoDocumento}>Hacer otro documento</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Cargos y Descargos de inventario</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', maxWidth: '650px' }}>
        Todo ingreso o baja de stock fuera de una compra formal a proveedor (modulo Compras) se hace aqui.
        Un mismo documento puede incluir varios articulos de productos distintos (por ejemplo, 4 iPhone,
        3 SIM Card y 3 estuches a la vez): agregalos abajo uno por uno y al final registra todo el
        documento de una sola vez. Solo el administrador tiene acceso a este modulo.
      </p>

      <div className="form-box" style={{ maxWidth: '500px' }}>
        <label>Tipo de documento</label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
          <button
            type="button"
            onClick={() => cambiarTipoDocumento('cargo')}
            style={{
              padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
              backgroundColor: tipoDocumento === 'cargo' ? '#027a48' : '#e2e8f0', color: tipoDocumento === 'cargo' ? '#fff' : '#111'
            }}
          >
            Cargo (agregar stock)
          </button>
          <button
            type="button"
            onClick={() => cambiarTipoDocumento('descargo')}
            style={{
              padding: '0.4rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
              backgroundColor: tipoDocumento === 'descargo' ? '#b42318' : '#e2e8f0', color: tipoDocumento === 'descargo' ? '#fff' : '#111'
            }}
          >
            Descargo (dar de baja)
          </button>
        </div>
      </div>

      {tipoDocumento === 'cargo' ? (
        <AgregarItemsCargo onAgregar={agregarItem} itemsDocumento={itemsDocumento} />
      ) : (
        <AgregarItemsDescargo onAgregar={agregarItem} itemsDocumento={itemsDocumento} />
      )}

      <DocumentoDraft
        tipoDocumento={tipoDocumento}
        items={itemsDocumento}
        onQuitar={quitarItem}
        totalUsd={totalDocumentoUsd}
      />

      <div className="form-box" style={{ maxWidth: '600px' }}>
        {tipoDocumento === 'descargo' && (
          <>
            <label>Motivo del descargo (aplica a todo el documento) *</label>
            <textarea
              value={motivoDocumento}
              onChange={(e) => setMotivoDocumento(e.target.value)}
              rows={2}
              style={{ width: '100%' }}
              placeholder="Ej: dañado, perdido, robado, ajuste de inventario"
            />
          </>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button
          onClick={handleRegistrarDocumento}
          disabled={enviando || !hayItems}
          style={{ marginTop: '0.75rem', padding: '0.5rem 1.2rem', fontWeight: 'bold' }}
        >
          {enviando ? 'Registrando...' : `Registrar documento (${itemsDocumento.length} articulo${itemsDocumento.length === 1 ? '' : 's'})`}
        </button>
      </div>
    </div>
  );
}

// ---------------- Tabla del documento en borrador ----------------

function DocumentoDraft({ tipoDocumento, items, onQuitar, totalUsd }) {
  if (items.length === 0) {
    return (
      <div className="form-box" style={{ maxWidth: '600px', color: '#666' }}>
        Todavia no has agregado ningun articulo a este documento.
      </div>
    );
  }
  const esCargo = tipoDocumento === 'cargo';
  return (
    <div className="form-box" style={{ maxWidth: '700px' }}>
      <h3>Articulos del documento ({items.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '0.4rem' }}>Producto</th>
            <th>Tipo</th>
            <th>Codigo / Cantidad</th>
            {esCargo && <th>Costo unit.</th>}
            {esCargo && <th>Subtotal</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const cantidad = it.esAccesorio ? (parseInt(it.cantidad, 10) || 0) : 1;
            const costo = parseFloat(it.costoUnitario) || 0;
            return (
              <tr key={it.key} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem' }}>{it.productoNombre}</td>
                <td>{it.tipo}</td>
                <td>{it.esAccesorio ? `x${it.cantidad}` : it.codigo}</td>
                {esCargo && <td>${costo.toFixed(2)}</td>}
                {esCargo && <td>${(costo * cantidad).toFixed(2)}</td>}
                <td><button type="button" onClick={() => onQuitar(it.key)}>Quitar</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {esCargo && (
        <p style={{ textAlign: 'right', fontWeight: 'bold', marginTop: '0.5rem' }}>
          Total del documento: ${totalUsd.toFixed(2)}
        </p>
      )}
    </div>
  );
}

// ---------------- Agregar items: CARGO (equipo/simcard/usim/accesorio) ----------------

function AgregarItemsCargo({ onAgregar, itemsDocumento }) {
  const [tipoActivo, setTipoActivo] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [costo, setCosto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  const [mostrarRango, setMostrarRango] = useState(false);
  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [cantidadRango, setCantidadRango] = useState('');
  const [procesandoRango, setProcesandoRango] = useState(false);

  const codigoInputRef = useRef(null);
  const esAccesorio = tipoActivo === 'accesorio';
  const permiteRango = tipoActivo === 'simcard' || tipoActivo === 'usim';
  const producto = productos.find((p) => p.id === Number(productoId));

  const cargarProductos = useCallback(async () => {
    const data = await window.api.listProducts(tipoActivo);
    setProductos(data);
    setProductoId('');
  }, [tipoActivo]);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  const seleccionarTab = (key) => {
    setTipoActivo(key);
    setErrorLocal('');
    setMostrarRango(false);
  };

  // El input de codigo/IMEI se enfoca de nuevo automaticamente, tanto al elegir producto como
  // despues de cada "+ Agregar codigo", para poder seguir escaneando sin usar el mouse.
  useEffect(() => {
    if (!esAccesorio && productoId && codigoInputRef.current) {
      codigoInputRef.current.focus();
    }
  }, [productoId, esAccesorio]);

  const handleAgregarAccesorio = (e) => {
    e.preventDefault();
    setErrorLocal('');
    if (!productoId) { setErrorLocal('Selecciona un producto'); return; }
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setErrorLocal('Indica la cantidad a cargar'); return; }
    const c = parseFloat(costo);
    if (isNaN(c) || c < 0) { setErrorLocal('Indica el costo unitario'); return; }
    onAgregar({
      productId: producto.id, productoNombre: producto.nombre, tipo: producto.tipo,
      esAccesorio: true, cantidad: n, costoUnitario: c, codigoBarras: codigoBarras.trim() || null
    });
    setCantidad(''); setCodigoBarras('');
  };

  const handleAgregarCodigo = (e) => {
    e.preventDefault();
    setErrorLocal('');
    if (!productoId) { setErrorLocal('Selecciona un producto'); return; }
    const texto = codigo.trim();
    if (!texto) return;
    const c = parseFloat(costo);
    if (isNaN(c) || c < 0) { setErrorLocal('Indica el costo de compra antes de agregar codigos'); return; }
    const yaEnDocumento = itemsDocumento.some((it) => !it.esAccesorio && it.codigo && it.codigo.toLowerCase() === texto.toLowerCase());
    if (yaEnDocumento) { setErrorLocal('Ese codigo ya fue agregado a este documento'); setCodigo(''); return; }
    onAgregar({
      productId: producto.id, productoNombre: producto.nombre, tipo: producto.tipo,
      esAccesorio: false, codigo: texto, costoUnitario: c
    });
    setCodigo('');
    // El foco vuelve de una vez al mismo campo para poder seguir escaneando el siguiente
    // codigo sin tener que hacer click otra vez.
    requestAnimationFrame(() => codigoInputRef.current?.focus());
  };

  const handleAgregarRango = async (e) => {
    e.preventDefault();
    setErrorLocal('');
    if (!productoId) { setErrorLocal('Selecciona un producto'); return; }
    if (!codigoInicio.trim() || !codigoFin.trim()) { setErrorLocal('Escanea o escribe el primer y el ultimo codigo de la caja'); return; }
    const cantidadDeclarada = parseInt(cantidadRango, 10);
    if (!cantidadDeclarada || cantidadDeclarada <= 0) { setErrorLocal('Indica la cantidad de items que contiene este rango'); return; }
    const c = parseFloat(costo);
    if (isNaN(c) || c < 0) { setErrorLocal('Indica el costo unitario del lote'); return; }
    setProcesandoRango(true);
    try {
      const res = await window.api.calcularRangoCompra(codigoInicio.trim(), codigoFin.trim());
      if (!res.ok) { setErrorLocal(res.message); return; }
      if (res.total !== cantidadDeclarada) {
        setErrorLocal(`La cantidad indicada (${cantidadDeclarada}) no coincide con el rango escaneado (${res.total} codigos). Verifica antes de continuar.`);
        return;
      }
      const yaEnDocumento = new Set(
        itemsDocumento.filter((it) => !it.esAccesorio && it.codigo).map((it) => it.codigo.toLowerCase())
      );
      let agregados = 0;
      for (const cod of res.disponibles) {
        if (yaEnDocumento.has(cod.toLowerCase())) continue;
        onAgregar({
          productId: producto.id, productoNombre: producto.nombre, tipo: producto.tipo,
          esAccesorio: false, codigo: cod, costoUnitario: c
        });
        agregados++;
      }
      const saltados = res.total - agregados;
      setErrorLocal(
        saltados > 0
          ? `Se agregaron ${agregados} codigos al documento. Se saltaron ${saltados} (ya registrados en el inventario o repetidos en este documento).`
          : `Se agregaron los ${agregados} codigos al documento.`
      );
      setCodigoInicio(''); setCodigoFin(''); setCantidadRango('');
    } finally {
      setProcesandoRango(false);
    }
  };

  return (
    <div className="form-box" style={{ maxWidth: '600px' }}>
      <h3>Agregar articulo al documento (Cargo)</h3>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0 0 0.75rem 0', flexWrap: 'wrap' }}>
        {TIPOS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => seleccionarTab(t.key)}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: tipoActivo === t.key ? '#0b4f9e' : '#e2e8f0',
              color: tipoActivo === t.key ? '#fff' : '#111',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
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
          <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_disponible})</option>
        ))}
      </select>

      {productoId && esAccesorio && (
        <form onSubmit={handleAgregarAccesorio} style={{ marginTop: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Cantidad *</label><br />
              <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus style={{ width: '110px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Costo unitario (USD) *</label><br />
              <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} style={{ width: '110px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem' }}>Codigo de barras (opcional)</label><br />
              <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Si aplica" />
            </div>
            <button type="submit">+ Agregar accesorio</button>
          </div>
        </form>
      )}

      {productoId && !esAccesorio && (
        <div style={{ marginTop: '0.6rem' }}>
          <label style={{ fontSize: '0.8rem' }}>Costo de compra unitario (USD) *</label><br />
          <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} style={{ width: '140px', marginBottom: '0.5rem' }} />
          <form onSubmit={handleAgregarCodigo}>
            <label style={{ fontSize: '0.8rem', display: 'block' }}>
              Codigo / IMEI — escanea con la pistola o escribe y presiona Enter, uno a la vez
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={codigoInputRef}
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Dispara la pistola aqui o escribe el codigo y presiona Enter"
                style={{ flex: 1 }}
              />
              <button type="submit">+ Agregar codigo</button>
            </div>
          </form>

          {permiteRango && (
            <div style={{ marginTop: '0.6rem' }}>
              <button type="button" onClick={() => setMostrarRango((v) => !v)} style={{ fontSize: '0.8rem' }}>
                {mostrarRango ? 'Ocultar' : 'Agregar por rango (caja completa)'}
              </button>
              {mostrarRango && (
                <form onSubmit={handleAgregarRango} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem' }}>Primer codigo</label><br />
                    <input value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem' }}>Ultimo codigo</label><br />
                    <input value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem' }}>Cantidad de items *</label><br />
                    <input type="number" min="1" value={cantidadRango} onChange={(e) => setCantidadRango(e.target.value)} style={{ width: '140px' }} />
                  </div>
                  <button type="submit" disabled={procesandoRango}>
                    {procesandoRango ? 'Procesando...' : 'Agregar rango al documento'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {errorLocal && <p style={{ color: errorLocal.startsWith('Se agregaron') ? 'green' : 'red', fontSize: '0.85rem', marginTop: '0.5rem' }}>{errorLocal}</p>}
    </div>
  );
}

// ---------------- Agregar items: DESCARGO (equipo/simcard/usim por escaneo global + accesorio por cantidad) ----------------

function AgregarItemsDescargo({ onAgregar, itemsDocumento }) {
  const [scanTexto, setScanTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorScan, setErrorScan] = useState('');
  const scanRef = useRef(null);

  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [errorAccesorio, setErrorAccesorio] = useState('');

  const [mostrarRango, setMostrarRango] = useState(false);
  const [productoRangoId, setProductoRangoId] = useState('');
  const [productosRango, setProductosRango] = useState([]);
  const [tipoRango, setTipoRango] = useState('simcard');
  const [codigoInicio, setCodigoInicio] = useState('');
  const [codigoFin, setCodigoFin] = useState('');
  const [cantidadRango, setCantidadRango] = useState('');
  const [errorRango, setErrorRango] = useState('');
  const [procesandoRango, setProcesandoRango] = useState(false);

  useEffect(() => { scanRef.current?.focus(); }, []);

  const cargarProductosAccesorio = useCallback(async () => {
    const data = await window.api.listProducts('accesorio');
    setProductos(data);
    setProductoId('');
  }, []);
  useEffect(() => { cargarProductosAccesorio(); }, [cargarProductosAccesorio]);

  const cargarProductosRango = useCallback(async () => {
    const data = await window.api.listProducts(tipoRango);
    setProductosRango(data);
    setProductoRangoId('');
  }, [tipoRango]);
  useEffect(() => { if (mostrarRango) cargarProductosRango(); }, [mostrarRango, cargarProductosRango]);

  // Escaneo/escritura de un solo codigo (IMEI, ICCID, codigo USIM o codigo de barras de
  // accesorio) que identifica automaticamente el producto correspondiente, sin tener que
  // elegir pestaña ni producto a mano. Cada Enter (o click en "Agregar") agrega el articulo al
  // documento y el foco vuelve de inmediato al mismo campo para seguir escaneando.
  const handleEscanear = async (e) => {
    e.preventDefault();
    const texto = scanTexto.trim();
    setErrorScan('');
    if (!texto) return;
    setBuscando(true);
    try {
      const res = await window.api.buscarPorCodigo(texto);
      if (!res.ok) {
        setErrorScan(res.message);
        setScanTexto('');
        return;
      }
      if (res.tipoResultado === 'unidad') {
        if (res.unit.estado !== 'disponible') {
          setErrorScan(`El codigo "${res.unit.codigo}" no esta disponible (estado actual: ${res.unit.estado})`);
          setScanTexto('');
          return;
        }
        const yaEnDocumento = itemsDocumento.some((it) => !it.esAccesorio && it.unitId === res.unit.id);
        if (yaEnDocumento) {
          setErrorScan('Ese codigo ya fue agregado a este documento');
          setScanTexto('');
          return;
        }
        onAgregar({
          productId: res.product_id, productoNombre: res.producto_nombre, tipo: res.tipo,
          esAccesorio: false, unitId: res.unit.id, codigo: res.unit.codigo
        });
      } else {
        // Codigo de barras de un accesorio: cada escaneo suma 1 a la cantidad de ese
        // producto dentro del documento (si ya tenia una linea, la incrementa).
        onAgregar({
          productId: res.product_id, productoNombre: res.producto_nombre, tipo: 'accesorio',
          esAccesorio: true, cantidad: 1, _incrementable: true
        });
      }
      setScanTexto('');
    } catch (err) {
      setErrorScan('Error buscando el codigo: ' + (err?.message || String(err)));
    } finally {
      setBuscando(false);
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  };

  const handleAgregarAccesorio = (e) => {
    e.preventDefault();
    setErrorAccesorio('');
    if (!productoId) { setErrorAccesorio('Selecciona un producto'); return; }
    const n = parseInt(cantidad, 10);
    if (!n || n <= 0) { setErrorAccesorio('Indica la cantidad a descargar'); return; }
    const producto = productos.find((p) => p.id === Number(productoId));
    if (n > producto.stock_disponible) { setErrorAccesorio(`Solo hay ${producto.stock_disponible} disponible(s)`); return; }
    onAgregar({
      productId: producto.id, productoNombre: producto.nombre, tipo: producto.tipo,
      esAccesorio: true, cantidad: n
    });
    setCantidad('');
  };

  const handleAgregarRango = async (e) => {
    e.preventDefault();
    setErrorRango('');
    if (!productoRangoId) { setErrorRango('Selecciona un producto'); return; }
    if (!codigoInicio.trim() || !codigoFin.trim()) { setErrorRango('Escanea o escribe el primer y el ultimo codigo'); return; }
    const cantidadDeclarada = parseInt(cantidadRango, 10);
    if (!cantidadDeclarada || cantidadDeclarada <= 0) { setErrorRango('Indica la cantidad de items que contiene este rango'); return; }
    const codigos = calcularCodigosRango(codigoInicio.trim(), codigoFin.trim());
    if (!codigos) { setErrorRango('Revisa el primer y el ultimo codigo: no se pudo calcular el rango'); return; }
    if (codigos.length !== cantidadDeclarada) {
      setErrorRango(`La cantidad indicada (${cantidadDeclarada}) no coincide con el rango escaneado (${codigos.length} codigos). Verifica antes de continuar.`);
      return;
    }
    setProcesandoRango(true);
    try {
      const producto = productosRango.find((p) => p.id === Number(productoRangoId));
      const unidades = await window.api.listUnits(producto.id);
      const disponiblesPorCodigo = new Map(
        unidades.filter((u) => u.estado === 'disponible').map((u) => [u.codigo.toLowerCase(), u])
      );
      const yaEnDocumento = new Set(
        itemsDocumento.filter((it) => !it.esAccesorio && it.unitId).map((it) => it.unitId)
      );
      let agregados = 0;
      for (const cod of codigos) {
        const u = disponiblesPorCodigo.get(cod.toLowerCase());
        if (!u || yaEnDocumento.has(u.id)) continue;
        onAgregar({
          productId: producto.id, productoNombre: producto.nombre, tipo: producto.tipo,
          esAccesorio: false, unitId: u.id, codigo: u.codigo
        });
        yaEnDocumento.add(u.id);
        agregados++;
      }
      const saltados = codigos.length - agregados;
      setErrorRango(
        saltados > 0
          ? `Se agregaron ${agregados} codigos al documento. Se saltaron ${saltados} (no disponibles o ya en el documento).`
          : `Se agregaron los ${agregados} codigos al documento.`
      );
      setCodigoInicio(''); setCodigoFin(''); setCantidadRango('');
    } finally {
      setProcesandoRango(false);
    }
  };

  return (
    <>
      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar articulo al documento (Descargo)</h3>
        <label>Escanear o escribir IMEI, codigo (SIM/USIM) o codigo de barras</label>
        <form onSubmit={handleEscanear} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            ref={scanRef}
            value={scanTexto}
            onChange={(e) => setScanTexto(e.target.value)}
            placeholder="Dispara la pistola aqui o escribe el codigo y presiona Enter"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={buscando || !scanTexto.trim()}>
            {buscando ? 'Buscando...' : '+ Agregar'}
          </button>
        </form>
        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem', color: '#888' }}>
          Identifica el producto automaticamente y lo agrega al documento. El foco vuelve aqui
          despues de cada uno para seguir escaneando sin usar el mouse.
        </p>
        {errorScan && <p style={{ color: 'red', fontSize: '0.85rem' }}>{errorScan}</p>}

        <div style={{ marginTop: '0.6rem' }}>
          <button type="button" onClick={() => setMostrarRango((v) => !v)} style={{ fontSize: '0.8rem' }}>
            {mostrarRango ? 'Ocultar' : 'Agregar por rango (caja completa de SIM/USIM)'}
          </button>
          {mostrarRango && (
            <form onSubmit={handleAgregarRango} style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {[{ key: 'simcard', label: 'SIM Card' }, { key: 'usim', label: 'USIM' }].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTipoRango(t.key)}
                    style={{
                      padding: '0.3rem 0.7rem', fontSize: '0.8rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      backgroundColor: tipoRango === t.key ? '#0b4f9e' : '#e2e8f0', color: tipoRango === t.key ? '#fff' : '#111'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: '0.8rem' }}>Producto</label>
              <select value={productoRangoId} onChange={(e) => setProductoRangoId(e.target.value)} style={{ display: 'block', marginBottom: '0.5rem' }}>
                <option value="">-- Selecciona --</option>
                {productosRango.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} (disponibles: {p.stock_disponible})</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: '0.8rem' }}>Primer codigo</label><br />
                  <input value={codigoInicio} onChange={(e) => setCodigoInicio(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem' }}>Ultimo codigo</label><br />
                  <input value={codigoFin} onChange={(e) => setCodigoFin(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem' }}>Cantidad de items *</label><br />
                  <input type="number" min="1" value={cantidadRango} onChange={(e) => setCantidadRango(e.target.value)} style={{ width: '140px' }} />
                </div>
                <button type="submit" disabled={procesandoRango}>
                  {procesandoRango ? 'Procesando...' : 'Agregar rango al documento'}
                </button>
              </div>
              {errorRango && <p style={{ color: errorRango.startsWith('Se agregaron') ? 'green' : 'red', fontSize: '0.85rem' }}>{errorRango}</p>}
            </form>
          )}
        </div>
      </div>

      <div className="form-box" style={{ maxWidth: '600px' }}>
        <h3>Agregar accesorio por cantidad</h3>
        <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 0.5rem 0' }}>
          Para accesorios sin codigo de barras a mano: elige el producto y la cantidad.
        </p>
        <form onSubmit={handleAgregarAccesorio} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Producto</label><br />
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">-- Selecciona --</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} (disponible: {p.stock_disponible})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem' }}>Cantidad *</label><br />
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: '110px' }} />
          </div>
          <button type="submit">+ Agregar accesorio</button>
        </form>
        {errorAccesorio && <p style={{ color: 'red', fontSize: '0.85rem' }}>{errorAccesorio}</p>}
      </div>
    </>
  );
}
