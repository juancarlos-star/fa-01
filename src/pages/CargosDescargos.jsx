import React, { useState, useEffect, useCallback, useRef } from 'react';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
import BuscadorProductoInput from '../components/BuscadorProductoInput.jsx';
import CodigosNuevosModal from '../components/CodigosNuevosModal.jsx';
import CodigosExistentesModal from '../components/CodigosExistentesModal.jsx';
import { generarCargoDescargoDocumentoPDF } from '../utils/generarCargoDescargoPDF.js';
import { fmt } from '../utils/format.js';

let contadorKeyItem = 0;
function nuevaKeyItem() {
  contadorKeyItem += 1;
  return `item-${Date.now()}-${contadorKeyItem}`;
}

// Pantalla de Cargo (agregar stock) y Descargo (dar de baja stock), con el MISMO diseno de tres
// columnas + tabla de captura que "Compras Telf/Acces", ya que ambas son formas de meter/sacar
// mercancia del inventario. A diferencia de Compras:
//   - No hay Proveedor ni Documento de compra (no aplica: esto no es una compra a un tercero,
//     es un ajuste interno de inventario -su trazabilidad es Usuario + Deposito + Motivo, no
//     factura de proveedor).
//   - No hay IVA (nunca alimenta los reportes de Impuestos, que solo miran Ventas y Compras).
//   - El campo de busqueda de producto NO se limita a ninguna categoria: se puede cargar o
//     descargar cualquier producto (Telefono, SIM, USIM, Accesorio, o cualquier categoria nueva
//     que se cree), y tambien se puede crear un producto nuevo de cualquier categoria sin salir
//     de esta pantalla.
//   - "Vendedor" siempre es el usuario que tiene la sesion abierta (igual que en Compras).
//   - El tipo de documento (Cargo o Descargo) ya NO se elige con un boton dentro de esta misma
//     pantalla: se elige desde el submenu del menu lateral ("Cargos y Descargos" > Cargo /
//     Descargo), y llega fijo en la prop "tipoInicial". Cada uno tiene su propio numero de
//     documento consecutivo (cargosDescargos:proximoNumero / crearDocumento ya calculan el
//     consecutivo POR SEPARADO para 'cargo' y para 'descargo', igual que hace Compras con su
//     propio consecutivo independiente).
//   - El historial y los reportes de Cargo/Descargo ya no viven aqui: se consultan desde
//     Reportes > Inventario > "Historial de Cargos" / "Historial de Descargos".
export default function CargosDescargos({ currentUser, tipoInicial }) {
  const tipoDocumento = tipoInicial === 'descargo' ? 'descargo' : 'cargo';
  const esCargo = tipoDocumento === 'cargo';

  const [itemsDocumento, setItemsDocumento] = useState([]);
  const [motivoDocumento, setMotivoDocumento] = useState('');
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { encabezadoId, numeroDocumento, registros, tipoDocumento }
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null); // una linea del documento ya emitido
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Deposito de esta operacion: TODO el documento aplica a un solo deposito, igual que en
  // Facturacion y Compras. Cambiarlo a mitad de documento vacia lo que ya se habia agregado.
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  // Numero de documento que se le asignaria a esta operacion si se registrara ahora mismo (solo
  // de vista previa, en el panel derecho -igual que "Compra N° ......" en Compras). El numero
  // definitivo se recalcula dentro de la transaccion en el backend, por si dos personas registran
  // al mismo tiempo.
  const [proximoNumero, setProximoNumero] = useState(null);
  const cargarProximoNumero = useCallback(() => {
    window.api.proximoNumeroCargoDescargo(tipoDocumento).then((res) => setProximoNumero(res.proximoNumero));
  }, [tipoDocumento]);
  useEffect(() => { cargarProximoNumero(); }, [cargarProximoNumero]);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  // Catalogo de productos para el buscador de la fila de captura: TODOS, sin filtrar por
  // categoria (a diferencia de Compras Telf/Acces, que solo trae equipo/accesorio). Se recarga
  // cuando cambia el deposito, para que "stock_disponible" refleje el deposito correcto.
  const [productos, setProductos] = useState([]);
  const cargarProductos = useCallback(() => {
    window.api.listProducts(undefined, undefined, depositoId ? Number(depositoId) : undefined).then(setProductos);
  }, [depositoId]);
  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  const hayItems = itemsDocumento.length > 0;

  const cambiarDeposito = (nuevoId) => {
    if (hayItems && !window.confirm('Cambiar de deposito vacia los articulos que ya agregaste a este documento (pertenecen al deposito anterior). ¿Deseas continuar?')) {
      return;
    }
    setDepositoId(nuevoId);
    setItemsDocumento([]);
    setError('');
  };

  const quitarItem = (key) => {
    setItemsDocumento((prev) => prev.filter((it) => it.key !== key));
  };

  // Agrega una o varias lineas ya armadas por la fila de captura (una sola linea para
  // accesorios; varias -una por codigo/IMEI- para equipo/simcard/usim).
  const agregarItems = (nuevos) => {
    setError('');
    setItemsDocumento((prev) => [...prev, ...nuevos.map((it) => ({ key: nuevaKeyItem(), ...it }))]);
  };

  const totalDocumentoUsd = esCargo
    ? itemsDocumento.reduce((acc, it) => acc + (parseFloat(it.costoUnitario) || 0) * (it.cantidad || 1), 0)
    : 0;
  const totalPiezas = itemsDocumento.reduce((acc, it) => acc + (parseInt(it.cantidad, 10) || 1), 0);

  const handleRegistrarDocumento = async () => {
    setError('');
    if (itemsDocumento.length === 0) {
      setError('Agrega al menos un articulo al documento antes de registrarlo');
      return;
    }
    if (!esCargo && !motivoDocumento.trim()) {
      setError('Indica el motivo del descargo (aplica a todo el documento)');
      return;
    }
    if (!depositoId) {
      setError('Selecciona el deposito de esta operacion');
      return;
    }
    setEnviando(true);
    try {
      const payload = {
        tipoDocumento,
        motivo: motivoDocumento.trim(),
        usuario: currentUser?.username,
        depositoId: Number(depositoId),
        // Cada linea del documento en pantalla puede representar VARIAS unidades (equipo/
        // simcard/usim agrupados por el mismo codigo corto de producto, igual que en Compras);
        // aqui se "aplanan" a un renglon por unidad, que es lo que espera el backend.
        items: itemsDocumento.flatMap((it) => {
          if (it.esAccesorio) {
            return [{
              productId: it.productId,
              esAccesorio: true,
              cantidad: it.cantidad,
              costoUnitario: esCargo ? it.costoUnitario : undefined
            }];
          }
          return (it.codigos || []).map((cod) => ({
            productId: it.productId,
            esAccesorio: false,
            codigo: esCargo ? cod.codigo : undefined,
            unitId: !esCargo ? cod.unitId : undefined,
            costoUnitario: esCargo ? it.costoUnitario : undefined
          }));
        })
      };
      const res = await window.api.crearDocumentoCargoDescargo(payload);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setItemsDocumento([]);
      setMotivoDocumento('');
      cargarProductos();
      cargarProximoNumero();
      // El comprobante consolidado se genera e imprime automaticamente, ANTES de mostrar la
      // pantalla de "Documento registrado" -por la misma razon que en Facturacion/Compras: si se
      // mostrara antes, el usuario podria alcanzar a pedir el PDF el mismo, duplicandolo.
      try {
        await generarCargoDescargoDocumentoPDF(res.encabezadoId, res.registros, tipoDocumento, settings, { imprimir: true, numeroDocumento: res.numeroDocumento });
      } catch (errImpresion) {
        console.error('Error al imprimir el documento automaticamente:', errImpresion);
      }
      setConfirmacion({ encabezadoId: res.encabezadoId, numeroDocumento: res.numeroDocumento, registros: res.registros, tipoDocumento });
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10' && !e.repeat && !confirmacion) {
        e.preventDefault();
        handleRegistrarDocumento();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
    const esCargoConfirmado = confirmacion.tipoDocumento === 'cargo';
    const prefijoDoc = esCargoConfirmado ? 'Cargo' : 'Descargo';
    const totalConfirmacion = confirmacion.registros.reduce((acc, r) => acc + (r.total_usd || 0), 0);
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <div className="check">✓</div>
          <h1>{prefijoDoc} registrado</h1>
        </div>
        <div className="pos-receipt-body">
          <div className="pos-receipt-row">
            <span>N° de documento</span>
            <strong>{prefijoDoc} N° {String(confirmacion.numeroDocumento ?? confirmacion.encabezadoId).padStart(6, '0')}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Artículos incluidos</span>
            <strong>{confirmacion.registros.length}</strong>
          </div>
          {esCargoConfirmado && (
            <div className="pos-receipt-row">
              <span>Total del documento</span>
              <strong>${fmt(totalConfirmacion)}</strong>
            </div>
          )}
          <ul style={{ listStyle: 'none', padding: 0, maxHeight: '220px', overflowY: 'auto', margin: '10px 0 0' }}>
            {confirmacion.registros.map((r) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
                <span>{r.producto_nombre} {r.unidad_codigo ? `— ${r.unidad_codigo}` : `(x${r.cantidad})`}</span>
                <button type="button" className="pos-btn-link" onClick={() => setComprobanteAbierto(r)}>Ver</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="pos-receipt-actions">
          <button
            className="btn-ghost"
            disabled={generandoPDF}
            onClick={async () => {
              setGenerandoPDF(true);
              try {
                await generarCargoDescargoDocumentoPDF(confirmacion.encabezadoId, confirmacion.registros, confirmacion.tipoDocumento, settings, { numeroDocumento: confirmacion.numeroDocumento });
              } finally {
                setGenerandoPDF(false);
              }
            }}
          >
            {generandoPDF ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button className="btn-primary" onClick={nuevoDocumento}>Hacer otro documento</button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#98a2b3', marginTop: '10px' }}>
          El historial completo de {prefijoDoc.toLowerCase()}s se consulta en Reportes → Inventario.
        </p>
      </div>
    );
  }

  const numeroPreview = proximoNumero != null ? String(proximoNumero).padStart(6, '0') : '------';
  const depositoActivo = depositos.find((d) => String(d.id) === String(depositoId));

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE INVENTARIO</span>
        <span className="pos-topbar-center">{esCargo ? 'CARGO' : 'DESCARGO'} DE INVENTARIO</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
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
            <label>Vendedor <span className="required-mark">*</span></label>
            <input value={currentUser?.username || ''} disabled />
          </div>

          {!esCargo && (
            <div className="pos-field">
              <label>Motivo del descargo <span className="required-mark">*</span></label>
              <textarea
                value={motivoDocumento}
                onChange={(e) => setMotivoDocumento(e.target.value)}
                rows={3}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Ej: dañado, perdido, robado, ajuste de inventario"
              />
            </div>
          )}
        </div>

        <div className="pos-mid">
          {depositoActivo ? (
            <div className="pos-stripe">{depositoActivo.nombre}</div>
          ) : (
            <div className="pos-stripe placeholder">Elige el depósito de la operación</div>
          )}
          <div className="pos-stripe">
            {esCargo ? 'Cargo: se agrega stock nuevo al inventario' : 'Descargo: se da de baja stock existente'}
          </div>
        </div>

        <div className="pos-right">
          <div className="pos-right-header">{esCargo ? 'Cargo' : 'Descargo'} N° {numeroPreview}</div>
          {esCargo && (
            <div className="pos-right-row total-final">
              <span>Total</span>
              <span>${fmt(totalDocumentoUsd)}</span>
            </div>
          )}
          <div className="pos-right-footer">
            <span>Total cantidad de Items</span>
            <span>{totalPiezas}</span>
          </div>
        </div>
      </div>

      {error && <div className="pos-error-banner">{error}</div>}

      <TablaCargoDescargo
        tipoDocumento={tipoDocumento}
        productos={productos}
        depositoId={depositoId}
        itemsDocumento={itemsDocumento}
        onAgregar={agregarItems}
        onQuitar={quitarItem}
        onProductoCreado={(p) => setProductos((prev) => [...prev, p])}
      />

      <div className="pos-footer-actions">
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarDocumento} disabled={enviando || !hayItems}>
          {enviando ? 'Registrando...' : `F10 Registrar documento (${itemsDocumento.length})`}
        </button>
      </div>
    </div>
  );
}

