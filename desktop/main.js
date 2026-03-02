const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        titleBarStyle: 'hiddenInset',
        show: false // Don't show until ready-to-show
    });

    const uploadsDir = path.join(app.getPath('downloads'), 'LocalShare');
    // Check if we are running in production (packaged app) or dev
    const isProd = app.isPackaged;
    const staticDistDir = isProd
        ? path.join(process.resourcesPath, 'app.asar/dist')
        : path.join(__dirname, 'dist');

    let staticDir = isProd ? staticDistDir : path.join(__dirname, 'dist');

    startServer(uploadsDir, staticDir, 3000)
        .then(({ server, port }) => {
            console.log(`Server started on port ${port}`);
            mainWindow.loadURL(`http://localhost:${port}`);

            mainWindow.once('ready-to-show', () => {
                mainWindow.show();
            });

            // Handle server shutdown
            mainWindow.on('closed', function () {
                mainWindow = null;
                server.close();
            });
        })
        .catch(err => {
            console.error('Failed to start server:', err);
            app.quit();
        });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});
