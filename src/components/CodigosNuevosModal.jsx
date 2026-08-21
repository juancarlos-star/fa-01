import React, { useState, useRef, useEffect } from 'react';

// Genera la lista de codigos consecutivos entre "primero" y "ultimo" (ambos incluidos),
// conservando el largo/ceros a la izquierda del codigo original. Ejemplo: de "0000100" a
// "0000150" genera 51 codigos: "0000100", "0000101", ..., "0000150".
// Se usa BigInt (no Number) porque los ICCID de SIM/USIM tienen hasta 19-20 digitos, mas de
// lo que Number puede representar sin perder precision.
function generarRangoCodigos(primero, ultimo) {
  const a = primero.trim();
  const b = ultimo.trim();
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) {
    throw new Error('El primer y el ultimo codigo del rango deben contener solo numeros');
  }
  if (a.length !== b.length) {
    throw new Error('El primer y el ultimo codigo del rango deben tener la misma cantidad de digitos');
  }
  const largo = a.length;
  const inicio = BigInt(a);
  const fin = BigInt(b);
  if (fin < inicio) {
    throw new Error('El ultimo codigo del rango debe ser mayor o igual que el primero');
  }
  const cantidad = fin - inicio + 1n;
  if (cantidad > 5000n) {
    throw new Error('El rango es demasiado grande (mas de 5000 codigos). Revisa el primer y ultimo codigo.');
  }
  const codigos = [];
  for (let n = inicio; n <= fin; n++) {
    codigos.push(n.toString().padStart(largo, '0'));
  }
  return codigos;
}

