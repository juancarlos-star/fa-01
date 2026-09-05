import React, { useState, useEffect, useCallback, useRef } from 'react';
import CargoDescargoDetalle from '../components/CargoDescargoDetalle.jsx';
import ProductoRapidoModal from '../components/ProductoRapidoModal.jsx';
import BuscadorProductoInput from '../components/BuscadorProductoInput.jsx';
import { generarCargoDescargoDocumentoPDF } from '../utils/generarCargoDescargoPDF.js';
import { fmt } from '../utils/format.js';

const TIPOS = [
  { key: 'equipo', label: 'Teléfonos (IMEI)' },
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
  // 'nuevo' | 'historial' -- igual que en Traslados, esta pantalla tiene dos vistas: armar un
  // documento nuevo, o consultar el historial de documentos ya registrados.
  const [vista, setVista] = useState('nuevo');

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

  // Deposito de esta operacion: TODO el documento (cargo o descargo) aplica a un solo
  // deposito. Se elige aqui arriba, antes de agregar articulos, e igual que en Facturacion y
  // Compras, cambiarlo a mitad de documento vacia lo que ya se habia agregado (pertenece al
  // deposito anterior).
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState('');

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  useEffect(() => {
    window.api.listDepositos(true).then((data) => {
      setDepositos(data);
      if (data.length > 0) setDepositoId(String(data[0].id));
    });
  }, []);

  const hayItems = itemsDocumento.length > 0;

  const cambiarDeposito = (nuevoId) => {
    if (hayItems && !window.confirm('Cambiar de deposito vacia los articulos que ya agregaste a este documento (pertenecen al deposito anterior). ¿Deseas continuar?')) {
      return;
    }
    setDepositoId(nuevoId);
    setItemsDocumento([]);
    setError('');
  };

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
      setItemsDocumento([]);
      setMotivoDocumento('');
      // El comprobante consolidado (con todos los articulos del documento, aunque sean de
      // productos distintos) se genera e imprime automaticamente, sin que el usuario tenga
      // que pedirlo aparte. Esto se hace ANTES de mostrar la pantalla de "Documento
      // registrado" (setConfirmacion) a proposito: esa pantalla tiene el boton "Descargar PDF
      // del documento" habilitado de inmediato, y si se mostrara antes de que termine esta
      // impresion automatica, el usuario podia alcanzar a presionar ese boton pensando que no
      // se habia generado, creando el PDF DOS VECES para el mismo documento (con el mismo
      // problema de archivos duplicados " (1)" y visor de PDF confundido que se corrigio en
      // Facturacion).
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
      if (e.key === 'F10' && !e.repeat && vista === 'nuevo' && !confirmacion) {
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
    const esCargo = confirmacion.tipoDocumento === 'cargo';
    const prefijoDoc = esCargo ? 'Cargo' : 'Descargo';
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
          {esCargo && (
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
          <button className="btn-ghost" onClick={() => setVista('historial')}>Ver historial</button>
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
      </div>
    );
  }

  if (vista === 'historial') {
    return <HistorialCargosDescargos onVolver={() => setVista('nuevo')} settings={settings} />;
  }

  const esCargoActivo = tipoDocumento === 'cargo';

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE INVENTARIO</span>
        <span className="pos-topbar-center">{esCargoActivo ? 'CARGO' : 'DESCARGO'} DE INVENTARIO</span>
        <button
          type="button"
          onClick={() => setVista('historial')}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Ver historial
        </button>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Depósito de esta operación <span className="required-mark">*</span></label>
            <select value={depositoId} onChange={(e) => cambiarDeposito(e.target.value)}>
              {depositos.length === 0 && <option value="">-- No hay depositos --</option>}
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.codigo} - {d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="pos-field">
            <label>Tipo de documento</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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

          <div className="pos-field">
            <label>Usuario</label>
            <input value={currentUser?.username || ''} disabled />
          </div>

          {tipoDocumento === 'descargo' && (
            <div className="pos-field">
              <label>Motivo del descargo <span className="required-mark">*</span></label>
              <textarea
                value={motivoDocumento}
                onChange={(e) => setMotivoDocumento(e.target.value)}
                rows={2}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Ej: dañado, perdido, robado, ajuste de inventario"
              />
            </div>
          )}
        </div>

        <div className="pos-mid">
          {depositoId ? (
            <div className="pos-stripe">
              Depósito: {depositos.find((d) => String(d.id) === String(depositoId))?.nombre || '—'}
            </div>
          ) : (
            <div className="pos-stripe placeholder">Elige el depósito de la operación</div>
          )}
          <div className="pos-stripe">
            {esCargoActivo ? 'Cargo: se agrega stock nuevo al inventario' : 'Descargo: se da de baja stock existente'}
          </div>
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Documento</div>
          <div className="pos-right-row total-final">
            <span>Artículos</span>
            <span>{itemsDocumento.length}</span>
          </div>
          {esCargoActivo && (
            <div className="pos-right-footer">
              <span>Total del documento</span>
              <span>${fmt(totalDocumentoUsd)}</span>
            </div>
          )}
        </div>
      </div>

      {error && <div className="pos-error-banner">{error}</div>}

      {tipoDocumento === 'cargo' ? (
        <AgregarItemsCargo onAgregar={agregarItem} itemsDocumento={itemsDocumento} depositoId={depositoId} />
      ) : (
        <AgregarItemsDescargo onAgregar={agregarItem} itemsDocumento={itemsDocumento} depositoId={depositoId} />
      )}

      <DocumentoDraft
        tipoDocumento={tipoDocumento}
        items={itemsDocumento}
        onQuitar={quitarItem}
        totalUsd={totalDocumentoUsd}
      />

      <div className="pos-footer-actions">
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarDocumento} disabled={enviando || !hayItems}>
          {enviando ? 'Registrando...' : `F10 Registrar documento (${itemsDocumento.length})`}
        </button>
      </div>
    </div>
  );
}

