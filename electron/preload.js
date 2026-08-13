const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (data) => ipcRenderer.invoke('users:create', data),
  toggleUserActive: (id) => ipcRenderer.invoke('users:toggleActive', { id }),
  changePassword: (id, newPassword) => ipcRenderer.invoke('users:changePassword', { id, newPassword })
});
