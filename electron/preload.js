const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  // Autenticacion y usuarios
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (data) => ipcRenderer.invoke('users:create', data),
  toggleUserActive: (id) => ipcRenderer.invoke('users:toggleActive', { id }),
  changePassword: (id, newPassword) => ipcRenderer.invoke('users:changePassword', { id, newPassword }),
  // Categorias
  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (nombre, tipo) => ipcRenderer.invoke('categories:create', { nombre, tipo }),
  updateCategory: (id, nombre) => ipcRenderer.invoke('categories:update', { id, nombre }),
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', { id }),
  getCategoryImpact: (id) => ipcRenderer.invoke('categories:impacto', { id }),
  // Inventario - productos
  listProducts: (tipo) => ipcRenderer.invoke('products:list', { tipo }),
  listProductNames: (tipo) => ipcRenderer.invoke('products:names', { tipo }),
  createProduct: (data) => ipcRenderer.invoke('products:create', data),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', { id }),
  addProductStock: (id, cantidad, costoUnitario, usuario) =>
    ipcRenderer.invoke('products:addStock', { id, cantidad, costoUnitario, usuario }),
  writeOffProductStock: (id, cantidad, motivo, usuario) =>
    ipcRenderer.invoke('products:writeOffStock', { id, cantidad, motivo, usuario }),
  // Inventario - unidades
  listUnits: (productId) => ipcRenderer.invoke('units:list', { product_id: productId }),
  addUnit: (productId, codigo, costoUnitario, usuario) =>
    ipcRenderer.invoke('units:add', { product_id: productId, codigo, costoUnitario, usuario }),
  addUnitsRange: (productId, codigoInicio, codigoFin, costoUnitario, usuario) =>
    ipcRenderer.invoke('units:addRange', { product_id: productId, codigoInicio, codigoFin, costoUnitario, usuario }),
  deleteUnit: (id) => ipcRenderer.invoke('units:delete', { id }),
  writeOffUnit: (id, motivo, usuario) => ipcRenderer.invoke('units:writeOff', { id, motivo, usuario }),
  // Historial de descargos
  listDescargos: () => ipcRenderer.invoke('descargos:list'),
  // Configuracion
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (values) => ipcRenderer.invoke('settings:update', values),
  // Clientes
  listClientes: () => ipcRenderer.invoke('clientes:list'),
  searchClientes: (query) => ipcRenderer.invoke('clientes:search', { query }),
  createCliente: (data) => ipcRenderer.invoke('clientes:create', data),
  updateCliente: (id, data) => ipcRenderer.invoke('clientes:update', { id, ...data }),
  // Facturacion
  crearFactura: (payload) => ipcRenderer.invoke('facturas:crear', payload),
  listFacturas: () => ipcRenderer.invoke('facturas:list'),
  detalleFactura: (id) => ipcRenderer.invoke('facturas:detalle', { id }),
  eliminarFactura: (id) => ipcRenderer.invoke('facturas:eliminar', { id }),
  // Compras y costos
  listCompras: (desde, hasta) => ipcRenderer.invoke('compras:list', { desde, hasta }),
  crearCompraLote: (payload) => ipcRenderer.invoke('compras:crearLote', payload),
  codigoExiste: (data) => ipcRenderer.invoke('inventario:codigoExiste', data),
  listComprasEncabezados: () => ipcRenderer.invoke('compras:listEncabezados'),
  detalleCompraEncabezado: (id) => ipcRenderer.invoke('compras:detalleEncabezado', { id }),
  proximoNumeroCompra: () => ipcRenderer.invoke('compras:proximoNumero'),
  calcularRangoCompra: (codigoInicio, codigoFin) => ipcRenderer.invoke('compras:calcularRango', { codigoInicio, codigoFin }),
  updateProductCosto: (id, costoPromedio) => ipcRenderer.invoke('products:updateCosto', { id, costoPromedio }),
  updateUnitCosto: (id, costoUnitario) => ipcRenderer.invoke('units:updateCosto', { id, costoUnitario }),
  writeOffUnitRange: (data) => ipcRenderer.invoke('units:writeOffRange', data),
  // Gastos
  createGasto: (data) => ipcRenderer.invoke('gastos:create', data),
  listGastos: (desde, hasta) => ipcRenderer.invoke('gastos:list', { desde, hasta }),
  deleteGasto: (id) => ipcRenderer.invoke('gastos:delete', { id }),
  // Reportes
  getReporteGanancias: (desde, hasta) => ipcRenderer.invoke('reportes:ganancias', { desde, hasta }),
  getReporteFacturas: (desde, hasta) => ipcRenderer.invoke('reportes:facturas', { desde, hasta }),
  getReporteCompras: (desde, hasta) => ipcRenderer.invoke('reportes:compras', { desde, hasta }),
  getReporteCargosDescargos: (desde, hasta) => ipcRenderer.invoke('reportes:cargosDescargos', { desde, hasta }),
  // Respaldo
  crearBackup: () => ipcRenderer.invoke('backup:crear'),
  restaurarBackup: () => ipcRenderer.invoke('backup:restaurar'),
  // PDF (facturas y reportes): guarda automaticamente y abre con el visor por defecto
  guardarYAbrirPDF: (nombreArchivo, base64, subcarpeta) =>
    ipcRenderer.invoke('pdf:guardarYAbrir', { nombreArchivo, base64, subcarpeta }),
  // Ventana: forzar el foco a nivel de sistema operativo (usado tras dialogos nativos confirm/alert)
  focusVentana: () => ipcRenderer.invoke('window:focus')
});