// ---------------- Tabla del documento en borrador ----------------

function DocumentoDraft({ tipoDocumento, items, onQuitar, totalUsd }) {
  const esCargo = tipoDocumento === 'cargo';
  return (
    <div className="pos-table-wrap" style={{ marginTop: '1rem', maxHeight: 'none' }}>
      <table className="pos-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th style={{ width: '14%' }}>Tipo</th>
            <th style={{ width: '22%' }}>Código / Cantidad</th>
            {esCargo && <th style={{ width: '12%' }}>Costo unit.</th>}
            {esCargo && <th style={{ width: '12%' }}>Subtotal</th>}
            <th style={{ width: '48px' }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={esCargo ? 6 : 4} style={{ textAlign: 'center', color: '#98a2b3', padding: '1.2rem' }}>
                Todavía no has agregado ningún artículo a este documento.
              </td>
            </tr>
          ) : (
            items.map((it) => {
              const cantidad = it.esAccesorio ? (parseInt(it.cantidad, 10) || 0) : 1;
              const costo = parseFloat(it.costoUnitario) || 0;
              return (
                <tr key={it.key}>
                  <td>{it.productoNombre}</td>
                  <td>{it.tipo}</td>
                  <td>{it.esAccesorio ? `x${it.cantidad}` : it.codigo}</td>
                  {esCargo && <td>${costo.toFixed(2)}</td>}
                  {esCargo && <td>${(costo * cantidad).toFixed(2)}</td>}
                  <td><button type="button" className="pos-remove-btn" onClick={() => onQuitar(it.key)}>×</button></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {esCargo && items.length > 0 && (
        <p style={{ textAlign: 'right', fontWeight: 'bold', padding: '0.6rem 1rem' }}>
          Total del documento: ${totalUsd.toFixed(2)}
        </p>
      )}
    </div>
  );
}

// ---------------- Agregar items: CARGO (equipo/simcard/usim/accesorio) ----------------

function AgregarItemsCargo({ onAgregar, itemsDocumento, depositoId }) {
  const [tipoActivo, setTipoActivo] = useState('equipo');
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
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

  // Igual que en Compras: si el producto que se quiere cargar todavia no existe en el sistema,
  // se puede crear "al vuelo" sin salir de esta pantalla, con la misma ventana (ProductoRapidoModal).
  // A diferencia de Compras (que si limita a categorias propias de ese modulo), aqui se deja
  // elegir CUALQUIER categoria -Telefono (IMEI), SIM, USIM, Accesorios, o cualquier otra que se
  // cree despues- sin importar la pestana activa en este momento.
  const [mostrarModalProductoNuevo, setMostrarModalProductoNuevo] = useState(false);

  const codigoInputRef = useRef(null);
  const esAccesorio = tipoActivo === 'accesorio';
  const permiteRango = tipoActivo === 'simcard' || tipoActivo === 'usim';
  const producto = productos.find((p) => p.id === Number(productoId));

  // Cuando se crea un producto de OTRA categoria a la de la pestana activa (ver
  // handleProductoNuevoCreado mas abajo), se cambia de pestana y eso dispara este mismo
  // cargarProductos por el efecto de abajo (ligado a tipoActivo) -que por defecto siempre limpia
  // la seleccion (setProductoId(''))-. Este ref le avisa "la proxima carga debe dejar
  // seleccionado este producto en vez de limpiar", para no competir entre dos cargas a la vez.
  const productoIdAConservarRef = useRef(null);

  const cargarProductos = useCallback(async () => {
    const data = await window.api.listProducts(tipoActivo, undefined, depositoId ? Number(depositoId) : undefined);
    setProductos(data);
    if (productoIdAConservarRef.current) {
      setProductoId(String(productoIdAConservarRef.current));
      productoIdAConservarRef.current = null;
    } else {
      setProductoId('');
    }
    setBusquedaProducto('');
  }, [tipoActivo, depositoId]);

  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  const seleccionarTab = (key) => {
    setTipoActivo(key);
    setErrorLocal('');
    setMostrarRango(false);
  };

  const handleProductoNuevoCreado = (productoCreado) => {
    setMostrarModalProductoNuevo(false);
    setBusquedaProducto('');
    productoIdAConservarRef.current = productoCreado.id;
    if (productoCreado.tipo !== tipoActivo) {
      // Cambia de pestana al tipo del producto recien creado (ej. se creo un Accesorio estando
      // en la pestana de Telefonos); el cambio de tipoActivo dispara el efecto de arriba, que
      // recarga la lista de ESE tipo y deja seleccionado el producto gracias al ref de arriba.
      setTipoActivo(productoCreado.tipo);
    } else {
      cargarProductos();
    }
  };

  // Enter en el buscador de producto SIN ninguna sugerencia resaltada en el desplegable: busca
  // una coincidencia EXACTA (nombre o codigo) dentro de la lista ya cargada de este tipo; si no
  // hay ninguna, abre "Crear producto nuevo" con lo que se escribio precargado.
  const buscarProductoPorNombreEnter = () => {
    setErrorLocal('');
    const texto = busquedaProducto.trim().toLowerCase();
    if (!texto) return;
    const encontrado = productos.find(
      (p) => p.nombre.toLowerCase() === texto || (p.codigo_producto || '').toLowerCase() === texto
    );
    if (encontrado) {
      setProductoId(String(encontrado.id));
      setBusquedaProducto('');
    } else {
      setMostrarModalProductoNuevo(true);
    }
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
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {producto ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', padding: '0.4rem 0.6rem', border: '1px solid #d0d5dd', borderRadius: '4px', background: '#f9fafb'
          }}>
            <span>{producto.nombre} <span style={{ color: '#667085', fontSize: '0.85rem' }}>(stock: {producto.stock_disponible})</span></span>
            <button type="button" onClick={() => setProductoId('')} style={{ fontSize: '0.78rem', padding: '2px 8px', border: '1px solid #d0d5dd', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>
              Cambiar
            </button>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <BuscadorProductoInput
              placeholder="Nombre o código del producto + Enter"
              value={busquedaProducto}
              onChangeValue={setBusquedaProducto}
              productos={productos}
              onSeleccionar={(p) => { setProductoId(String(p.id)); setBusquedaProducto(''); }}
              onEnterSinSeleccion={buscarProductoPorNombreEnter}
            />
          </div>
        )}
        <button type="button" onClick={() => setMostrarModalProductoNuevo(true)} style={{ whiteSpace: 'nowrap' }}>
          + Crear producto nuevo
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#667085', margin: '0.3rem 0 0' }}>
        ¿El producto que vas a cargar todavía no existe? Créalo aquí mismo, sin salir de esta pantalla.
      </p>

      {mostrarModalProductoNuevo && (
        <ProductoRapidoModal
          codigoInicial={busquedaProducto}
          tiposPermitidos={['equipo', 'simcard', 'usim', 'accesorio']}
          onConfirm={handleProductoNuevoCreado}
          onCancel={() => setMostrarModalProductoNuevo(false)}
        />
      )}

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

function AgregarItemsDescargo({ onAgregar, itemsDocumento, depositoId }) {
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
    const data = await window.api.listProducts('accesorio', undefined, depositoId ? Number(depositoId) : undefined);
    setProductos(data);
    setProductoId('');
  }, [depositoId]);
  useEffect(() => { cargarProductosAccesorio(); }, [cargarProductosAccesorio]);

  const cargarProductosRango = useCallback(async () => {
    const data = await window.api.listProducts(tipoRango, undefined, depositoId ? Number(depositoId) : undefined);
    setProductosRango(data);
    setProductoRangoId('');
  }, [tipoRango, depositoId]);
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
        if (depositoId && res.unit.deposito_id && res.unit.deposito_id !== Number(depositoId)) {
          setErrorScan(`El codigo "${res.unit.codigo}" no pertenece al deposito seleccionado`);
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
      const unidades = await window.api.listUnits(producto.id, depositoId ? Number(depositoId) : undefined);
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

// ---------------- Historial de documentos de Cargo/Descargo ----------------

function HistorialCargosDescargos({ onVolver, settings }) {
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [comprobanteAbierto, setComprobanteAbierto] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    window.api.listarCargosDescargos({ tipoDocumento: filtroTipo || undefined }).then((data) => {
      setDocumentos(data);
      setCargando(false);
    });
  }, [filtroTipo]);

  useEffect(() => { cargar(); }, [cargar]);

  const verDetalle = async (id) => {
    const res = await window.api.detalleCargoDescargo(id);
    if (res.ok) setDetalle(res);
  };

  if (comprobanteAbierto) {
    return (
      <CargoDescargoDetalle
        registro={comprobanteAbierto}
        tipoDocumento={detalle?.encabezado?.tipo_documento}
        onVolver={() => setComprobanteAbierto(null)}
      />
    );
  }

  return (
    <div>
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE INVENTARIO</span>
        <span className="pos-topbar-center">HISTORIAL DE CARGOS Y DESCARGOS</span>
        <button
          type="button"
          onClick={onVolver}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          + Nuevo documento
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #d0d5dd', borderTop: 'none', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {[{ key: '', label: 'Todos' }, { key: 'cargo', label: 'Cargos' }, { key: 'descargo', label: 'Descargos' }].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltroTipo(f.key)}
              style={{
                padding: '0.35rem 0.9rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                backgroundColor: filtroTipo === f.key ? '#0b4f9e' : '#e2e8f0', color: filtroTipo === f.key ? '#fff' : '#111'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {cargando ? (
          <p style={{ color: '#98a2b3' }}>Cargando...</p>
        ) : documentos.length === 0 ? (
          <p style={{ color: '#98a2b3' }}>Aún no se ha registrado ningún documento.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '6px 4px' }}>Tipo</th>
                <th style={{ padding: '6px 4px' }}>N°</th>
                <th style={{ padding: '6px 4px' }}>Fecha</th>
                <th style={{ padding: '6px 4px' }}>Depósito</th>
                <th style={{ padding: '6px 4px' }}>Artículos</th>
                <th style={{ padding: '6px 4px' }}>Total</th>
                <th style={{ padding: '6px 4px' }}>Usuario</th>
                <th style={{ padding: '6px 4px' }}></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => {
                const esCargo = d.tipo_documento === 'cargo';
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #eef0f3' }}>
                    <td style={{ padding: '6px 4px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600,
                        background: esCargo ? '#ecfdf3' : '#fef3f2', color: esCargo ? '#027a48' : '#b42318'
                      }}>
                        {esCargo ? 'Cargo' : 'Descargo'}
                      </span>
                    </td>
                    <td style={{ padding: '6px 4px' }}>{String(d.numero_documento ?? d.id).padStart(6, '0')}</td>
                    <td style={{ padding: '6px 4px' }}>{d.created_at}</td>
                    <td style={{ padding: '6px 4px' }}>{d.deposito_nombre}</td>
                    <td style={{ padding: '6px 4px' }}>{d.total_items}</td>
                    <td style={{ padding: '6px 4px' }}>{esCargo ? `$${fmt(d.total_usd)}` : '—'}</td>
                    <td style={{ padding: '6px 4px' }}>{d.usuario}</td>
                    <td style={{ padding: '6px 4px' }}>
                      <button type="button" onClick={() => verDetalle(d.id)}>Ver detalle</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detalle && (
        <div className="pos-vertodo-overlay" onClick={() => setDetalle(null)}>
          <div className="pos-vertodo-box" onClick={(e) => e.stopPropagation()}>
            <div className="pos-vertodo-header">
              <span>
                {detalle.encabezado.tipo_documento === 'cargo' ? 'Cargo' : 'Descargo'} N° {String(detalle.encabezado.numero_documento ?? detalle.encabezado.id).padStart(6, '0')}
              </span>
              <button type="button" className="pos-vertodo-cerrar" onClick={() => setDetalle(null)}>×</button>
            </div>
            <div className="pos-vertodo-body">
              {detalle.encabezado.motivo && (
                <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#475467' }}>
                  Motivo: {detalle.encabezado.motivo}
                </p>
              )}
              <table className="pos-vertodo-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th>Cantidad</th>
                    {detalle.encabezado.tipo_documento === 'cargo' && <th>Total</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.producto_nombre}</td>
                      <td>{it.unidad_codigo || '—'}</td>
                      <td>{it.cantidad}</td>
                      {detalle.encabezado.tipo_documento === 'cargo' && <td>${fmt(it.total_usd)}</td>}
                      <td><button type="button" onClick={() => setComprobanteAbierto(it)}>Ver comprobante</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pos-vertodo-footer">
              <button
                type="button"
                className="btn-ghost"
                disabled={generandoPDF}
                onClick={async () => {
                  setGenerandoPDF(true);
                  try {
                    await generarCargoDescargoDocumentoPDF(
                      detalle.encabezado.id,
                      detalle.items,
                      detalle.encabezado.tipo_documento,
                      settings,
                      { numeroDocumento: detalle.encabezado.numero_documento }
                    );
                  } finally {
                    setGenerandoPDF(false);
                  }
                }}
              >
                {generandoPDF ? 'Generando...' : 'Descargar PDF'}
              </button>
              <button type="button" className="btn-primary" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
