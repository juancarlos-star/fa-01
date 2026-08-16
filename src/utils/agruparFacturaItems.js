// Agrupa items de una factura (o del carrito antes de emitirla) por producto,
// para mostrar una sola fila por producto en vez de una fila por unidad/codigo.
// La cantidad se suma y los codigos (IMEI/ICCID/USIM) se juntan en una lista
// para mostrarse en columna dentro de la misma celda, sin sobreponerse con
// ningun otro dato.
//
// Sirve tanto para items del carrito (con .key, .precio_unitario) como para
// items ya guardados en la base de datos (con .id, .precio_unitario_usd,
// .subtotal_usd).
export function agruparItemsPorProducto(items) {
  const grupos = [];
  const indicePorProducto = new Map();

  for (const item of items) {
    const key = item.product_id;
    let grupo = indicePorProducto.get(key);
    if (!grupo) {
      grupo = {
        product_id: item.product_id,
        descripcion: item.descripcion,
        precio_unitario: item.precio_unitario_usd ?? item.precio_unitario ?? 0,
        cantidad: 0,
        codigos: [],
        subtotal: 0,
        keys: []
      };
      indicePorProducto.set(key, grupo);
      grupos.push(grupo);
    }
    const cantidadItem = item.cantidad || 0;
    grupo.cantidad += cantidadItem;
    const subtotalItem =
      item.subtotal_usd ?? cantidadItem * (item.precio_unitario_usd ?? item.precio_unitario ?? 0);
    grupo.subtotal += subtotalItem;
    if (item.codigo) grupo.codigos.push(item.codigo);
    if (item.key !== undefined) grupo.keys.push(item.key);
  }

  return grupos;
}
