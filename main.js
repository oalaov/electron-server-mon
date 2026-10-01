const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SSHClient } = require('./ssh');
const db = require('./database');

let currentClient = null;
let currentServerId = null;   // ← ID сервера в БД

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
  db.initDB();   
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
  db.closeDB();   
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('connect', async (event, config) => {
  try {
    if (currentClient) {
      currentClient.disconnect();
      currentClient = null;
      currentServerId = null;
    }

    const client = new SSHClient(config);
    const result = await client.connect();

    if (result.success) {
      currentClient = client;

      const servers = db.getServers();
      const existing = servers.find(s =>
        s.host === config.host &&
        s.port === config.port &&
        s.username === config.username
      );

      if (existing) {
        currentServerId = existing.id;
      } else {
        currentServerId = db.addServer({
          name: config.host,
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password
        });
      }

      console.log('Подключено, server_id:', currentServerId);
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

    // Сохраняем в БД
    if (currentServerId) {
      db.saveMetric(currentServerId, metrics);
    }

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
      currentServerId = null;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('exec', async (event, command) => {
  try {
    if (!currentClient) {
      return { success: false, error: 'Нет активного подключения' };
    }
    const output = await currentClient.exec(command);
    return { success: true, output };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-history', async () => {
  try {
    if (!currentServerId) {
      return { success: true, history: [] };
    }

    const rawHistory = db.getMetricsHistory(currentServerId, 30);

    const history = rawHistory.map(row => ({
      time: new Date(row.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      cpu: row.cpu || 0,
      ram: row.ram || 0,
      swap: row.swap || 0,
      disk: row.disk || 0
    }));

    return { success: true, history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});