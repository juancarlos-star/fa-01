import React, { useState, useEffect, useRef } from 'react';
import { generarFacturaPDF } from '../utils/generarFacturaPDF.js';
import { fmt } from '../utils/format.js';

// Modulo de Devolucion de Factura. Misma idea que Devolucion de Compras, pero pidiendo el
// numero de FACTURA DE VENTA en vez del documento de compra: al escribirlo y presionar Enter,
// se trae el cliente, el vendedor, el deposito y los productos vendidos en esa factura.
//
// Diferencia importante con Devolucion de Compras: alli cada producto de la compra viene con
// TODOS sus codigos/IMEI juntos en un solo renglon (hay que elegir cuales devolver con un
// modal). Aqui, en cambio, cada renglon de la factura YA es una sola unidad vendida (un solo
// IMEI/codigo por linea para equipos/SIM/USIM), asi que no hace falta ningun modal: basta con
// una casilla para incluir o no esa linea en la devolucion. Solo los accesorios (que sí se
// venden por cantidad) piden un numero.
export default function DevolucionFacturas({ currentUser }) {
  const [settings, setSettings] = useState(null);
  const [depositos, setDepositos] = useState([]);

  const [numeroFactura, setNumeroFactura] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [factura, setFactura] = useState(null); // { encabezado, items }
  const [error, setError] = useState('');

  const [proximoNumeroDevolucion, setProximoNumeroDevolucion] = useState(null);

  // selecciones[item.id] = { cantidad } para accesorios, o { incluido: true/false } para
  // equipos/SIM/USIM (cada item.id es un renglon = una sola unidad). Se inicializa con todo lo
  // disponible marcado (devolucion total por defecto).
  const [selecciones, setSelecciones] = useState({});

  const [confirmacion, setConfirmacion] = useState(null);
  const [registrando, setRegistrando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const numeroRef = useRef(null);
  const totalizandoRef = useRef(false);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);
  useEffect(() => { window.api.listDepositos().then(setDepositos); }, []);
  useEffect(() => { setTimeout(() => numeroRef.current?.focus(), 0); }, []);

  const cargarProximoNumeroDevolucion = () => {
    window.api.proximoNumeroDevolucionFactura().then((res) => setProximoNumeroDevolucion(res.proximoNumero));
  };
  useEffect(() => { cargarProximoNumeroDevolucion(); }, []);

  const nombreDeposito = (depositoId) => {
    const d = depositos.find((dep) => dep.id === depositoId);
    return d ? `${d.codigo} - ${d.nombre}` : (depositoId ? `Depósito #${depositoId}` : '—');
  };

  const buscarFactura = async () => {
    setError('');
    const texto = numeroFactura.trim();
    if (!texto) return;
    setBuscando(true);
    try {
      const res = await window.api.buscarFacturaPorNumero(texto);
      if (!res.ok) {
        setError(res.message);
        setFactura(null);
        return;
      }
      setFactura(res);
      const sel = {};
      res.items.forEach((item) => {
        if (item.tipo === 'accesorio') {
          sel[item.id] = { cantidad: item.cantidad_disponible_devolver };
        } else {
          sel[item.id] = { incluido: item.cantidad_disponible_devolver > 0 };
        }
      });
      setSelecciones(sel);
    } finally {
      setBuscando(false);
    }
  };

  const cambiarFactura = () => {
    setFactura(null);
    setSelecciones({});
    setNumeroFactura('');
    setError('');
    setTimeout(() => numeroRef.current?.focus(), 0);
  };

  const cambiarCantidadAccesorio = (item, valor) => {
    const max = item.cantidad_disponible_devolver;
    let cantidad = parseInt(valor, 10);
    if (isNaN(cantidad)) cantidad = 0;
    if (cantidad < 0) cantidad = 0;
    if (cantidad > max) cantidad = max;
    setSelecciones((prev) => ({ ...prev, [item.id]: { cantidad } }));
  };

  const toggleIncluido = (item) => {
    if (item.cantidad_disponible_devolver === 0) return;
    setSelecciones((prev) => ({ ...prev, [item.id]: { incluido: !prev[item.id]?.incluido } }));
  };

  // Quita el renglon COMPLETO de lo que se va a devolver.
  const quitarLineaDevolucion = (item) => {
    if (item.tipo === 'accesorio') {
      setSelecciones((prev) => ({ ...prev, [item.id]: { cantidad: 0 } }));
    } else {
      setSelecciones((prev) => ({ ...prev, [item.id]: { incluido: false } }));
    }
  };

  // Base imponible / IVA / Total se calculan SOLO sobre lo seleccionado para devolver, usando
  // el precio de VENTA de cada renglon (no el costo, a diferencia de Devolucion de Compras).
  const itemsSeleccionados = (factura?.items || []).map((item) => {
    const sel = selecciones[item.id] || {};
    const cantidad = item.tipo === 'accesorio' ? (sel.cantidad || 0) : (sel.incluido ? 1 : 0);
    return { item, cantidad, totalLinea: cantidad * item.precio_unitario_usd };
  });

  const subtotal = itemsSeleccionados.reduce((acc, i) => acc + i.totalLinea, 0);
  const ivaPorcentaje = factura?.encabezado?.iva_porcentaje ?? (settings ? parseFloat(settings.iva_porcentaje) : 0);
  const iva = subtotal * (ivaPorcentaje / 100);
  const total = subtotal + iva;
  const totalPiezas = itemsSeleccionados.reduce((acc, i) => acc + i.cantidad, 0);

  const handleRegistrarDevolucion = async () => {
    if (totalizandoRef.current) return;
    setError('');
    if (!factura) { setError('Busca primero una factura por su numero'); return; }

    const items = itemsSeleccionados
      .filter((i) => i.cantidad > 0)
      .map((i) => {
        if (i.item.tipo === 'accesorio') {
          return { product_id: i.item.product_id, tipo: 'accesorio', cantidad: i.cantidad };
        }
        return { product_id: i.item.product_id, tipo: i.item.tipo, unit_id: i.item.unit_id };
      });

    if (items.length === 0) {
      setError('Selecciona al menos un producto para devolver');
      return;
    }

    totalizandoRef.current = true;
    setRegistrando(true);
    try {
      const res = await window.api.crearDevolucionFactura({
        facturaId: factura.encabezado.id,
        items,
        usuario: currentUser?.full_name || currentUser?.username
      });

      if (!res.ok) { setError(res.message); return; }

      const detalle = await window.api.detalleFactura(res.devolucionId);
      if (detalle.ok) {
        try {
          await generarFacturaPDF(detalle.factura, detalle.items, settings, { imprimir: true });
        } catch (errImpresion) {
          console.error('Error al imprimir la devolucion automaticamente:', errImpresion);
        }
      }

      setConfirmacion({ devolucionId: res.devolucionId, numeroDevolucion: res.numeroDevolucion, totalUsd: res.totalDevueltoUsd, detalle: detalle.ok ? detalle : null });
      setFactura(null);
      setSelecciones({});
      setNumeroFactura('');
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
      await generarFacturaPDF(confirmacion.detalle.factura, confirmacion.detalle.items, settings, { imprimir: true });
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

  const encabezado = factura?.encabezado;

  return (
    <div className="pos-page">
      <div className="pos-topbar">
        <span className="pos-topbar-side">MODULO DE FACTURACION</span>
        <span className="pos-topbar-center">DEVOLUCIÓN DE FACTURA</span>
        <span className="pos-topbar-side">MODO: NORMAL</span>
      </div>

      <div className="pos-panels">
        <div className="pos-left">
          <div className="pos-field">
            <label>N° de factura de venta <span className="required-mark">*</span></label>
            <input
              ref={numeroRef}
              placeholder="N° de factura + Enter"
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarFactura(); } }}
              disabled={!!factura || buscando}
            />
          </div>

          {factura && (
            <div className="pos-field">
              <label>Factura N°</label>
              <input value={encabezado.numero_factura || String(encabezado.id).padStart(6, '0')} disabled />
            </div>
          )}

          <div className="pos-field">
            <label>Vendedor</label>
            <input value={encabezado ? (encabezado.usuario || '—') : ''} placeholder="—" disabled />
          </div>

          <div className="pos-field">
            <label>Depósito</label>
            <input value={factura ? nombreDeposito(encabezado.deposito_id) : ''} placeholder="—" disabled />
          </div>

          {factura && (
            <div className="pos-actions-row">
              <button type="button" className="pos-btn-link" onClick={cambiarFactura}>Cambiar factura</button>
            </div>
          )}
        </div>

        <div className="pos-mid">
          {buscando ? (
            <div className="pos-stripe placeholder">Buscando factura...</div>
          ) : encabezado ? (
            <>
              <div className="pos-stripe">{encabezado.cliente_nombre || 'Consumidor final'}</div>
              <div className="pos-stripe">{encabezado.cliente_rif || '—'}</div>
              <div className="pos-stripe">{encabezado.cliente_telefono || '—'}</div>
              <div className="pos-stripe">{encabezado.cliente_direccion || '—'}</div>
            </>
          ) : (
            <>
              <div className="pos-stripe placeholder">Escribe el número de factura y presiona Enter</div>
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
              <th style={{ width: '10%' }}>Vendido</th>
              <th style={{ width: '14%' }}>A devolver</th>
              <th style={{ width: '6%' }}>Und</th>
              <th style={{ width: '10%' }}>Precio</th>
              <th style={{ width: '10%' }}>Total</th>
              <th style={{ width: '8%' }}></th>
            </tr>
          </thead>
          <tbody>
            {!factura ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#98a2b3', padding: '18px' }}>
                  Escribe el número de una factura de venta y presiona Enter para ver sus productos.
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
                      {item.tipo !== 'accesorio' && item.codigo && (
                        <div style={codigoLineStyle}>{item.codigo}</div>
                      )}
                      {sinNadaQueDevolver && (
                        <div style={{ color: '#b42318', fontSize: '0.78rem', marginTop: '4px' }}>
                          {item.tipo === 'accesorio'
                            ? 'Ya no queda nada disponible para devolver de este producto.'
                            : 'Este código ya fue devuelto anteriormente.'}
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
                          value={selecciones[item.id]?.cantidad ?? 0}
                          onChange={(e) => cambiarCantidadAccesorio(item, e.target.value)}
                          style={{ width: '70px' }}
                        />
                      ) : (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!selecciones[item.id]?.incluido}
                            onChange={() => toggleIncluido(item)}
                          />
                          Devolver
                        </label>
                      )}
                    </td>
                    <td>UND</td>
                    <td className="text-right">{fmt(item.precio_unitario_usd)}</td>
                    <td className="text-right">{fmt(totalLinea)}</td>
                    <td>
                      <button
                        type="button"
                        className="pos-remove-btn"
                        onClick={() => quitarLineaDevolucion(item)}
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
        <button type="button" className="pos-btn-totalizar" onClick={handleRegistrarDevolucion} disabled={registrando || !factura}>
          {registrando ? 'Registrando...' : 'F10 Registrar Devolución'}
        </button>
      </div>
    </div>
  );
}

const codigoLineStyle = {
  marginTop: '4px',
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  color: '#475467'
};
