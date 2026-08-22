import React, { useState, useEffect, useRef } from 'react';
import { generarCompraFacturaPDF } from '../utils/generarCompraFacturaPDF.js';
import { fmt } from '../utils/format.js';
import SeleccionDevolucionModal from '../components/SeleccionDevolucionModal.jsx';

// Modulo de Devolucion de Compras. Misma pantalla que Compras, pero el primer renglon pide el
// "Documento de compra" en vez del proveedor: al escribirlo y presionar Enter, se trae toda la
// informacion de esa compra (proveedor, vendedor que la hizo, deposito, moneda y los productos
// con su costo) como si se fuera a dar F10 en Compras. El usuario elige cuanto devolver de cada
// producto (por defecto viene todo marcado, para una devolucion total) y el boton de abajo
// registra la devolucion: genera la contraparte negativa, descuenta el inventario y deja todo
// listo para que el Reporte de Compras avise que esa compra fue devuelta.
export default function DevolucionCompras({ currentUser }) {
  const [settings, setSettings] = useState(null);
  const [depositos, setDepositos] = useState([]);

  const [documento, setDocumento] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [compra, setCompra] = useState(null); // { encabezado, items }
  const [error, setError] = useState('');

  // Numero consecutivo de devolucion (independiente del numero de compra), se muestra como
  // vista previa antes de registrar, igual que "Compra N°" en el modulo de Compras.
  const [proximoNumeroDevolucion, setProximoNumeroDevolucion] = useState(null);

  // selecciones[product_id] = { cantidad } para accesorios, o { codigos: [...] } para
  // equipos/SIM/USIM. Se inicializa con TODO lo disponible marcado (devolucion total por
  // defecto); el usuario puede bajar la cantidad o desmarcar codigos para una devolucion parcial.
  const [selecciones, setSelecciones] = useState({});
  const [modalCodigosProductId, setModalCodigosProductId] = useState(null);

  const [confirmacion, setConfirmacion] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const documentoRef = useRef(null);
  const totalizandoRef = useRef(false);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);
  useEffect(() => { window.api.listDepositos().then(setDepositos); }, []);
  useEffect(() => { setTimeout(() => documentoRef.current?.focus(), 0); }, []);

  const cargarProximoNumeroDevolucion = () => {
    window.api.proximoNumeroDevolucion().then((res) => setProximoNumeroDevolucion(res.proximoNumero));
  };
  useEffect(() => { cargarProximoNumeroDevolucion(); }, []);

  const nombreDeposito = (depositoId) => {
    const d = depositos.find((dep) => dep.id === depositoId);
    return d ? `${d.codigo} - ${d.nombre}` : (depositoId ? `Depósito #${depositoId}` : '—');
  };

  const buscarCompra = async () => {
    setError('');
    const texto = documento.trim();
    if (!texto) return;
    setBuscando(true);
    try {
      const res = await window.api.buscarCompraPorDocumento(texto);
      if (!res.ok) {
        setError(res.message);
        setCompra(null);
        return;
      }
      setCompra(res);
      const sel = {};
      res.items.forEach((item) => {
        if (item.tipo === 'accesorio') {
          sel[item.product_id] = { cantidad: item.cantidad_disponible_devolver };
        } else {
          sel[item.product_id] = {
            codigos: item.unidades.filter((u) => u.estado === 'disponible').map((u) => u.codigo)
          };
        }
      });
      setSelecciones(sel);
    } finally {
      setBuscando(false);
    }
  };

  const cambiarCompra = () => {
    setCompra(null);
    setSelecciones({});
    setDocumento('');
    setError('');
    setTimeout(() => documentoRef.current?.focus(), 0);
  };

  const cambiarCantidadAccesorio = (item, valor) => {
    const max = item.cantidad_disponible_devolver;
    let cantidad = parseInt(valor, 10);
    if (isNaN(cantidad)) cantidad = 0;
    if (cantidad < 0) cantidad = 0;
    if (cantidad > max) cantidad = max;
    setSelecciones((prev) => ({ ...prev, [item.product_id]: { cantidad } }));
  };

  const confirmarCodigosDevolucion = (productId, codigos) => {
    setSelecciones((prev) => ({ ...prev, [productId]: { codigos } }));
    setModalCodigosProductId(null);
  };

  // Quita el producto COMPLETO de lo que se va a devolver (deja su cantidad/codigos en cero),
  // sin necesidad de ir bajando la cantidad manualmente o desmarcando codigo por codigo.
  const quitarProductoDevolucion = (item) => {
    if (item.tipo === 'accesorio') {
      setSelecciones((prev) => ({ ...prev, [item.product_id]: { cantidad: 0 } }));
    } else {
      setSelecciones((prev) => ({ ...prev, [item.product_id]: { codigos: [] } }));
    }
  };

  // Base imponible / IVA / Total se calculan SOLO sobre lo que esta actualmente seleccionado
  // para devolver (no sobre el total original de la compra).
  const itemsSeleccionados = (compra?.items || []).map((item) => {
    const sel = selecciones[item.product_id] || {};
    const cantidad = item.tipo === 'accesorio' ? (sel.cantidad || 0) : (sel.codigos || []).length;
    return { item, cantidad, totalLinea: cantidad * item.costo_unitario_usd };
  });

  const subtotal = itemsSeleccionados.reduce((acc, i) => acc + i.totalLinea, 0);
  const ivaPorcentaje = settings ? parseFloat(settings.iva_porcentaje) : 0;
  const iva = subtotal * (ivaPorcentaje / 100);
  const total = subtotal + iva;
  const totalPiezas = itemsSeleccionados.reduce((acc, i) => acc + i.cantidad, 0);

  const handleRegistrarDevolucion = async () => {
    if (totalizandoRef.current) return;
    setError('');
    if (!compra) { setError('Busca primero una compra por su documento'); return; }

    const items = itemsSeleccionados
      .filter((i) => i.cantidad > 0)
      .map((i) => {
        if (i.item.tipo === 'accesorio') {
          return { product_id: i.item.product_id, cantidad: i.cantidad };
        }
        return { product_id: i.item.product_id, codigos: selecciones[i.item.product_id].codigos };
      });

    if (items.length === 0) {
      setError('Selecciona al menos un producto para devolver');
      return;
    }

    totalizandoRef.current = true;
    setRegistrando(true);
    try {
      const res = await window.api.crearDevolucionCompra({
        compraEncabezadoId: compra.encabezado.id,
        items,
        usuario: currentUser?.full_name || currentUser?.username
      });

      if (!res.ok) { setError(res.message); return; }

      const detalle = await window.api.detalleCompraEncabezado(res.devolucionId);
      if (detalle.ok) {
        try {
          await generarCompraFacturaPDF(detalle.encabezado, detalle.items, settings, { imprimir: true });
        } catch (errImpresion) {
          console.error('Error al imprimir la devolucion automaticamente:', errImpresion);
        }
      }

      setConfirmacion({ devolucionId: res.devolucionId, numeroDevolucion: res.numeroDevolucion, totalUsd: res.totalDevueltoUsd, detalle: detalle.ok ? detalle : null });
      setCompra(null);
      setSelecciones({});
      setDocumento('');
      cargarProximoNumeroDevolucion();
    } catch (err) {
      console.error('Error al registrar la devolucion:', err);
      setError('Ocurrio un error inesperado: ' + (err?.message || String(err)));
    } finally {
      setRegistrando(false);
      totalizandoRef.current = false;
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F10' && !e.repeat) {
        e.preventDefault();
        handleRegistrarDevolucion();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleReimprimir = async () => {
    if (!confirmacion?.detalle) return;
    setImprimiendo(true);
    try {
      await generarCompraFacturaPDF(confirmacion.detalle.encabezado, confirmacion.detalle.items, settings, { imprimir: true });
    } finally {
      setImprimiendo(false);
    }
  };

  if (confirmacion) {
    return (
      <div className="pos-receipt">
        <div className="pos-receipt-header">
          <div className="check">✓</div>
          <h1>Devolución registrada</h1>
        </div>
        <div className="pos-receipt-body">
          <div className="pos-receipt-row">
            <span>N° de devolución</span>
            <strong>{String(confirmacion.numeroDevolucion ?? confirmacion.devolucionId).padStart(6, '0')}</strong>
          </div>
          <div className="pos-receipt-row">
            <span>Total devuelto (USD)</span>
            <strong>${fmt(confirmacion.totalUsd)}</strong>
          </div>
          <p className="pos-receipt-note">La devolución ya se envió a imprimir automáticamente.</p>
        </div>
        <div className="pos-receipt-actions">
          <button className="btn-ghost" onClick={handleReimprimir} disabled={imprimiendo}>
            {imprimiendo ? 'Imprimiendo...' : 'Reimprimir PDF'}
          </button>
          <button className="btn-primary" onClick={() => setConfirmacion(null)}>Hacer otra devolución</button>
        </div>
      </div>
    );
  }

  const encabezado = compra?.encabezado;
  const depositoOriginalId = compra?.items?.[0]?.deposito_id;

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE COMPRAS</span>
        <span className="pos-topbar-center">DEVOLUCIÓN DE COMPRAS</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>Documento de compra <span className="required-mark">*</span></label>
            <input
              ref={documentoRef}
              placeholder="N° de factura o nota de entrega + Enter"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCompra(); } }}
              disabled={!!compra || buscando}
            />
          </div>

          {compra && (
            <div className="pos-field">
              <label>Compra N°</label>
              <input value={String(encabezado.id).padStart(6, '0')} disabled />
            </div>
          )}

          <div className="pos-field">
            <label>Vendedor</label>
            <input value={encabezado ? (encabezado.usuario || '—') : ''} placeholder="—" disabled />
          </div>

          <div className="pos-field">
            <label>Depósito</label>
            <input value={compra ? nombreDeposito(depositoOriginalId) : ''} placeholder="—" disabled />
          </div>

          <div className="pos-field">
            <label>Moneda</label>
            <input value={encabezado ? (encabezado.moneda === 'Dolares' || encabezado.moneda === 'USD' ? 'Dólares' : 'Bs.') : ''} placeholder="—" disabled />
          </div>

          {compra && (
            <div className="pos-actions-row">
              <button type="button" className="pos-btn-link" onClick={cambiarCompra}>Cambiar documento</button>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscando ? (
            <div className="pos-stripe placeholder">Buscando compra...</div>
          ) : encabezado ? (
            <>
              <div className="pos-stripe">{encabezado.proveedor || '—'}</div>
              <div className="pos-stripe">{encabezado.proveedor_rif || '—'}</div>
              <div className="pos-stripe">{encabezado.proveedor_telefono || '—'}</div>
              <div className="pos-stripe">{encabezado.proveedor_direccion || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe el documento y presiona Enter</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
              <div className="pos-stripe placeholder">—</div>
            </>
          )}
        </div>

        <div className="pos-right">
          <div className="pos-right-header">Devolución N° {proximoNumeroDevolucion != null ? String(proximoNumeroDevolucion).padStart(6, '0') : '------'}</div>
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

      {error && <div className="pos-error-banner">{error}</div>}

      <div className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th style={{ width: '11%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '10%' }}>Comprado</th>
              <th style={{ width: '14%' }}>A devolver</th>
              <th style={{ width: '6%' }}>Und</th>
              <th style={{ width: '10%' }}>Costo</th>
              <th style={{ width: '10%' }}>Total</th>
              <th style={{ width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {!compra ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Escribe el documento de una compra y presiona Enter para ver sus productos.
                </td>
              </tr>
            ) : (
              itemsSeleccionados.map(({ item, cantidad, totalLinea }) => {
                const sinNadaQueDevolver = item.cantidad_disponible_devolver === 0;
                return (
                  <tr key={item.id} style={sinNadaQueDevolver ? { opacity: 0.55 } : undefined}>
                    <td>{item.producto_codigo || '—'}</td>
                    <td>
                      <div>{item.descripcion}</div>
                      {item.tipo !== 'accesorio' && (
                        <div style={codigosListStyle}>
                          {(selecciones[item.product_id]?.codigos || []).length === 0 ? (
                            <span style={{ color: '#98a2b3', fontSize: '0.78rem' }}>Ningún código seleccionado</span>
                          ) : (
                            selecciones[item.product_id].codigos.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((cod) => (
                              <div key={cod} style={codigoLineStyle}>{cod}</div>
                            ))
                          )}
                        </div>
                      )}
                      {sinNadaQueDevolver && (
                        <div style={{ color: '#b42318', fontSize: '0.78rem', marginTop: '4px' }}>
                          Ya no queda nada disponible para devolver de este producto.
                        </div>
                      )}
                    </td>
                    <td>{item.cantidad}</td>
                    <td>
                      {sinNadaQueDevolver ? (
                        <span>0</span>
                      ) : item.tipo === 'accesorio' ? (
                        <input
                          type="number"
                          min="0"
                          max={item.cantidad_disponible_devolver}
                          value={selecciones[item.product_id]?.cantidad ?? 0}
                          onChange={(e) => cambiarCantidadAccesorio(item, e.target.value)}
                          style={{ width: '70px' }}
                        />
                      ) : (
                        <button type="button" className="pos-btn-link" onClick={() => setModalCodigosProductId(item.product_id)}>
                          Elegir códigos ({cantidad}/{item.cantidad_disponible_devolver})
                        </button>
                      )}
                    </td>
                    <td>UND</td>
                    <td className="text-right">{fmt(item.costo_unitario_usd)}</td>
                    <td className="text-right">{fmt(totalLinea)}</td>
                    <td>
                      <button
                        type="button"
                        className="pos-remove-btn"
                        onClick={() => quitarProductoDevolucion(item)}
                        disabled={cantidad === 0}
                        title="Quitar este producto de la devolución"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pos-footer-actions">
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarDevolucion} disabled={registrando || !compra}>
          {registrando ? 'Registrando...' : 'F10 Registrar Devolución'}
        </button>
      </div>

      {modalCodigosProductId && compra && (() => {
        const item = compra.items.find((i) => i.product_id === modalCodigosProductId);
        if (!item) return null;
        return (
          <SeleccionDevolucionModal
            nombreProducto={item.descripcion}
            unidades={item.unidades}
            seleccionInicial={selecciones[item.product_id]?.codigos || []}
            onConfirm={(codigos) => confirmarCodigosDevolucion(item.product_id, codigos)}
            onCancel={() => setModalCodigosProductId(null)}
          />
        );
      })()}
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
