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
  // Facturacion
  crearFactura: (payload) => ipcRenderer.invoke('facturas:crear', payload),
  listFacturas: () => ipcRenderer.invoke('facturas:list'),
  detalleFactura: (id) => ipcRenderer.invoke('facturas:detalle', { id }),
  eliminarFactura: (id) => ipcRenderer.invoke('facturas:eliminar', { id }),
  // Compras y costos
  listCompras: (desde, hasta) => ipcRenderer.invoke('compras:list', { desde, hasta }),
  updateProductCosto: (id, costoPromedio) => ipcRenderer.invoke('products:updateCosto', { id, costoPromedio }),
  updateUnitCosto: (id, costoUnitario) => ipcRenderer.invoke('units:updateCosto', { id, costoUnitario }),
  // Gastos
  createGasto: (data) => ipcRenderer.invoke('gastos:create', data),
  listGastos: (desde, hasta) => ipcRenderer.invoke('gastos:list', { desde, hasta }),
  deleteGasto: (id) => ipcRenderer.invoke('gastos:delete', { id }),
  // Reportes
  getReporteGanancias: (desde, hasta) => ipcRenderer.invoke('reportes:ganancias', { desde, hasta }),
  // Respaldo
  crearBackup: () => ipcRenderer.invoke('backup:crear'),
  restaurarBackup: () => ipcRenderer.invoke('backup:restaurar')
});