// ---------------- Tabla de captura + documento en borrador (misma estructura que Compras Telf/Acces) ----------------

function TablaCargoDescargo({ tipoDocumento, productos, depositoId, itemsDocumento, onAgregar, onQuitar, onProductoCreado }) {
  const esCargo = tipoDocumento === 'cargo';

  const [filaCodigo, setFilaCodigo] = useState('');
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [filaProducto, setFilaProducto] = useState(null);
  const [filaCosto, setFilaCosto] = useState('');
  const [filaCantidad, setFilaCantidad] = useState(1);
  const [errorFila, setErrorFila] = useState('');
  const [mostrarModalProductoNuevo, setMostrarModalProductoNuevo] = useState(false);
  const [mostrarModalCodigos, setMostrarModalCodigos] = useState(false);

  const codigoRef = useRef(null);
  const cantidadRef = useRef(null);

  const limpiarFila = () => {
    setFilaCodigo('');
    setFilaProducto(null);
    setFilaCosto('');
    setFilaCantidad(1);
    setErrorFila('');
    setMostrarModalCodigos(false);
  };

  const prefillCosto = (p) => String(p.costo_promedio_usd != null ? Number(p.costo_promedio_usd) : 0);

  const seleccionarProductoEnFila = (p) => {
    setFilaProducto(p);
    setFilaCosto(prefillCosto(p));
    setFilaCantidad(1);
    setTimeout(() => { cantidadRef.current?.focus(); cantidadRef.current?.select(); }, 0);
  };

  // Igual que en Compras Telf/Acces: se busca por codigo/IMEI/nombre entre TODOS los productos
  // (sin restringir por categoria -esa es la diferencia principal con Compras Telf/Acces, que
  // solo admite equipo/accesorio).
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
        setErrorFila(`"${texto}" corresponde a un codigo/IMEI individual ya registrado, no a un producto. Escribe el codigo o nombre del producto.`);
        return;
      }
      seleccionarProductoEnFila(p);
    } finally {
      setBuscandoCodigo(false);
    }
  };

  const handleProductoNuevoCreado = (producto) => {
    setMostrarModalProductoNuevo(false);
    onProductoCreado(producto);
    seleccionarProductoEnFila(producto);
  };

  const costoUsdFila = () => (filaProducto ? (parseFloat(filaCosto) || 0) : 0);
  const totalFila = () => costoUsdFila() * (parseInt(filaCantidad, 10) || 0);

  // Unidades (equipo/simcard/usim) ya elegidas en ESTE documento para el producto de la fila
  // actual -se usa para no ofrecer dos veces la misma unidad en el Descargo, y para no repetir
  // el mismo codigo nuevo dos veces en el Cargo.
  const unitIdsYaEnDocumento = () => itemsDocumento
    .filter((it) => !it.esAccesorio && filaProducto && it.productId === filaProducto.id)
    .flatMap((it) => (it.codigos || []).map((c) => c.unitId))
    .filter(Boolean);

  const confirmarFila = () => {
    setErrorFila('');
    const cant = parseInt(filaCantidad, 10);
    if (!cant || cant <= 0) { setErrorFila('Cantidad invalida'); return; }
    if (esCargo) {
      const costo = parseFloat(filaCosto);
      if (isNaN(costo) || costo < 0) { setErrorFila('Costo invalido'); return; }
    }

    if (filaProducto.tipo === 'accesorio') {
      if (!esCargo && cant > filaProducto.stock_disponible) {
        setErrorFila(`Solo hay ${filaProducto.stock_disponible} disponible(s) de "${filaProducto.nombre}" en este deposito`);
        return;
      }
      onAgregar([{
        productId: filaProducto.id,
        tipo: 'accesorio',
        esAccesorio: true,
        descripcion: filaProducto.nombre,
        producto_codigo: filaProducto.codigo_producto || null,
        costoUnitario: esCargo ? costoUsdFila() : undefined,
        cantidad: cant
      }]);
      limpiarFila();
      setTimeout(() => codigoRef.current?.focus(), 0);
    } else {
      // Equipo / SIM / USIM (o cualquier otra categoria que lleve codigo/IMEI individual):
      // se abre la ventana para elegir/ingresar los N codigos exactos -codigos NUEVOS si es un
      // Cargo (misma ventana que usa Compras), o codigos YA EXISTENTES en el deposito si es un
      // Descargo.
      setMostrarModalCodigos(true);
    }
  };

  const confirmarCodigosNuevos = (codigosNuevos) => {
    onAgregar([{
      productId: filaProducto.id,
      tipo: filaProducto.tipo,
      esAccesorio: false,
      descripcion: filaProducto.nombre,
      producto_codigo: filaProducto.codigo_producto || null,
      costoUnitario: costoUsdFila(),
      cantidad: codigosNuevos.length,
      codigos: codigosNuevos.map((cod) => ({ codigo: cod }))
    }]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const confirmarCodigosExistentes = (seleccionados) => {
    onAgregar([{
      productId: filaProducto.id,
      tipo: filaProducto.tipo,
      esAccesorio: false,
      descripcion: filaProducto.nombre,
      producto_codigo: filaProducto.codigo_producto || null,
      cantidad: seleccionados.length,
      codigos: seleccionados
    }]);
    limpiarFila();
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const [keyPendienteQuitar, setKeyPendienteQuitar] = useState(null);

  return (
    <>
      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '13%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '8%' }}>Cantidad</th>
              <th style={{ width: '6%' }}>Und</th>
              {esCargo && <th style={{ width: '11%', textAlign: 'right' }}>Costo Und ($)</th>}
              {esCargo && <th style={{ width: '11%', textAlign: 'right' }}>Total ($)</th>}
              <th style={{ width: '17%' }}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="fila-entrada">
              <td>
                {!filaProducto ? (
                  <BuscadorProductoInput
                    inputRef={codigoRef}
                    placeholder="Código o nombre + Enter"
                    value={filaCodigo}
                    onChangeValue={setFilaCodigo}
                    productos={productos}
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
                ) : <span></span>}
              </td>
              <td>{filaProducto ? 'UND' : ''}</td>
              {esCargo && (
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
              )}
              {esCargo && <td className="text-right">{filaProducto ? `$${fmt(totalFila())}` : ''}</td>}
              <td>
                <div className="pos-entrada-acciones">
                  {filaProducto && (
                    <button type="button" className="pos-agregar-btn" onClick={confirmarFila}>
                      {filaProducto.tipo === 'accesorio' ? 'Agregar' : 'Elegir códigos'}
                    </button>
                  )}
                  {filaProducto && (
                    <button type="button" className="pos-remove-btn" onClick={() => { limpiarFila(); setTimeout(() => codigoRef.current?.focus(), 0); }}>×</button>
                  )}
                  {!filaProducto && (
                    <button type="button" onClick={() => setMostrarModalProductoNuevo(true)} style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      + Crear producto
                    </button>
                  )}
                </div>
              </td>
            </tr>

            {itemsDocumento.length === 0 ? (
              <tr>
                <td colSpan={esCargo ? 7 : 5} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Aun no has agregado productos.
                </td>
              </tr>
            ) : (
              itemsDocumento.map((item) => (
                <tr key={item.key}>
                  <td>{item.producto_codigo || '—'}</td>
                  <td>
                    <div>{item.descripcion}</div>
                    {item.codigos && item.codigos.length > 0 && (
                      <div style={codigosListStyle}>
                        {item.codigos.map((cod) => (
                          <div key={cod.codigo} style={codigoLineStyle}>{cod.codigo}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>UND</td>
                  {esCargo && <td className="text-right">${fmt(item.costoUnitario)}</td>}
                  {esCargo && <td className="text-right">${fmt((item.costoUnitario || 0) * item.cantidad)}</td>}
                  <td>
                    {keyPendienteQuitar === item.key ? (
                      <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                        <button type="button" className="pos-confirm-btn yes" onClick={() => { onQuitar(item.key); setKeyPendienteQuitar(null); }}>Si</button>
                        <button type="button" className="pos-confirm-btn no" onClick={() => setKeyPendienteQuitar(null)}>No</button>
                      </span>
                    ) : (
                      <button type="button" className="pos-remove-btn" onClick={() => setKeyPendienteQuitar(item.key)}>×</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {errorFila && <div className="pos-error-banner">{errorFila}</div>}

      {mostrarModalProductoNuevo && (
        <ProductoRapidoModal
          codigoInicial={filaCodigo}
          tiposPermitidos={['equipo', 'simcard', 'usim', 'accesorio']}
          onConfirm={handleProductoNuevoCreado}
          onCancel={() => setMostrarModalProductoNuevo(false)}
        />
      )}

      {mostrarModalCodigos && filaProducto && esCargo && (
        <CodigosNuevosModal
          nombreProducto={filaProducto.nombre}
          tipo={filaProducto.tipo}
          cantidadNecesaria={parseInt(filaCantidad, 10) || 1}
          onConfirm={confirmarCodigosNuevos}
          onCancel={() => setMostrarModalCodigos(false)}
        />
      )}

      {mostrarModalCodigos && filaProducto && !esCargo && (
        <CodigosExistentesModal
          nombreProducto={filaProducto.nombre}
          tipo={filaProducto.tipo}
          productId={filaProducto.id}
          depositoId={depositoId}
          itemsYaEnDocumento={unitIdsYaEnDocumento()}
          cantidadNecesaria={parseInt(filaCantidad, 10) || 1}
          onConfirm={confirmarCodigosExistentes}
          onCancel={() => setMostrarModalCodigos(false)}
        />
      )}
    </>
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
