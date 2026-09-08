import React, { useState, useRef, useEffect, useMemo } from 'react';

// Separa los digitos finales de un codigo de su prefijo (ej. "SIM00100" -> prefijo "SIM00",
// digitos "100"), igual que el resto de las herramientas de "rango" del sistema. Se usa aqui
// solo para calcular la lista de codigos intermedios entre el primero y el ultimo de una caja.
function partirDigitosFinales(s) {
  let i = s.length;
  while (i > 0 && /\d/.test(s[i - 1])) i--;
  return { prefijo: s.slice(0, i), digitos: s.slice(i) };
}

function calcularCodigosRango(codigoInicio, codigoFin) {
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

// Ventana modal para elegir, uno por uno (pistola o teclado) o por rango, las unidades YA
// EXISTENTES en el inventario que se van a dar de baja en un Descargo -es la contraparte de
// "CodigosNuevosModal" (que crea codigos NUEVOS para un Cargo/Compra): aqui no se crea nada, se
// valida que cada codigo escrito corresponda a una unidad realmente disponible de ESTE producto
// en ESTE deposito, y que no se haya elegido ya (ni en esta misma ventana, ni antes en el
// documento que se esta armando).
export default function CodigosExistentesModal({ nombreProducto, tipo, productId, depositoId, itemsYaEnDocumento, cantidadNecesaria, onConfirm, onCancel }) {
  const permiteRango = tipo === 'simcard' || tipo === 'usim';
  const [modo, setModo] = useState('uno'); // 'uno' | 'rango'

  const [cargandoDisponibles, setCargandoDisponibles] = useState(true);
  const [disponibles, setDisponibles] = useState([]); // unidades disponibles de este producto/deposito, aun no elegidas en el documento

  const [valor, setValor] = useState('');
  const [seleccionados, setSeleccionados] = useState([]); // [{ unitId, codigo }]
  const [aviso, setAviso] = useState('');
  const inputRef = useRef(null);

  const [rangoInicio, setRangoInicio] = useState('');
  const [rangoFin, setRangoFin] = useState('');
  const [errorRango, setErrorRango] = useState('');
  const inicioRangoRef = useRef(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const unidades = await window.api.listUnits(productId, depositoId ? Number(depositoId) : undefined);
      const yaElegidos = new Set((itemsYaEnDocumento || []).map((id) => id));
      const libres = unidades.filter((u) => u.estado === 'disponible' && !yaElegidos.has(u.id));
      if (!cancelado) {
        setDisponibles(libres);
        setCargandoDisponibles(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cargandoDisponibles) setTimeout(() => inputRef.current?.focus(), 0);
  }, [cargandoDisponibles]);

  useEffect(() => {
    if (modo === 'rango') setTimeout(() => inicioRangoRef.current?.focus(), 0);
    else setTimeout(() => inputRef.current?.focus(), 0);
  }, [modo]);

  const mapaDisponibles = useMemo(() => {
    const m = new Map();
    disponibles.forEach((u) => m.set(u.codigo.toLowerCase(), u));
    return m;
  }, [disponibles]);

  const faltan = cantidadNecesaria - seleccionados.length;

  const agregarCodigo = () => {
    const texto = valor.trim();
    if (!texto) return;
    setAviso('');

    if (seleccionados.some((s) => s.codigo.toLowerCase() === texto.toLowerCase())) {
      setAviso(`El codigo "${texto}" ya lo agregaste a este descargo`);
      return;
    }
    const unidad = mapaDisponibles.get(texto.toLowerCase());
    if (!unidad) {
      setAviso(`"${texto}" no esta disponible para descargar de "${nombreProducto}" en este deposito, o no existe`);
      return;
    }
    const nuevos = [...seleccionados, { unitId: unidad.id, codigo: unidad.codigo }];
    setSeleccionados(nuevos);
    setValor('');
    if (nuevos.length >= cantidadNecesaria) {
      onConfirm(nuevos);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const quitarCodigo = (codigo) => {
    setSeleccionados(seleccionados.filter((s) => s.codigo !== codigo));
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter') { e.preventDefault(); agregarCodigo(); }
  };

  const cantidadRango = (() => {
    const codigos = calcularCodigosRango(rangoInicio, rangoFin);
    return codigos ? codigos.length : null;
  })();

  const generarRango = () => {
    setErrorRango('');
    const codigos = calcularCodigosRango(rangoInicio, rangoFin);
    if (!codigos) { setErrorRango('Revisa el primer y el ultimo codigo: no se pudo calcular el rango'); return; }
    if (codigos.length !== cantidadNecesaria) {
      setErrorRango(`Ese rango tiene ${codigos.length} codigo(s), pero la cantidad indicada es ${cantidadNecesaria}. Corrige el rango o la cantidad para que coincidan.`);
      return;
    }
    const yaElegidosEnRango = new Set(seleccionados.map((s) => s.codigo.toLowerCase()));
    const encontrados = [];
    const noDisponibles = [];
    for (const c of codigos) {
      if (yaElegidosEnRango.has(c.toLowerCase())) { noDisponibles.push(c); continue; }
      const u = mapaDisponibles.get(c.toLowerCase());
      if (!u) { noDisponibles.push(c); continue; }
      encontrados.push({ unitId: u.id, codigo: u.codigo });
    }
    if (noDisponibles.length > 0) {
      setErrorRango(
        `${noDisponibles.length} codigo(s) de ese rango no estan disponibles para descargar (ej. ${noDisponibles.slice(0, 3).join(', ')}${noDisponibles.length > 3 ? '...' : ''}). Verifica el rango.`
      );
      return;
    }
    onConfirm([...seleccionados, ...encontrados]);
  };

  return (
    <div style={overlayStyle} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          CÓDIGOS A DAR DE BAJA — {nombreProducto ? nombreProducto.toUpperCase() : ''}
        </div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          {cargandoDisponibles ? (
            <p style={{ color: '#98a2b3', margin: 0 }}>Cargando unidades disponibles...</p>
          ) : (
            <>
              {permiteRango && (
                <div style={tabsWrapStyle}>
                  <button type="button" style={modo === 'uno' ? tabBtnActivo : tabBtnInactivo} onClick={() => setModo('uno')}>Uno por uno</button>
                  <button type="button" style={modo === 'rango' ? tabBtnActivo : tabBtnInactivo} onClick={() => setModo('rango')}>Por rango (caja completa)</button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {modo === 'uno' ? 'IMEI / Código (escanear o escribir)' : 'Primer y último código de la caja/lote'}
                </label>
                <span style={{ fontSize: '0.8rem', color: faltan > 0 ? '#b42318' : '#0b8f4e', fontWeight: 'bold' }}>
                  {seleccionados.length} / {cantidadNecesaria} elegidos
                </span>
              </div>

              {modo === 'uno' ? (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={valor}
                    onChange={(e) => { setValor(e.target.value); setAviso(''); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Código a dar de baja + Enter"
                    style={inputStyle}
                  />
                  {aviso && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '6px 0 0' }}>{aviso}</p>}
                  <p style={{ fontSize: '0.75rem', color: '#667085', margin: '6px 0 0' }}>
                    {disponibles.length} unidad(es) disponible(s) de este producto en este depósito.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      ref={inicioRangoRef}
                      type="text"
                      value={rangoInicio}
                      onChange={(e) => { setRangoInicio(e.target.value); setErrorRango(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generarRango(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
                      placeholder="Primer código de la caja"
                      style={inputStyle}
                    />
                    <span style={{ color: '#98a2b3' }}>—</span>
                    <input
                      type="text"
                      value={rangoFin}
                      onChange={(e) => { setRangoFin(e.target.value); setErrorRango(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generarRango(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
                      placeholder="Último código de la caja"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#667085' }}>
                      {cantidadRango != null ? `Ese rango tiene ${cantidadRango} código(s). Se necesitan ${cantidadNecesaria}.` : 'Escribe el primer y el último código de la caja.'}
                    </span>
                    <button type="button" onClick={generarRango} disabled={!rangoInicio.trim() || !rangoFin.trim()} style={btnGenerarRango}>
                      Generar rango
                    </button>
                  </div>
                  {errorRango && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '8px 0 0' }}>{errorRango}</p>}
                </>
              )}

              <div style={{ fontSize: '0.75rem', color: '#667085', margin: '12px 0 4px' }}>Códigos elegidos:</div>
              <div style={listWrapStyle}>
                {seleccionados.length === 0 ? (
                  <div style={{ padding: '14px', textAlign: 'center', color: '#98a2b3', fontSize: '0.85rem' }}>
                    Aun no has elegido ningun codigo.
                  </div>
                ) : (
                  seleccionados.map((s) => (
                    <div key={s.unitId} style={listItemStyle}>
                      <span>{s.codigo}</span>
                      <button type="button" onClick={() => quitarCodigo(s.codigo)} style={quitarBtnStyle}>Quitar</button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>ESC &nbsp;Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
};
const boxStyle = { background: '#fff', borderRadius: '8px', width: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 35px rgba(0,0,0,0.35)' };
const headerStyle = { background: 'linear-gradient(180deg, #d6866b, #b8544a)', color: '#fff', fontWeight: 'bold', fontSize: '1.05rem', letterSpacing: '0.5px', padding: '12px 16px', borderRadius: '8px 8px 0 0' };
const tabsWrapStyle = { display: 'flex', gap: '6px', marginBottom: '12px', background: '#f2f4f7', padding: '4px', borderRadius: '6px' };
const tabBtnBase = { flex: 1, padding: '7px 0', borderRadius: '5px', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' };
const tabBtnActivo = { ...tabBtnBase, background: '#b42318', color: '#fff' };
const tabBtnInactivo = { ...tabBtnBase, background: 'transparent', color: '#475467' };
const inputStyle = { width: '100%', padding: '8px 9px', border: '1px solid #c7ccd4', borderRadius: '5px', fontSize: '0.95rem' };
const btnGenerarRango = { padding: '7px 14px', background: '#b42318', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const listWrapStyle = { border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '260px', overflowY: 'auto' };
const listItemStyle = { padding: '8px 10px', borderBottom: '1px solid #f0f2f5', fontSize: '0.9rem', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const quitarBtnStyle = { fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: '#b42318', color: '#fff', fontFamily: 'inherit' };
const footerStyle = { display: 'flex', justifyContent: 'flex-end', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #eee' };
const btnCancelar = { padding: '8px 16px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' };
