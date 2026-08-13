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
  createCategory: (nombre) => ipcRenderer.invoke('categories:create', { nombre }),
  // Inventario - productos
  listProducts: (tipo) => ipcRenderer.invoke('products:list', { tipo }),
  listProductNames: (tipo) => ipcRenderer.invoke('products:names', { tipo }),
  createProduct: (data) => ipcRenderer.invoke('products:create', data),
  deleteProduct: (id) => ipcRenderer.invoke('products:delete', { id }),
  addProductStock: (id, cantidad, usuario) => ipcRenderer.invoke('products:addStock', { id, cantidad, usuario }),
  writeOffProductStock: (id, cantidad, motivo, usuario) =>
    ipcRenderer.invoke('products:writeOffStock', { id, cantidad, motivo, usuario }),
  // Inventario - unidades
  listUnits: (productId) => ipcRenderer.invoke('units:list', { product_id: productId }),
  addUnit: (productId, codigo) => ipcRenderer.invoke('units:add', { product_id: productId, codigo }),
  addUnitsRange: (productId, codigoInicio, codigoFin) =>
    ipcRenderer.invoke('units:addRange', { product_id: productId, codigoInicio, codigoFin }),
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
  detalleFactura: (id) => ipcRenderer.invoke('facturas:detalle', { id })
});
