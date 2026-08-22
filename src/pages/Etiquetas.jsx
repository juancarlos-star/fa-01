import React, { useState, useEffect, useRef } from 'react';
import { generarEtiquetasPDF } from '../utils/generarEtiquetasPDF.js';
import { fmt } from '../utils/format.js';

const estiloBotonPrimario = {
  backgroundColor: '#0b4f9e', color: '#fff', border: 'none', borderRadius: '4px',
  padding: '0.5rem 1rem', cursor: 'pointer'
};
const estiloBotonSecundario = {
  backgroundColor: '#fff', color: '#0b4f9e', border: '1px solid #0b4f9e', borderRadius: '4px',
  padding: '0.5rem 1rem', cursor: 'pointer'
};

// Pantalla de "Etiquetas": arma una lista de etiquetas de precio/codigo de barras a imprimir
// y genera un PDF. Funciona distinto segun el tipo de producto:
//  - Accesorio: se pide una CANTIDAD de etiquetas (todas iguales, con el mismo codigo).
//  - Equipo/SIM/USIM: cada unidad fisica tiene su propio IMEI/codigo, asi que se eligen las
//    unidades puntuales (checkbox) en vez de escribir una cantidad.
export default function Etiquetas() {
  const [settings, setSettings] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  // Producto encontrado en espera de que el usuario elija cantidad (accesorio) o unidades
  // (equipo/SIM/USIM) antes de agregarlo a la lista de etiquetas.
  const [productoPendiente, setProductoPendiente] = useState(null);
  const [cantidadPendiente, setCantidadPendiente] = useState(1);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [unidadesSeleccionadas, setUnidadesSeleccionadas] = useState([]);

  // Lista final de etiquetas a imprimir: cada entrada ya es UNA etiqueta fisica.
  // { key, nombre, precio, codigo, refProducto (para agrupar cantidad en la tabla resumen) }
  const [etiquetas, setEtiquetas] = useState([]);

  const [layout, setLayout] = useState('hojaCarta');
  const [mostrarBs, setMostrarBs] = useState(true);
  const [generando, setGenerando] = useState(false);

  const codigoRef = useRef(null);

  useEffect(() => { window.api.getSettings().then(setSettings); }, []);
  useEffect(() => { setTimeout(() => codigoRef.current?.focus(), 0); }, []);

  const buscar = async () => {
    setError('');
    const texto = codigo.trim();
    if (!texto) return;
    setBuscando(true);
    try {
      const res = await window.api.buscarProductoPorCodigo(texto);
      if (!res) { setError(`No se encontró ningún producto con "${texto}"`); return; }
      if (res.multiplesCoincidencias) { setError('Hay varios productos con ese nombre, escribe algo más específico o usa el código corto'); return; }
      if (res.noDisponible) { setError(`El código "${res.codigo}" ya no está disponible`); return; }
      if (res.otroDeposito) { setError(`El código "${res.codigo}" pertenece a otro depósito`); return; }

      setCodigo('');
      if (res.tipo === 'accesorio') {
        setProductoPendiente(res);
        setCantidadPendiente(1);
      } else {
        const unidades = await window.api.listUnidadesDisponibles(res.id);
        if (unidades.length === 0) { setError(`"${res.nombre}" no tiene unidades disponibles para etiquetar`); return; }
        setProductoPendiente(res);
        setUnidadesDisponibles(unidades);
        setUnidadesSeleccionadas(unidades.map((u) => u.id)); // por defecto, todas marcadas
      }
    } finally {
      setBuscando(false);
    }
  };

  const cancelarPendiente = () => {
    setProductoPendiente(null);
    setUnidadesDisponibles([]);
    setUnidadesSeleccionadas([]);
    setTimeout(() => codigoRef.current?.focus(), 0);
  };

  const confirmarAccesorio = () => {
    const cantidad = Math.max(1, parseInt(cantidadPendiente, 10) || 1);
    const nuevas = Array.from({ length: cantidad }, (_, i) => ({
      key: `${productoPendiente.id}-acc-${Date.now()}-${i}`,
      producto_id: productoPendiente.id,
      nombre: productoPendiente.nombre,
      precio: productoPendiente.precio,
      codigo: productoPendiente.codigo_barras || productoPendiente.codigo_producto || String(productoPendiente.id)
    }));
    setEtiquetas((prev) => [...prev, ...nuevas]);
    cancelarPendiente();
  };

  const toggleUnidad = (id) => {
    setUnidadesSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmarUnidades = () => {
    const seleccionadas = unidadesDisponibles.filter((u) => unidadesSeleccionadas.includes(u.id));
    if (seleccionadas.length === 0) { setError('Selecciona al menos una unidad'); return; }
    const nuevas = seleccionadas.map((u) => ({
      key: `${productoPendiente.id}-u${u.id}`,
      producto_id: productoPendiente.id,
      nombre: productoPendiente.nombre,
      precio: productoPendiente.precio,
      codigo: u.codigo
    }));
    setEtiquetas((prev) => [...prev, ...nuevas]);
    cancelarPendiente();
  };

  const quitarEtiqueta = (key) => {
    setEtiquetas((prev) => prev.filter((e) => e.key !== key));
  };

  const vaciarLista = () => setEtiquetas([]);

  const totalEtiquetas = etiquetas.length;

  const handleGenerarPDF = async (imprimir) => {
    if (etiquetas.length === 0) { setError('Agrega al menos un producto a la lista'); return; }
    setGenerando(true);
    try {
      await generarEtiquetasPDF(etiquetas, {
        layout,
        tasaCambio: settings ? parseFloat(settings.tasa_cambio) : 0,
        mostrarBs,
        imprimir
      });
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div>
      <h1>Etiquetas de precio / código de barras</h1>
      <p style={{ color: '#667085', marginTop: '-8px' }}>
        Busca un producto por su código corto o nombre, elige cuántas etiquetas (o qué unidades) necesitas,
        y agrégalo a la lista de abajo. Cuando termines, genera el PDF.
      </p>

      <div className="form-box" style={{ maxWidth: '480px' }}>
        <label>Código o nombre de producto</label>
        <input
          ref={codigoRef}
          placeholder="Código + Enter"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }}
          disabled={buscando || !!productoPendiente}
        />
      </div>

      {error && <div className="pos-error-banner" style={{ maxWidth: '480px' }}>{error}</div>}

      {productoPendiente && productoPendiente.tipo === 'accesorio' && (
        <div className="form-box" style={{ maxWidth: '480px' }}>
          <p><strong>{productoPendiente.nombre}</strong> — ${fmt(productoPendiente.precio)}</p>
          <label>¿Cuántas etiquetas necesitas?</label>
          <input
            type="number"
            min="1"
            value={cantidadPendiente}
            onChange={(e) => setCantidadPendiente(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarAccesorio(); } }}
            style={{ maxWidth: '120px' }}
            autoFocus
          />
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <button style={estiloBotonPrimario} onClick={confirmarAccesorio}>Agregar a la lista</button>
            <button style={estiloBotonSecundario} onClick={cancelarPendiente}>Cancelar</button>
          </div>
        </div>
      )}

      {productoPendiente && productoPendiente.tipo !== 'accesorio' && (
        <div className="form-box" style={{ maxWidth: '480px' }}>
          <p><strong>{productoPendiente.nombre}</strong> — ${fmt(productoPendiente.precio)}</p>
          <label>Elige las unidades a etiquetar ({unidadesSeleccionadas.length} de {unidadesDisponibles.length} seleccionadas)</label>
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #d0d5dd', borderRadius: '6px', padding: '6px' }}>
            {unidadesDisponibles.map((u) => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={unidadesSeleccionadas.includes(u.id)} onChange={() => toggleUnidad(u.id)} />
                <span style={{ fontFamily: 'monospace' }}>{u.codigo}</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <button style={estiloBotonPrimario} onClick={confirmarUnidades}>Agregar a la lista</button>
            <button style={estiloBotonSecundario} onClick={cancelarPendiente}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <p><strong>{totalEtiquetas}</strong> etiqueta{totalEtiquetas === 1 ? '' : 's'} en la lista</p>
          {totalEtiquetas > 0 && <button style={estiloBotonSecundario} onClick={vaciarLista}>Vaciar lista</button>}
        </div>

        {etiquetas.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '0.5rem' }}>Producto</th>
                <th>Código</th>
                <th>Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {etiquetas.map((e) => (
                <tr key={e.key} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{e.nombre}</td>
                  <td style={{ fontFamily: 'monospace' }}>{e.codigo}</td>
                  <td>${fmt(e.precio)}</td>
                  <td><button className="pos-remove-btn" onClick={() => quitarEtiqueta(e.key)} title="Quitar">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="form-box" style={{ maxWidth: '480px', marginTop: '1.5rem' }}>
        <label>Formato de impresión</label>
        <select value={layout} onChange={(e) => setLayout(e.target.value)}>
          <option value="hojaCarta">Hoja carta (30 etiquetas, 3 columnas x 10 filas)</option>
          <option value="rolloTermico">Rollo térmico (una etiqueta por página, 50x30mm)</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarBs} onChange={(e) => setMostrarBs(e.target.checked)} />
          Mostrar también el precio en Bs.
        </label>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
        <button style={estiloBotonPrimario} onClick={() => handleGenerarPDF(false)} disabled={generando || etiquetas.length === 0}>
          {generando ? 'Generando...' : 'Generar PDF'}
        </button>
        <button style={estiloBotonSecundario} onClick={() => handleGenerarPDF(true)} disabled={generando || etiquetas.length === 0}>
          Generar e imprimir
        </button>
      </div>
    </div>
  );
}
