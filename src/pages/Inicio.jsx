import React, { useEffect, useState } from 'react';
import NotificacionesBell from '../components/NotificacionesBell.jsx';

// Dashboard de la pantalla de Inicio: solo CANTIDADES vendidas y tendencias (nunca montos de
// dinero), tomadas de datos reales via window.api.getDashboardInicio(). Los graficos son SVG
// simples hechos a mano (sin agregar ninguna libreria nueva al proyecto), en el mismo espiritu
// visual de la referencia que se paso, pero reducidos a los mas importantes para no saturar la
// pantalla.

const AZUL = '#0b4f9e';
const AZUL_CLARO = '#bfd7f5';
const VERDE = '#0b8f4e';
const ROJO = '#b42318';
const GRIS = '#98a2b3';

const TIPO_COLOR = { equipo: AZUL, simcard: '#1d78c9', usim: '#5aa9e6', accesorio: '#9cc6f2' };

// Recorta una etiqueta si es muy larga, para que quepa en la barra/anillo sin desbordarse
// cuando hay muchas categorias en pantalla al mismo tiempo.
function recortarEtiqueta(texto, maxLargo) {
  if (!texto) return '';
  return texto.length > maxLargo ? `${texto.slice(0, maxLargo - 1)}…` : texto;
}

function formatFechaCorta(fechaISO) {
  const [, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}`;
}

// ---- Grafico de linea (Ventas Totales por dia) ----
// preserveAspectRatio="none" + un contenedor de alto FIJO en px (en vez de dejar que el alto
// se escale junto con el ancho) es lo que garantiza que el grafico ocupe siempre el mismo
// espacio vertical sin importar que tan ancha sea la ventana - asi el dashboard completo entra
// sin tener que scrolear.
function LineChart({ datos }) {
  const ancho = 640;
  const alto = 90;
  const padIzq = 30;
  const padDer = 8;
  const padTop = 8;
  const padAbajo = 18;
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  const pasoX = (ancho - padIzq - padDer) / Math.max(1, datos.length - 1);
  const escalaY = (v) => padTop + (alto - padTop - padAbajo) * (1 - v / max);
  const puntos = datos.map((d, i) => [padIzq + i * pasoX, escalaY(d.cantidad)]);
  const lineaPath = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${lineaPath} L${puntos[puntos.length - 1][0].toFixed(1)},${alto - padAbajo} L${puntos[0][0].toFixed(1)},${alto - padAbajo} Z`;

  // Etiquetas de fecha: solo cada ~5 dias para que no se amontonen.
  const cadaCuanto = Math.max(1, Math.round(datos.length / 6));

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={padIzq} x2={ancho - padDer} y1={escalaY(max * f)} y2={escalaY(max * f)} stroke="#eef1f5" strokeWidth="1" />
      ))}
      <path d={areaPath} fill={AZUL_CLARO} opacity="0.35" />
      <path d={lineaPath} fill="none" stroke={AZUL} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {puntos.map((p, i) => (
        i === puntos.length - 1 && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={AZUL} />
      ))}
      {datos.map((d, i) => (
        i % cadaCuanto === 0 && (
          <text key={d.fecha} x={padIzq + i * pasoX} y={alto - 4} fontSize="8" fill={GRIS} textAnchor="middle">
            {formatFechaCorta(d.fecha)}
          </text>
        )
      ))}
    </svg>
  );
}