// Ventana modal para ingresar los codigos/IMEI NUEVOS de las unidades que estan entrando en esta
// compra (equipos, SIM, USIM). Tiene dos modos:
//  - "Uno por uno": se tipea o se lee con pistola un codigo a la vez (con verificacion en tiempo
//    real contra el inventario mientras se escribe, ademas de la verificacion final al agregar).
//  - "Por rango (lote)": solo para SIM/USIM, ya que sus cajas traen el primer y el ultimo codigo
//    de una tanda consecutiva (ej. de 100 a 150). Se escriben esos dos codigos y el sistema
//    genera automaticamente todos los intermedios, validando que la cantidad del rango coincida
//    con la cantidad indicada y que ninguno este repetido en el inventario.
export default function CodigosNuevosModal({ nombreProducto, tipo, cantidadNecesaria, onConfirm, onCancel }) {
  const permiteRango = tipo === 'simcard' || tipo === 'usim';
  const [modo, setModo] = useState('uno'); // 'uno' | 'rango'

  const [valor, setValor] = useState('');
  const [codigos, setCodigos] = useState([]);
  const [verificando, setVerificando] = useState(false);
  const [aviso, setAviso] = useState('');
  const inputRef = useRef(null);

  // Verificacion en tiempo real (modo "uno por uno"): mientras el usuario escribe (o la pistola
  // dispara los caracteres), se consulta el inventario despues de una pequena pausa, para avisar
  // de una vez si ese codigo ya existe, sin esperar a que se presione Enter.
  const [estadoTiempoReal, setEstadoTiempoReal] = useState(null); // null | 'verificando' | 'libre' | 'existe'

  // ---- Modo "por rango (lote)" ----
  const [rangoInicio, setRangoInicio] = useState('');
  const [rangoFin, setRangoFin] = useState('');
  const [generandoRango, setGenerandoRango] = useState(false);
  const [errorRango, setErrorRango] = useState('');
  const inicioRangoRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (modo === 'rango') {
      setTimeout(() => inicioRangoRef.current?.focus(), 0);
    } else {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [modo]);

  const faltan = cantidadNecesaria - codigos.length;

  // Dispara la verificacion en tiempo real 400ms despues de que el usuario deja de escribir.
  useEffect(() => {
    if (modo !== 'uno') return undefined;
    const texto = valor.trim();
    if (!texto) {
      setEstadoTiempoReal(null);
      return undefined;
    }
    if (codigos.some((c) => c.toLowerCase() === texto.toLowerCase())) {
      setEstadoTiempoReal('existe');
      return undefined;
    }
    setEstadoTiempoReal('verificando');
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.codigoExiste({ codigo: texto });
        setEstadoTiempoReal(res.existe ? 'existe' : 'libre');
      } catch {
        setEstadoTiempoReal(null);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, modo]);

  const agregarCodigo = async () => {
    const texto = valor.trim();
    if (!texto) return;
    setAviso('');

    if (codigos.some((c) => c.toLowerCase() === texto.toLowerCase())) {
      setAviso(`El codigo "${texto}" ya lo ingresaste en esta misma compra`);
      return;
    }

    setVerificando(true);
    try {
      const res = await window.api.codigoExiste({ codigo: texto });
      if (res.existe) {
        setAviso(`El codigo "${texto}" ya esta registrado en el inventario`);
        return;
      }
      const nuevos = [...codigos, texto];
      setCodigos(nuevos);
      setValor('');
      setEstadoTiempoReal(null);
      if (nuevos.length >= cantidadNecesaria) {
        onConfirm(nuevos);
        return;
      }
    } catch (err) {
      setAviso('Error verificando el codigo: ' + (err?.message || String(err)));
    } finally {
      setVerificando(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const quitarCodigo = (texto) => {
    setCodigos(codigos.filter((c) => c !== texto));
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key === 'Enter') { e.preventDefault(); agregarCodigo(); }
  };

  // Genera el rango, valida cantidad y duplicados (dentro del propio rango, contra lo ya
  // ingresado en esta ventana, y contra el inventario en una sola consulta por lote), y si todo
  // esta correcto confirma de una vez (igual que cuando se completa el modo "uno por uno").
  const generarRango = async () => {
    setErrorRango('');
    let generados;
    try {
      generados = generarRangoCodigos(rangoInicio, rangoFin);
    } catch (err) {
      setErrorRango(err.message);
      return;
    }

    if (generados.length !== cantidadNecesaria) {
      setErrorRango(
        `El rango que escribiste tiene ${generados.length} codigo(s) (de ${rangoInicio.trim()} a ${rangoFin.trim()}), `
        + `pero la cantidad indicada es ${cantidadNecesaria}. Corrige el rango o la cantidad para que coincidan.`
      );
      return;
    }

    const vistosEnLote = new Set();
    for (const c of generados) {
      if (vistosEnLote.has(c.toLowerCase())) {
        setErrorRango(`El codigo "${c}" quedo repetido dentro del mismo rango generado`);
        return;
      }
      vistosEnLote.add(c.toLowerCase());
    }
    for (const c of codigos) {
      if (vistosEnLote.has(c.toLowerCase())) {
        setErrorRango(`El codigo "${c}" ya lo habias ingresado antes de cambiar a modo por rango`);
        return;
      }
    }

    setGenerandoRango(true);
    try {
      const res = await window.api.codigosExisten(generados);
      const existentes = res.existentes || [];
      if (existentes.length > 0) {
        setErrorRango(
          `${existentes.length} de los codigos del rango ya estan registrados en el inventario `
          + `(ej. ${existentes.slice(0, 3).join(', ')}${existentes.length > 3 ? '...' : ''}). `
          + `Revisa el rango: puede que esta caja ya se haya cargado antes.`
        );
        return;
      }
      const nuevos = [...codigos, ...generados];
      onConfirm(nuevos);
    } catch (err) {
      setErrorRango('Error verificando el rango: ' + (err?.message || String(err)));
    } finally {
      setGenerandoRango(false);
    }
  };

  const cantidadRango = (() => {
    if (!/^\d+$/.test(rangoInicio.trim()) || !/^\d+$/.test(rangoFin.trim())) return null;
    if (rangoInicio.trim().length !== rangoFin.trim().length) return null;
    try {
      const diff = BigInt(rangoFin.trim()) - BigInt(rangoInicio.trim()) + 1n;
      return diff > 0n ? diff.toString() : null;
    } catch {
      return null;
    }
  })();

  return (
    <div style={overlayStyle} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}>
      <div style={boxStyle}>
        <div style={headerStyle}>
          CÓDIGOS / IMEI NUEVOS — {nombreProducto ? nombreProducto.toUpperCase() : ''}
        </div>
        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          {permiteRango && (
            <div style={tabsWrapStyle}>
              <button
                type="button"
                style={modo === 'uno' ? tabBtnActivo : tabBtnInactivo}
                onClick={() => setModo('uno')}
              >
                Uno por uno
              </button>
              <button
                type="button"
                style={modo === 'rango' ? tabBtnActivo : tabBtnInactivo}
                onClick={() => setModo('rango')}
              >
                Por rango (lote)
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: '#333' }}>
              {modo === 'uno' ? 'IMEI / Código (tipiar o leer con pistola)' : 'Primer y último código de la caja/lote'}
            </label>
            <span style={{ fontSize: '0.8rem', color: faltan > 0 ? '#b42318' : '#0b8f4e', fontWeight: 'bold' }}>
              {codigos.length} / {cantidadNecesaria} ingresados
            </span>
          </div>

          {modo === 'uno' ? (
            <>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={valor}
                  onChange={(e) => { setValor(e.target.value); setAviso(''); }}
                  onKeyDown={handleKeyDown}
                  placeholder={verificando ? 'Verificando...' : 'Código nuevo + Enter'}
                  disabled={verificando}
                  style={inputStyle}
                />
                {estadoTiempoReal && (
                  <span style={estadoTiempoReal === 'existe' ? estadoBadgeExiste : estadoTiempoReal === 'libre' ? estadoBadgeLibre : estadoBadgeVerificando}>
                    {estadoTiempoReal === 'existe' ? 'Ya existe en inventario' : estadoTiempoReal === 'libre' ? 'Disponible' : 'Verificando...'}
                  </span>
                )}
              </div>
              {aviso && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '6px 0 0' }}>{aviso}</p>}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  ref={inicioRangoRef}
                  type="text"
                  inputMode="numeric"
                  value={rangoInicio}
                  onChange={(e) => { setRangoInicio(e.target.value); setErrorRango(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generarRango(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
                  placeholder="Primer código de la caja"
                  disabled={generandoRango}
                  style={inputStyle}
                />
                <span style={{ color: '#98a2b3' }}>—</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rangoFin}
                  onChange={(e) => { setRangoFin(e.target.value); setErrorRango(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generarRango(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }}
                  placeholder="Último código de la caja"
                  disabled={generandoRango}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#667085' }}>
                  {cantidadRango != null
                    ? `Ese rango tiene ${cantidadRango} código(s). Se necesitan ${cantidadNecesaria}.`
                    : 'Escribe el primer y el último código de la caja (mismo largo, solo números).'}
                </span>
                <button type="button" onClick={generarRango} disabled={generandoRango || !rangoInicio.trim() || !rangoFin.trim()} style={btnGenerarRango}>
                  {generandoRango ? 'Verificando...' : 'Generar rango'}
                </button>
              </div>
              {errorRango && <p style={{ color: '#b42318', fontSize: '0.8rem', margin: '8px 0 0' }}>{errorRango}</p>}
            </>
          )}

          <div style={{ fontSize: '0.75rem', color: '#667085', margin: '12px 0 4px' }}>
            Códigos ingresados:
          </div>
          <div style={listWrapStyle}>
            {codigos.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: '#98a2b3', fontSize: '0.85rem' }}>
                Aun no has ingresado ningun codigo.
              </div>
            ) : (
              codigos.map((c) => (
                <div key={c} style={listItemStyle}>
                  <span>{c}</span>
                  <button type="button" onClick={() => quitarCodigo(c)} style={quitarBtnStyle}>Quitar</button>
                </div>
              ))
            )}
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onCancel} style={btnCancelar}>
              ESC &nbsp;Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
};

const boxStyle = {
  background: '#fff',
  borderRadius: '8px',
  width: '480px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 35px rgba(0,0,0,0.35)'
};

const headerStyle = {
  background: 'linear-gradient(180deg, #6bc0d6, #4a9fb8)',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1.05rem',
  letterSpacing: '0.5px',
  padding: '12px 16px',
  borderRadius: '8px 8px 0 0'
};

const tabsWrapStyle = {
  display: 'flex',
  gap: '6px',
  marginBottom: '12px',
  background: '#f2f4f7',
  padding: '4px',
  borderRadius: '6px'
};

const tabBtnBase = {
  flex: 1,
  padding: '7px 0',
  borderRadius: '5px',
  border: 'none',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer'
};

const tabBtnActivo = { ...tabBtnBase, background: '#0b4f9e', color: '#fff' };
const tabBtnInactivo = { ...tabBtnBase, background: 'transparent', color: '#475467' };

const inputStyle = {
  width: '100%',
  padding: '8px 9px',
  border: '1px solid #c7ccd4',
  borderRadius: '5px',
  fontSize: '0.95rem'
};

const estadoBadgeBase = {
  display: 'inline-block',
  marginTop: '6px',
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '10px'
};

const estadoBadgeExiste = { ...estadoBadgeBase, background: '#fde8e6', color: '#b42318' };
const estadoBadgeLibre = { ...estadoBadgeBase, background: '#e6f4ea', color: '#0b8f4e' };
const estadoBadgeVerificando = { ...estadoBadgeBase, background: '#eef0f3', color: '#667085' };

const btnGenerarRango = {
  padding: '7px 14px',
  background: '#0b4f9e',
  color: '#fff',
  border: 'none',
  borderRadius: '5px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const listWrapStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  maxHeight: '260px',
  overflowY: 'auto'
};

const listItemStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #f0f2f5',
  fontSize: '0.9rem',
  fontFamily: 'monospace',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const quitarBtnStyle = {
  fontSize: '0.72rem',
  padding: '3px 8px',
  borderRadius: '4px',
  border: 'none',
  cursor: 'pointer',
  backgroundColor: '#b42318',
  color: '#fff',
  fontFamily: 'inherit'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: '14px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const btnCancelar = {
  padding: '8px 16px',
  background: '#e2e8f0',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
