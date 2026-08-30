const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  // Autenticacion y usuarios
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (data) => ipcRenderer.invoke('users:create', data),
  updateUser: (id, data) => ipcRenderer.invoke('users:update', { id, ...data }),
  toggleUserActive: (id) => ipcRenderer.invoke('users:toggleActive', { id }),
  changePassword: (id, newPassword) => ipcRenderer.invoke('users:changePassword', { id, newPassword }),
  // Categorias
  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (nombre) => ipcRenderer.invoke('categories:create', { nombre }),
  updateCategory: (id, nombre) => ipcRenderer.invoke('categories:update', { id, nombre }),
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', { id }),
  getCategoryImpact: (id) => ipcRenderer.invoke('categories:impacto', { id }),
  // Inventario - productos
  // depositoId es opcional en listProducts y buscarProductoPorCodigo: cuando se indica, el
  // stock_disponible que devuelven es SOLO el de ese deposito (usado en Facturacion, Compras
  // y Cargos/Descargos). Sin depositoId, se sigue devolviendo el total (Inventario/Reportes).
  listProducts: (tipo, categoria, depositoId) => ipcRenderer.invoke('products:list', { tipo, categoria, depositoId }),
  listProductNames: (tipo, categoria) => ipcRenderer.invoke('products:names', { tipo, categoria }),
  createProduct: (data) => ipcRenderer.invoke('products:create', data),
  updateProduct: (id, data) => ipcRenderer.invoke('products:update', { id, ...data }),
  productoTieneMovimientos: (id) => ipcRenderer.invoke('products:tieneMovimientos', { id }),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', { id }),
  buscarProductoPorCodigo: (codigo, depositoId) => ipcRenderer.invoke('products:buscarPorCodigo', { codigo, depositoId }),
  listUnidadesDisponibles: (productId, depositoId) => ipcRenderer.invoke('products:unidadesDisponibles', { productId, depositoId }),
  addProductStock: (id, cantidad, costoUnitario, usuario) =>
    ipcRenderer.invoke('products:addStock', { id, cantidad, costoUnitario, usuario }),
  writeOffProductStock: (id, cantidad, motivo, usuario) =>
    ipcRenderer.invoke('products:writeOffStock', { id, cantidad, motivo, usuario }),
  // Inventario - unidades
  // depositoId es opcional: si se indica, solo trae las unidades de ese deposito (Facturacion,
  // Cargos/Descargos). Sin depositoId trae todas (Inventario).
  listUnits: (productId, depositoId) => ipcRenderer.invoke('units:list', { product_id: productId, depositoId }),
  addUnit: (productId, codigo, costoUnitario, usuario) =>
    ipcRenderer.invoke('units:add', { product_id: productId, codigo, costoUnitario, usuario }),
  addUnitsRange: (productId, codigoInicio, codigoFin, costoUnitario, usuario) =>
    ipcRenderer.invoke('units:addRange', { product_id: productId, codigoInicio, codigoFin, costoUnitario, usuario }),
  addUnitsBatch: (productId, codigos, costoUnitario, usuario) =>
    ipcRenderer.invoke('units:addBatch', { product_id: productId, codigos, costoUnitario, usuario }),
  deleteUnit: (id) => ipcRenderer.invoke('units:delete', { id }),
  updateUnitCodigo: (id, codigo) => ipcRenderer.invoke('units:updateCodigo', { id, codigo }),
  writeOffUnit: (id, motivo, usuario) => ipcRenderer.invoke('units:writeOff', { id, motivo, usuario }),
  writeOffUnitsBatch: (ids, motivo, usuario) => ipcRenderer.invoke('units:writeOffBatch', { ids, motivo, usuario }),
  // Historial de descargos
  listDescargos: () => ipcRenderer.invoke('descargos:list'),
  // Documento de Cargo/Descargo con varios items (incluso de productos distintos, mezclados
  // en un mismo procedimiento).
  crearDocumentoCargoDescargo: (payload) => ipcRenderer.invoke('cargosDescargos:crearDocumento', payload),
  // Configuracion
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (values) => ipcRenderer.invoke('settings:update', values),
  generarNotificaciones: () => ipcRenderer.invoke('notificaciones:generar'),
  listarNotificaciones: () => ipcRenderer.invoke('notificaciones:listar'),
  marcarNotificacionesLeidas: () => ipcRenderer.invoke('notificaciones:marcarLeidas'),
  // Clientes
  listClientes: () => ipcRenderer.invoke('clientes:list'),
  searchClientes: (query) => ipcRenderer.invoke('clientes:search', { query }),
  buscarClientePorCedula: (cedula) => ipcRenderer.invoke('clientes:buscarPorCedula', { cedula }),
  createCliente: (data) => ipcRenderer.invoke('clientes:create', data),
  updateCliente: (id, data) => ipcRenderer.invoke('clientes:update', { id, ...data }),
  // Proveedores (modulo de Compras)
  listProveedores: () => ipcRenderer.invoke('proveedores:list'),
  buscarProveedorPorRif: (rif) => ipcRenderer.invoke('proveedores:buscarPorRif', { rif }),
  createProveedor: (data) => ipcRenderer.invoke('proveedores:create', data),
  updateProveedor: (id, data) => ipcRenderer.invoke('proveedores:update', { id, ...data }),
  // Depositos (almacenes)
  listDepositos: (soloActivos) => ipcRenderer.invoke('depositos:list', { soloActivos }),
  createDeposito: (data) => ipcRenderer.invoke('depositos:create', data),
  updateDeposito: (id, data) => ipcRenderer.invoke('depositos:update', { id, ...data }),
  toggleDepositoActive: (id) => ipcRenderer.invoke('depositos:toggleActive', { id }),

  crearTraslado: (data) => ipcRenderer.invoke('traslados:crear', data),
  listarTraslados: (filtros) => ipcRenderer.invoke('traslados:listar', filtros),
  detalleTraslado: (id) => ipcRenderer.invoke('traslados:detalle', { id }),
  // Facturacion
  crearFactura: (payload) => ipcRenderer.invoke('facturas:crear', payload),
  listFacturas: () => ipcRenderer.invoke('facturas:list'),
  detalleFactura: (id) => ipcRenderer.invoke('facturas:detalle', { id }),
  eliminarFactura: (id) => ipcRenderer.invoke('facturas:eliminar', { id }),
  buscarFacturaPorNumero: (numero) => ipcRenderer.invoke('facturas:buscarPorNumero', { numero }),
  proximoNumeroDevolucionFactura: () => ipcRenderer.invoke('facturas:proximoNumeroDevolucion'),
  crearDevolucionFactura: (payload) => ipcRenderer.invoke('facturas:crearDevolucion', payload),
  // Compras y costos
  listCompras: (desde, hasta) => ipcRenderer.invoke('compras:list', { desde, hasta }),
  crearCompraLote: (payload) => ipcRenderer.invoke('compras:crearLote', payload),
  codigoExiste: (data) => ipcRenderer.invoke('inventario:codigoExiste', data),
  codigosExisten: (codigos) => ipcRenderer.invoke('inventario:codigosExisten', { codigos }),
  buscarPorCodigo: (codigo) => ipcRenderer.invoke('inventario:buscarPorCodigo', { codigo }),
  listComprasEncabezados: () => ipcRenderer.invoke('compras:listEncabezados'),
  detalleCompraEncabezado: (id) => ipcRenderer.invoke('compras:detalleEncabezado', { id }),
  buscarCompraPorDocumento: (documento) => ipcRenderer.invoke('compras:buscarPorDocumento', { documento }),
  crearDevolucionCompra: (payload) => ipcRenderer.invoke('compras:crearDevolucion', payload),
  proximoNumeroCompra: () => ipcRenderer.invoke('compras:proximoNumero'),
  proximoNumeroDevolucion: () => ipcRenderer.invoke('compras:proximoNumeroDevolucion'),
  calcularRangoCompra: (codigoInicio, codigoFin) => ipcRenderer.invoke('compras:calcularRango', { codigoInicio, codigoFin }),
  updateProductCosto: (id, costoPromedio) => ipcRenderer.invoke('products:updateCosto', { id, costoPromedio }),
  updateProductCodigoBarras: (id, codigoBarras) => ipcRenderer.invoke('products:updateCodigoBarras', { id, codigo_barras: codigoBarras }),
  updateUnitCosto: (id, costoUnitario) => ipcRenderer.invoke('units:updateCosto', { id, costoUnitario }),
  writeOffUnitRange: (data) => ipcRenderer.invoke('units:writeOffRange', data),
  // Gastos
  createGasto: (data) => ipcRenderer.invoke('gastos:create', data),
  listGastos: (desde, hasta) => ipcRenderer.invoke('gastos:list', { desde, hasta }),
  deleteGasto: (id) => ipcRenderer.invoke('gastos:delete', { id }),
  // Reportes
  getReporteGanancias: (desde, hasta) => ipcRenderer.invoke('reportes:ganancias', { desde, hasta }),
  getReporteFacturas: (desde, hasta) => ipcRenderer.invoke('reportes:facturas', { desde, hasta }),
  getReporteDevolucionesFacturas: (desde, hasta) => ipcRenderer.invoke('reportes:devolucionesFacturas', { desde, hasta }),
  getReporteCompras: (desde, hasta) => ipcRenderer.invoke('reportes:compras', { desde, hasta }),
  getReporteDevolucionesCompras: (desde, hasta) => ipcRenderer.invoke('reportes:devolucionesCompras', { desde, hasta }),
  getLibroVentasIva: (desde, hasta) => ipcRenderer.invoke('reportes:libroVentasIva', { desde, hasta }),
  getLibroComprasIva: (desde, hasta) => ipcRenderer.invoke('reportes:libroComprasIva', { desde, hasta }),
  getReporteCargosDescargos: (desde, hasta) => ipcRenderer.invoke('reportes:cargosDescargos', { desde, hasta }),
  getReporteInventarioProductos: (depositoId) => ipcRenderer.invoke('reportes:inventarioProductos', { depositoId }),
  getReporteInventarioFisico: (depositoId) => ipcRenderer.invoke('reportes:inventarioFisico', { depositoId }),
  getReporteVendedoresEfectividad: (desde, hasta, agrupacion) =>
    ipcRenderer.invoke('reportes:vendedoresEfectividad', { desde, hasta, agrupacion }),
  getReporteVendedoresUltimasVentas: () => ipcRenderer.invoke('reportes:vendedoresUltimasVentas'),
  getReporteVendedoresPorCategoria: (desde, hasta) => ipcRenderer.invoke('reportes:vendedoresPorCategoria', { desde, hasta }),
  getReporteVendedoresEstadisticas: (desde, hasta) => ipcRenderer.invoke('reportes:vendedoresEstadisticas', { desde, hasta }),
  getReporteVentasTransacciones: (desde, hasta) => ipcRenderer.invoke('reportes:ventasTransacciones', { desde, hasta }),
  getReporteVentasCierreDiario: (fecha) => ipcRenderer.invoke('reportes:ventasCierreDiario', { fecha }),
  getReporteVentasRelacion: (desde, hasta, agrupacion) => ipcRenderer.invoke('reportes:ventasRelacion', { desde, hasta, agrupacion }),
  getDashboardInicio: () => ipcRenderer.invoke('reportes:dashboardInicio'),
  getReporteProductosVendidos: (desde, hasta, tipo, productId) =>
    ipcRenderer.invoke('reportes:productosVendidos', { desde, hasta, tipo, product_id: productId }),
  // Respaldo
  crearBackup: () => ipcRenderer.invoke('backup:crear'),
  restaurarBackup: () => ipcRenderer.invoke('backup:restaurar'),
  // PDF (facturas y reportes): guarda automaticamente y abre con el visor por defecto
  guardarYAbrirPDF: (nombreArchivo, base64, subcarpeta) =>
    ipcRenderer.invoke('pdf:guardarYAbrir', { nombreArchivo, base64, subcarpeta }),
  // PDF: guarda, abre e imprime automaticamente (usado por "Imprimir compra" / "Imprimir PDF" de factura)
  guardarAbrirEImprimirPDF: (nombreArchivo, base64, subcarpeta) =>
    ipcRenderer.invoke('pdf:guardarAbrirEImprimir', { nombreArchivo, base64, subcarpeta }),
  // PDF: abrir un archivo ya guardado con el visor externo por defecto del sistema (accion
  // manual del usuario, ej. boton "Ver PDF"/"Reimprimir")
  verPdfConVisorExterno: (filePath) => ipcRenderer.invoke('pdf:verConVisorExterno', { filePath }),
  // Ventana: forzar el foco a nivel de sistema operativo (usado tras dialogos nativos confirm/alert)
  focusVentana: () => ipcRenderer.invoke('window:focus')
});
