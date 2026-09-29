const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SSHClient } = require('./ssh');

let currentClient = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (currentClient) {
    currentClient.disconnect();
    currentClient = null;
  }

  if (process.platform !== 'darwin') app.quit();
});




ipcMain.handle('connect', async (event, config) => {
  try {
    if (currentClient) {
      currentClient.disconnect();
      currentClient = null;
    }

    const client = new SSHClient(config);
    const result = await client.connect();

    if (result.success) {
      currentClient = client;
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-metrics', async () => {
  try {
    if (!currentClient) {
      return { success: false, error: 'Нет активного подключения' };
    }

    const metrics = await currentClient.getMetrics();
    return { success: true, metrics };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('disconnect', async () => {
  try {
    if (currentClient) {
      currentClient.disconnect();
      currentClient = null;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('exec', async (event, command) => {
  try{
    if (!currentClient) {
      return { success: false, error: 'Нет активного подключения' };
    }
    const output = await currentClient.exec(command);
    return {success: true, output};
  } catch(err) {
    return {success: false, error: err.message};
  }
});