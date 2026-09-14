// Utilidades compartidas para mostrar el desglose de pago (factura_pagos / apartado_abono_pagos)
// tanto en el PDF de Factura/Nota de Venta como en el Recibo de Abono, para que ambos
// documentos usen exactamente la misma redaccion.

// Convierte el codigo interno guardado en BD ('efectivo','tarjeta','transferencia',
// 'pago_movil','otro') en el texto que se muestra al cliente.
export function etiquetaMetodoPago(metodo) {
  switch (metodo) {
    case 'efectivo': return 'Efectivo';
    case 'tarjeta': return 'Tarjeta';
    case 'transferencia': return 'Transferencia';
    case 'pago_movil': return 'Pago móvil';
    case 'otro': return 'Otro';
    default: return metodo || 'Otro';
  }
}

// Arma la linea de texto de UN pago tal como se imprime, ej: "Efectivo: $20.00" o
// "Transferencia: Bs 1.234,56". fmt es la funcion de formato de numeros ya usada en el resto
// de los PDF (src/utils/format.js), se recibe por parametro para no duplicarla ni crear un
// ciclo de imports.
export function formatearLineaPago(pago, fmt) {
  const monto = pago.moneda === 'Bs' ? `Bs ${fmt(pago.monto)}` : `$${fmt(pago.monto)}`;
  return `${etiquetaMetodoPago(pago.metodo)}: ${monto}`;
}