// ---- Grafico de barras verticales simple (categorias o precios de SimCard) ----
// El tamano de letra y el largo permitido de las etiquetas se reducen automaticamente segun
// cuantas barras hay que mostrar, para que, sin importar cuantas categorias existan, todas
// quepan en el mismo espacio fijo sin que el texto se amontone o se salga del cuadro.
function BarChart({ datos, colorBarra, coloresPorEtiqueta }) {
  const ancho = 300;
  const alto = 90;
  const padIzq = 6;
  const padDer = 6;
  const padTop = 12;
  const padAbajo = 20;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const anchoBarra = (ancho - padIzq - padDer) / datos.length;

  const cant = datos.length;
  const fontValor = cant <= 4 ? 9 : cant <= 6 ? 8 : cant <= 8 ? 7 : 6;
  const fontEtiqueta = cant <= 4 ? 8.5 : cant <= 6 ? 7.5 : cant <= 8 ? 6.5 : 5.5;
  const maxLargoEtiqueta = cant <= 4 ? 12 : cant <= 6 ? 9 : cant <= 8 ? 7 : 5;

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {datos.map((d, i) => {
        const alturaBarra = (alto - padTop - padAbajo) * (d.valor / max);
        const x = padIzq + i * anchoBarra + anchoBarra * 0.18;
        const anchoReal = anchoBarra * 0.64;
        const y = alto - padAbajo - alturaBarra;
        const color = (coloresPorEtiqueta && coloresPorEtiqueta[d.etiqueta]) || colorBarra || AZUL;
        return (
          <g key={d.etiqueta}>
            <rect x={x} y={y} width={anchoReal} height={Math.max(alturaBarra, 1)} rx="2.5" fill={color} />
            <text x={x + anchoReal / 2} y={y - 3} fontSize={fontValor} fill="#344054" textAnchor="middle" fontWeight="600">
              {d.valor}
            </text>
            <text x={x + anchoReal / 2} y={alto - padAbajo + 12} fontSize={fontEtiqueta} fill={GRIS} textAnchor="middle">
              {recortarEtiqueta(d.etiqueta, maxLargoEtiqueta)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---- Anillo/dona de tendencia (porcentaje de cambio) ----
// "escala" encoge el anillo completo (y su letra) cuando hay muchas categorias que mostrar a la
// vez, para que todos los anillos sigan cabiendo en una sola fila sin desbordar la tarjeta.
function AnilloTendencia({ pct, etiqueta, escala = 1 }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const positivo = pct >= 0;
  const color = positivo ? VERDE : ROJO;
  // Se limita visualmente el anillo a 100% de vuelta (aunque el numero real pueda ser mayor),
  // para que el dibujo nunca "de mas de una vuelta".
  const fraccion = Math.min(Math.abs(pct), 100) / 100;
  const offset = circ * (1 - fraccion);
  const tamano = Math.round(62 * escala);
  const maxLargoEtiqueta = escala >= 0.85 ? 16 : escala >= 0.7 ? 12 : 9;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', width: `${tamano + 6}px` }}>
      <svg width={tamano} height={tamano} viewBox="0 0 62 62">
        <circle cx="31" cy="31" r={r} fill="none" stroke="#eef1f5" strokeWidth="6" />
        <circle
          cx="31" cy="31" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 31 31)"
        />
        <text x="31" y="35" fontSize="11" fontWeight="700" fill={color} textAnchor="middle">
          {positivo ? '+' : ''}{pct}%
        </text>
      </svg>
      <span style={{ fontSize: `${Math.max(0.55, 0.68 * escala)}rem`, color: '#475467', textAlign: 'center', fontWeight: 600 }}>
        {recortarEtiqueta(etiqueta, maxLargoEtiqueta)}
      </span>
    </div>
  );
}

const cardStyle = {
  background: '#fff',
  borderRadius: '10px',
  padding: '10px 14px',
  boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
  border: '1px solid #eef1f5'
};

export default function Inicio({ user }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [settings, setSettings] = useState(null);
  // Version instalada: antes se mostraba chiquita debajo del logo en el menu vertical, ahora
  // se pide aqui para mostrarla centrada al pie de Inicio, debajo de "Resumen y tendencias".
  const [versionApp, setVersionApp] = useState('');

  useEffect(() => {
    window.api.getDashboardInicio().then((res) => {
      setDatos(res);
      setCargando(false);
    });
  }, []);

  useEffect(() => { window.api.getVersion().then(setVersionApp); }, []);

  // El logo configurado en Configuracion > Datos de Tienda ya NO se imprime en la Factura/Nota
  // de Venta (se quito de ahi a proposito); en su lugar se muestra aqui, en la esquina superior
  // derecha de Inicio, al otro extremo de "Bienvenido".
  useEffect(() => { window.api.getSettings().then(setSettings); }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NotificacionesBell />
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Bienvenido, {user.full_name}</h1>
        </div>
        {settings?.logo_base64 && (
          <img
            src={settings.logo_base64}
            alt="Logo de la tienda"
            style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain' }}
          />
        )}
      </div>
      <p style={{ color: '#667085', marginTop: 0, marginBottom: '0.6rem', fontSize: '0.82rem' }}>
        Resumen de actividad de ventas de los últimos 30 días. Usa el menú para facturar, ver el
        historial o gestionar el inventario.
      </p>

      {cargando && <p style={{ color: GRIS }}>Cargando estadísticas...</p>}

      {!cargando && datos && datos.totalGeneral === 0 && (
        <div style={cardStyle}>
          <p style={{ color: GRIS, margin: 0 }}>
            Todavía no hay ventas registradas en los últimos 30 días. En cuanto factures o
            registres una Nota de Venta, aquí van a aparecer las tendencias.
          </p>
        </div>
      )}

      {!cargando && datos && datos.totalGeneral > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={cardStyle}>
            <h3 style={{ margin: 0, fontSize: '0.9rem' }}>📈 Ventas Totales (unidades por día)</h3>
            <p style={{ fontSize: '0.68rem', color: GRIS, margin: '1px 0 4px' }}>
              Últimos 30 días — incluye Factura y Nota de Venta.
            </p>
            <div style={{ height: '80px' }}>
              <LineChart datos={datos.ventasPorDia} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ ...cardStyle, flex: '1 1 280px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Ventas por categoría</h3>
              <div style={{ height: '90px', marginTop: '4px' }}>
                {/* Se muestran TODAS las categorias con ventas (incluye las que se creen nuevas,
                    ej. "Otros"), ordenadas de mas a menos vendida. El propio BarChart encoge
                    letras/barras solas segun cuantas haya, para que quepan siempre en el mismo
                    espacio. Si hay mas de las que caben, el backend ya recorto a las mas
                    vendidas y "categoriasOmitidas" avisa cuantas quedaron afuera. */}
                <BarChart
                  colorBarra={AZUL}
                  datos={datos.categorias.map((c) => ({ etiqueta: c.etiqueta, valor: c.cantidad }))}
                />
              </div>
              {datos.categoriasOmitidas > 0 && (
                <p style={{ fontSize: '0.62rem', color: GRIS, margin: '4px 0 0', textAlign: 'right' }}>
                  +{datos.categoriasOmitidas} categoría(s) más con menos ventas, no mostrada(s) por espacio.
                </p>
              )}
            </div>

            <div style={{ ...cardStyle, flex: '1 1 280px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Ventas de SimCard por precio</h3>
              {datos.simcardPorPrecio.length === 0 ? (
                <p style={{ color: GRIS, fontSize: '0.78rem' }}>Aún no se han vendido SimCard en este período.</p>
              ) : (
                <div style={{ height: '90px', marginTop: '4px' }}>
                  <BarChart
                    colorBarra={TIPO_COLOR.simcard}
                    datos={datos.simcardPorPrecio.map((p) => ({ etiqueta: `$${p.precio}`, valor: p.cantidad }))}
                  />
                </div>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Resumen y tendencias</h3>
            <p style={{ fontSize: '0.68rem', color: GRIS, margin: '1px 0 6px' }}>
              Compara la 2da mitad de los últimos 30 días contra la 1ra mitad (en unidades vendidas).
            </p>
            {/* Un anillo por "Total de ventas" mas uno por cada categoria con ventas (misma lista
                que la grafica de barras de arriba). La escala se reduce automaticamente mientras
                mas anillos haya, para que todos sigan cabiendo en una sola fila. */}
            {(() => {
              const totalAnillos = datos.categorias.length + 1;
              const escala = totalAnillos <= 5 ? 1 : totalAnillos <= 7 ? 0.82 : totalAnillos <= 9 ? 0.68 : 0.58;
              return (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'space-around' }}>
                  <AnilloTendencia pct={datos.tendenciaTotalPct} etiqueta="Total de ventas" escala={escala} />
                  {datos.categorias.map((c) => (
                    <AnilloTendencia key={c.clave} pct={c.tendenciaPct} etiqueta={c.etiqueta} escala={escala} />
                  ))}
                </div>
              );
            })()}
          </div>

          {versionApp && (
            <p style={{ textAlign: 'center', fontSize: '0.7rem', color: GRIS, marginTop: '0.75rem' }}>
              Version {versionApp}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
