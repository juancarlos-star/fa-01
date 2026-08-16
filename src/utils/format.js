// Formato numerico usado en toda la app: punto como separador de miles y
// coma para los decimales (ej: 1.234.567,50), como es habitual en Venezuela/España.

export function fmt(valor, decimales = 2) {
  const num = Number(valor);
  if (Number.isNaN(num)) {
    return (0).toLocaleString('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }
  return num.toLocaleString('es-VE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
