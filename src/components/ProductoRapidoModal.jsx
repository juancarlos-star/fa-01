import React, { useState, useEffect } from 'react';
import { fmt } from '../utils/format.js';

const TIPO_LABEL = { equipo: 'Equipo (IMEI)', simcard: 'SIM (ICCID)', usim: 'USIM', accesorio: 'Accesorio' };

// Ventana modal para crear un producto nuevo "al vuelo" desde Compras, cuando el codigo o
// nombre que se escribio en el renglon de la compra no coincide con ningun producto existente.
// A la derecha se muestra una lista chica de los productos ya registrados (codigo, descripcion,
// costo y precio) para poder confirmar de un vistazo que en efecto no existe todavia, o para
// copiar el formato de codigo que se viene usando.
//
// Tambien se reutiliza, con el mismo diseno, para EDITAR un producto existente (incluye la
// pantalla de Reportes > Inventario > Productos): cuando se pasa "productoEditar", el titulo
// cambia a "EDITAR PRODUCTO" y los campos se precargan con sus datos actuales.
//
// El tipo tiene dos formas de definirse, seg n si se elige categoria o no:
//  - Si se elige una CATEGORIA, el tipo del producto (equipo/simcard/usim/accesorio) se toma
//    directo de esa categoria (cada categoria ya tiene su propio tipo fijo en la base de datos:
//    "Telefonos"=equipo, "SIM (ICCID)"=simcard, "USIM"=usim, "Accesorios"=accesorio -estas 4
//    vienen creadas desde la instalacion). Ya NO existe un selector aparte de "Tipo especifico".
//  - Si NO se elige categoria (es opcional), se usa el checkbox "Se vende por unidad" para decidir
//    entre Accesorio y Equipo (el mas comun de los que llevan codigo/IMEI individual).
// Cruzar la frontera Accesorio <-> "por unidad" SI puede romper datos si el producto ya tiene
// compras/ventas/unidades, asi que una vez que ya hay movimientos, solo se pueden elegir
// categorias (o "sin categoria") que respeten el mismo lado de esa frontera en el que ya estaba.
export default function ProductoRapidoModal({ codigoInicial, productoEditar, tiposPermitidos, onConfirm, onCancel }) {
  const editando = !!productoEditar;
  const seVendePorUnidadInicial = editando ? productoEditar.tipo !== 'accesorio' : null;
  const [form, setForm] = useState({
    codigo_producto: editando ? (productoEditar.codigo_producto || '') : (codigoInicial || ''),
    nombre: editando ? (productoEditar.nombre || '') : '',
    categoria: editando ? (productoEditar.categoria || '') : '',
    // El costo se guarda SIEMPRE en dolares (costo_promedio_usd), pero se escribe en la moneda
    // en la que el negocio realmente paga ese producto (ver monedaCosto mas abajo): Bs. para
    // SIM/USIM (se compran a Movistar en bolivares) y dolares para equipos/accesorios. Si se
    // esta editando, se precarga en bruto (USD) y una vez cargada la tasa se convierte a Bs. si
    // corresponde (ver useEffect de tasaCambio, abajo) para no mostrar $2000 cuando en realidad
    // son Bs 2000.
    costo_inicial: editando ? String(productoEditar.costo_promedio_usd ?? '0') : '',
    precio2: editando ? String(productoEditar.precio2 ?? '') : '',
    // Opcional: si se deja vacio, se guarda como 0 (sin alerta de stock bajo).
    stock_minimo: editando && productoEditar.stock_minimo ? String(productoEditar.stock_minimo) : '',
    // Solo se usa cuando NO hay categoria elegida (ver comentario de arriba). Por defecto viene
    // TILDADO: la mayoria de los productos que se registran al vuelo desde Compras sin elegir
    // categoria son equipos con IMEI individual.
    seVendePorUnidad: editando ? seVendePorUnidadInicial : true
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esIndividual = (t) => t !== 'accesorio';

  // Tasa del dia (Bs por 1 USD): el "Precio Bs." ya NO se escribe a mano -se calcula solo,
  // multiplicando el Precio Dolares por esta tasa- para que nunca quede desactualizado si el
  // dolar sube o baja de un dia a otro.
  const [tasaCambio, setTasaCambio] = useState(null); // null = todavia no se cargo la tasa real
  useEffect(() => {
    window.api.getSettings().then((s) => setTasaCambio(parseFloat(s?.tasa_cambio) || 1));
  }, []);
  const precioBsCalculado = (parseFloat(form.precio2) || 0) * (tasaCambio || 1);

  const [categorias, setCategorias] = useState([]);
  useEffect(() => {
    window.api.listCategories().then(setCategorias);
  }, []);

  const [productos, setProductos] = useState([]);
  const [filtroLista, setFiltroLista] = useState('');

  // Mientras se confirma si el producto tiene movimientos, se asume que SI (mas conservador) para
  // no dejar destildar por un instante algo que en realidad esta bloqueado.
  const [tieneMovimientos, setTieneMovimientos] = useState(true);
  const [verificandoMovimientos, setVerificandoMovimientos] = useState(editando);

  useEffect(() => {
    window.api.listProducts().then(setProductos);
  }, []);

  useEffect(() => {
    if (!editando) { setVerificandoMovimientos(false); return; }
    let cancelado = false;
    window.api.productoTieneMovimientos(productoEditar.id).then((res) => {
      if (!cancelado) {
        setTieneMovimientos(res.tieneMovimientos);
        setVerificandoMovimientos(false);
      }
    });
    return () => { cancelado = true; };
  }, [editando, productoEditar]);

  const checkboxBloqueado = editando && (verificandoMovimientos || tieneMovimientos);

  // Categoria actualmente elegida (si hay) y el tipo que resulta de todo esto.
  const categoriaObj = categorias.find((c) => c.nombre === form.categoria);
  const tipoActual = categoriaObj ? categoriaObj.tipo : (form.seVendePorUnidad ? 'equipo' : 'accesorio');

  // Moneda en la que se escribe el Costo: Bs. para SIM/USIM (se compran a Movistar en
  // bolivares), dolares para equipo/accesorio (se compran en Compras Telf/Acces en dolares).
  // Al editar, se usa el tipo YA GUARDADO del producto (estable, no depende de que carguen las
  // categorias) para decidir en que moneda mostrar el costo existente; mientras se esta creando
  // o cambiando de categoria, sigue la seleccion actual (tipoActual).
  const tipoParaMonedaCosto = editando ? productoEditar.tipo : tipoActual;
  const monedaCosto = (tipoParaMonedaCosto === 'simcard' || tipoParaMonedaCosto === 'usim') ? 'Bs' : 'USD';
  const tasaLista = tasaCambio !== null;
  const costoIngresado = parseFloat(form.costo_inicial) || 0;
  const costoUsdFinal = monedaCosto === 'Bs' ? costoIngresado / (tasaCambio || 1) : costoIngresado;

  // Al editar, precargar el Costo en la moneda correcta apenas se conoce la tasa real (si se
  // hiciera antes, con la tasa por defecto de 1, un costo en Bs se mostraria igual al numero en
  // USD guardado, que es justo el error que se queria evitar).
  useEffect(() => {
    if (editando && tasaLista) {
      const costoUsdGuardado = productoEditar.costo_promedio_usd || 0;
      const monedaCostoInicial = (productoEditar.tipo === 'simcard' || productoEditar.tipo === 'usim') ? 'Bs' : 'USD';
      const valor = monedaCostoInicial === 'Bs' ? costoUsdGuardado * tasaCambio : costoUsdGuardado;
      setForm((f) => ({ ...f, costo_inicial: String(Math.round(valor * 100) / 100) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasaLista]);

  // Si el producto ya tiene movimientos, solo se puede elegir "sin categoria" o una categoria
  // que quede del MISMO lado (accesorio, o "por unidad") en el que ya estaba el producto.
  // Cuando el modal se abre desde un modulo restringido (ej. "Compras" solo admite SIM/USIM),
  // "tiposPermitidos" acota ademas la lista a solo esos tipos, y obliga a elegir categoria
  // (no se puede dejar "sin categoria", porque ahi no habria forma de saber si es SIM o USIM).
  let categoriasDisponibles = checkboxBloqueado
    ? categorias.filter((c) => esIndividual(c.tipo) === esIndividual(productoEditar.tipo))
    : categorias;
  if (tiposPermitidos) {
    categoriasDisponibles = categoriasDisponibles.filter((c) => tiposPermitidos.includes(c.tipo));
  }

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const handleCategoriaChange = (e) => {
    const nuevaCategoria = e.target.value;
    const cat = categorias.find((c) => c.nombre === nuevaCategoria);
    setForm({
      ...form,
      categoria: nuevaCategoria,
      // Si se elige una categoria, el checkbox se sincroniza solo para reflejar su tipo (queda
      // deshabilitado mientras haya categoria elegida, ver mas abajo).
      seVendePorUnidad: cat ? esIndividual(cat.tipo) : form.seVendePorUnidad
    });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!form.nombre.trim()) { setError('La descripcion es obligatoria'); return; }
    if (tiposPermitidos && !form.categoria) {
      setError('Elige una categoría (necesaria para saber si es SIM o USIM)');
      return;
    }
    const tipo = tipoActual;
    const codigoLimpio = form.codigo_producto.trim();
    if (tipo !== 'accesorio' && !codigoLimpio) {
      setError('El codigo es obligatorio para productos que se venden por unidad (requieren IMEI/codigo individual)');
      return;
    }

    setGuardando(true);
    try {
      if (editando) {
        const tipoCambio = tipo !== productoEditar.tipo;
        const res = await window.api.updateProduct(productoEditar.id, {
          tipo,
          nombre: form.nombre.trim(),
          // Si el tipo cambia, la categoria vieja (pensada para el tipo anterior) ya no aplica.
          categoria: tipoCambio ? '' : form.categoria,
          precio: precioBsCalculado,
          precio2: parseFloat(form.precio2) || 0,
          stock_minimo: parseInt(form.stock_minimo, 10) || 0,
          codigo_barras: tipo === 'accesorio' ? (productoEditar.codigo_barras || '') : '',
          codigo_producto: codigoLimpio || ''
        });
        if (!res.ok) {
          setError(res.message || 'No se pudo guardar el producto');
          return;
        }
        // El costo (costo promedio) se guarda por una via separada del resto de los datos.
        const nuevoCosto = costoUsdFinal;
        if (nuevoCosto !== (productoEditar.costo_promedio_usd || 0)) {
          const resCosto = await window.api.updateProductCosto(productoEditar.id, nuevoCosto);
          if (!resCosto.ok) {
            setError(resCosto.message || 'No se pudo actualizar el costo');
            return;
          }
        }
        onConfirm({
          ...productoEditar,
          tipo,
          categoria: tipoCambio ? '' : form.categoria,
          nombre: form.nombre.trim(),
          codigo_producto: codigoLimpio || null,
          precio: precioBsCalculado,
          precio2: parseFloat(form.precio2) || 0,
          costo_promedio_usd: nuevoCosto
        });
        return;
      }

      const res = await window.api.createProduct({
        tipo,
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        precio: precioBsCalculado,
        precio2: parseFloat(form.precio2) || 0,
        stock_minimo: parseInt(form.stock_minimo, 10) || 0,
        costo_inicial: costoUsdFinal,
        codigo_producto: codigoLimpio || null
      });
      if (!res.ok) {
        setError(res.message || 'No se pudo crear el producto');
        return;
      }
      // El handler products:create solo devuelve el id; se arma aqui el objeto con los mismos
      // campos que devuelve la busqueda de productos, para poder seguir de inmediato con el
      // renglon de Cantidad sin tener que volver a buscarlo.
      onConfirm({
        id: res.id,
        tipo,
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        codigo_producto: codigoLimpio || null,
        precio: precioBsCalculado,
        precio2: parseFloat(form.precio2) || 0,
        stock_minimo: parseInt(form.stock_minimo, 10) || 0,
        costo_promedio_usd: costoUsdFinal,
        stock_disponible: 0
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  const filtroLower = filtroLista.trim().toLowerCase();
  const productosFiltrados = filtroLower
    ? productos.filter((p) =>
        (p.nombre || '').toLowerCase().includes(filtroLower) ||
        (p.codigo_producto || '').toLowerCase().includes(filtroLower))
    : productos;

  return (
    <div style={overlayStyle} onKeyDown={handleKeyDown}>
      <div style={boxStyle}>
        <div style={headerStyle}>{editando ? 'EDITAR PRODUCTO' : 'PRODUCTO NUEVO'}</div>
        <div style={{ display: 'flex' }}>
          <form onSubmit={handleSubmit} style={{ padding: '1rem 1.2rem 1.2rem', width: '360px', flexShrink: 0 }}>
            <Campo label="Codigo">
              <input autoFocus value={form.codigo_producto} onChange={set('codigo_producto')}
                placeholder="Ej: ss24" style={inputStyle} />
            </Campo>

            <Campo label="Descripcion" required>
              <input value={form.nombre} onChange={set('nombre')}
                placeholder="Nombre del producto" style={inputStyle} />
            </Campo>

            <Campo label={tiposPermitidos ? 'Categoría' : 'Categoría (opcional)'} required={!!tiposPermitidos}>
              <select
                value={form.categoria}
                onChange={handleCategoriaChange}
                style={inputStyle}
              >
                {!tiposPermitidos && <option value="">-- Sin categoría --</option>}
                {tiposPermitidos && !form.categoria && <option value="">-- Elige una --</option>}
                {categoriasDisponibles.map((c) => (
                  <option key={c.id} value={c.nombre}>{c.nombre}</option>
                ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: '#98a2b3', margin: '4px 0 0' }}>
                {tiposPermitidos
                  ? 'Este módulo solo admite estas categorías.'
                  : 'El tipo del producto (equipo, SIM, USIM o accesorio) se toma de la categoría elegida. Si no eliges categoría, se usa el check de "Se vende por unidad" de abajo.'}
              </p>
            </Campo>

            <Campo label={monedaCosto === 'Bs' ? `Costo (Bs.)` : 'Costo ($)'}>
              <input type="number" step="0.01" min="0" value={form.costo_inicial} onChange={set('costo_inicial')}
                placeholder="0.00" style={inputStyle} />
              {monedaCosto === 'Bs' ? (
                <p style={{ fontSize: '0.72rem', color: '#98a2b3', margin: '4px 0 0' }}>
                  {tasaLista
                    ? `≈ $${fmt(costoUsdFinal)} USD (tasa ${fmt(tasaCambio)})`
                    : 'Cargando tasa del día...'}
                </p>
              ) : (
                <p style={{ fontSize: '0.72rem', color: '#98a2b3', margin: '4px 0 0' }}>
                  Este tipo de producto se compra en dólares, así que el costo se escribe directo en $.
                </p>
              )}
            </Campo>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <Campo label="Precio Dólares">
                  <input type="number" step="0.01" min="0" value={form.precio2} onChange={set('precio2')}
                    placeholder="0.00" style={inputStyle} autoFocus={editando} />
                </Campo>
              </div>
              <div style={{ flex: 1 }}>
                <Campo label={`Precio Bs. (tasa ${tasaLista ? fmt(tasaCambio) : '...'})`}>
                  <div style={{ ...inputStyle, background: '#f4f6f8', color: '#475467' }}>
                    Bs {fmt(precioBsCalculado)}
                  </div>
                </Campo>
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#98a2b3', margin: '-6px 0 10px' }}>
              El Precio Bs. se calcula solo (Precio Dólares × tasa del día) y se actualiza cada
              vez que cambie la tasa. No se guarda un monto fijo en bolívares.
            </p>

            <Campo label="Stock mínimo (opcional)">
              <input type="number" step="1" min="0" value={form.stock_minimo} onChange={set('stock_minimo')}
                placeholder="Ej: 5" style={inputStyle} />
              <p style={{ fontSize: '0.72rem', color: '#98a2b3', margin: '4px 0 0' }}>
                Si lo dejas vacío, no se avisará cuando el stock esté bajo para este producto.
              </p>
            </Campo>

            {!tiposPermitidos && (
              <div style={{ margin: '10px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: (checkboxBloqueado || !!categoriaObj) ? '#98a2b3' : '#333', cursor: (checkboxBloqueado || !!categoriaObj) ? 'default' : 'pointer' }}>
                  <SwitchToggle
                    checked={form.seVendePorUnidad}
                    disabled={checkboxBloqueado || !!categoriaObj}
                    onChange={(valor) => setForm({ ...form, seVendePorUnidad: valor })}
                  />
                  Se vende por unidad (requiere código/IMEI individual, ej. equipos, SIM, USIM)
                </label>
                {!!categoriaObj && (
                  <p style={{ fontSize: '0.75rem', color: '#475467', margin: '4px 0 0' }}>
                    Determinado por la categoría "{categoriaObj.nombre}" — tipo: {TIPO_LABEL[categoriaObj.tipo]}.
                  </p>
                )}
                {!categoriaObj && editando && tieneMovimientos && (
                  <p style={{ fontSize: '0.75rem', color: '#98a2b3', margin: '4px 0 0' }}>
                    El tipo de producto no se puede cambiar: ya tiene compras, ventas o unidades registradas.
                  </p>
                )}
                {!categoriaObj && editando && !verificandoMovimientos && !tieneMovimientos && (
                  <p style={{ fontSize: '0.75rem', color: '#0b8f4e', margin: '4px 0 0' }}>
                    Puedes cambiar esta opción: el producto todavía no tiene compras, ventas ni unidades registradas.
                  </p>
                )}
              </div>
            )}

            {error && <p style={{ color: '#b42318', fontSize: '0.85rem', marginTop: '4px' }}>{error}</p>}

            <div style={footerStyle}>
              <button type="button" onClick={onCancel} style={btnCancelar}>
                ESC &nbsp;Cancelar
              </button>
              <button type="submit" disabled={guardando} style={btnAceptar}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar'}
              </button>
            </div>
          </form>

          <div style={listaWrapStyle}>
            <div style={{ fontSize: '0.8rem', color: '#333', marginBottom: '6px', fontWeight: 'bold' }}>
              Productos ya registrados
            </div>
            <input
              value={filtroLista}
              onChange={(e) => setFiltroLista(e.target.value)}
              placeholder="Filtrar..."
              style={{ ...inputStyle, marginBottom: '8px' }}
            />
            <div style={listaScrollStyle}>
              {productosFiltrados.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#98a2b3', fontSize: '0.8rem' }}>
                  No hay productos que coincidan.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, background: '#f4f6f8' }}>
                      <th style={thStyle}>Código</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={thStyleCentrado}>Costo</th>
                      <th style={thStyleCentrado}>Precio $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                        <td style={tdStyle}>{p.codigo_producto || '—'}</td>
                        <td style={tdStyle}>{p.nombre}</td>
                        <td style={tdStyleCentrado}>${fmt(p.costo_promedio_usd)}</td>
                        <td style={tdStyleCentrado}>${fmt(p.precio2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, required, children }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', color: '#333', marginBottom: '3px' }}>
        {label} {required && <span style={{ color: '#d92d20' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// Switch azul/gris reutilizable para activar/desactivar opciones (reemplaza los checkboxes de
// tilde). Azul (#0b4f9e, el mismo azul de marca que el resto del programa) cuando esta activado,
// gris cuando esta desactivado. Mismo comportamiento que un checkbox: recibe checked/disabled y
// avisa el nuevo valor por onChange(valor).
export function SwitchToggle({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: '38px',
        height: '20px',
        borderRadius: '999px',
        border: 'none',
        padding: '2px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        background: disabled ? '#e2e8f0' : (checked ? '#0b4f9e' : '#c7ccd4'),
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s ease',
        flexShrink: 0
      }}
    >
      <span
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          transition: 'transform 0.15s ease'
        }}
      />
    </button>
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
  width: '760px',
  maxWidth: '95vw',
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

const inputStyle = {
  width: '100%',
  padding: '7px 8px',
  border: '1px solid #c7ccd4',
  borderRadius: '5px',
  fontSize: '0.9rem'
};

const footerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '10px',
  marginTop: '12px',
  paddingTop: '10px',
  borderTop: '1px solid #eee'
};

const btnAceptar = {
  padding: '8px 16px',
  background: '#0b8f4e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const btnCancelar = {
  padding: '8px 16px',
  background: '#e2e8f0',
  color: '#333',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};

const listaWrapStyle = {
  flex: 1,
  borderLeft: '1px solid #eee',
  padding: '1rem 1.2rem 1.2rem',
  minWidth: '300px'
};

const listaScrollStyle = {
  maxHeight: '360px',
  overflowY: 'auto',
  border: '1px solid #e2e8f0',
  borderRadius: '6px'
};

const thStyle = {
  padding: '5px 6px',
  borderBottom: '1px solid #e2e8f0',
  color: '#475467'
};

const thStyleCentrado = {
  ...thStyle,
  textAlign: 'center'
};

const tdStyle = {
  padding: '5px 6px'
};

const tdStyleCentrado = {
  ...tdStyle,
  textAlign: 'center'
};
