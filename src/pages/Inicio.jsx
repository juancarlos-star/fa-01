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

const TIPO_LABEL = { equipo: 'Teléfonos', simcard: 'SIM (ICCID)', usim: 'USIM', accesorio: 'Accesorios' };
const TIPO_COLOR = { equipo: AZUL, simcard: '#1d78c9', usim: '#5aa9e6', accesorio: '#9cc6f2' };

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
function BarChart({ datos, colorBarra }) {
  const ancho = 300;
  const alto = 90;
  const padIzq = 6;
  const padDer = 6;
  const padTop = 12;
  const padAbajo = 20;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const anchoBarra = (ancho - padIzq - padDer) / datos.length;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
      {datos.map((d, i) => {
        const alturaBarra = (alto - padTop - padAbajo) * (d.valor / max);
        const x = padIzq + i * anchoBarra + anchoBarra * 0.18;
        const anchoReal = anchoBarra * 0.64;
        const y = alto - padAbajo - alturaBarra;
        return (
          <g key={d.etiqueta}>
            <rect x={x} y={y} width={anchoReal} height={Math.max(alturaBarra, 1)} rx="2.5" fill={colorBarra || AZUL} />
            <text x={x + anchoReal / 2} y={y - 3} fontSize="9" fill="#344054" textAnchor="middle" fontWeight="600">
              {d.valor}
            </text>
            <text x={x + anchoReal / 2} y={alto - padAbajo + 12} fontSize="8.5" fill={GRIS} textAnchor="middle">
              {d.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---- Anillo/dona de tendencia (porcentaje de cambio) ----
function AnilloTendencia({ pct, etiqueta }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const positivo = pct >= 0;
  const color = positivo ? VERDE : ROJO;
  // Se limita visualmente el anillo a 100% de vuelta (aunque el numero real pueda ser mayor),
  // para que el dibujo nunca "de mas de una vuelta".
  const fraccion = Math.min(Math.abs(pct), 100) / 100;
  const offset = circ * (1 - fraccion);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      <svg width="62" height="62" viewBox="0 0 62 62">
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
      <span style={{ fontSize: '0.68rem', color: '#475467', textAlign: 'center', fontWeight: 600 }}>{etiqueta}</span>
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

  useEffect(() => {
    window.api.getDashboardInicio().then((res) => {
      setDatos(res);
      setCargando(false);
    });
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
        <NotificacionesBell />
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Bienvenido, {user.full_name}</h1>
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
                <BarChart
                  colorBarra={AZUL}
                  datos={['equipo', 'simcard', 'usim', 'accesorio'].map((t) => ({
                    etiqueta: TIPO_LABEL[t],
                    valor: datos.porCategoria[t] || 0
                  }))}
                />
              </div>
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
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'space-around' }}>
              <AnilloTendencia pct={datos.tendenciaTotalPct} etiqueta="Total de ventas" />
              <AnilloTendencia pct={datos.tendenciaPorCategoria.equipo} etiqueta="Teléfonos" />
              <AnilloTendencia pct={datos.tendenciaPorCategoria.simcard} etiqueta="SIM (ICCID)" />
              <AnilloTendencia pct={datos.tendenciaPorCategoria.usim} etiqueta="USIM" />
              <AnilloTendencia pct={datos.tendenciaPorCategoria.accesorio} etiqueta="Accesorios" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
