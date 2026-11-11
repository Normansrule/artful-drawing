// artful drawing as a desktop app (Windows, macOS, Linux).
//
// The app is the same website, served from inside the app through a private app://
// address (browsers block modules from file:// pages). Nothing is downloaded at run
// time; it works fully offline. Drawings are saved with normal Save dialogs.
//
// Run it while developing:   npm run app
// Build installers:          npm run dist        (or let GitHub build them: push a v* tag)

const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const HOST = 'artful';
const START = `app://${HOST}/studio.html`;
const isMac = process.platform === 'darwin';

// app:// behaves like a normal secure website (modules, fetch, storage all work)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// one window set per computer: opening the app again focuses it
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

// ---- remember the window size and place
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}
function saveBounds(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch { /* not important */ }
}

function serveFiles() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    // never serve anything outside the app folder
    if (url.host !== HOST || !file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow(startUrl = START) {
  const saved = loadBounds();
  const win = new BrowserWindow({
    width: saved?.width || 1440,
    height: saved?.height || 920,
    x: saved?.x, y: saved?.y,
    minWidth: 900, minHeight: 600,
    title: 'artful drawing',
    backgroundColor: '#141518',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  if (saved?.maximized) win.maximize();
  win.on('close', () => saveBounds(win));

  // Links: our own pages open inside the app; everything else opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`app://${HOST}/`)) { createWindow(url); return { action: 'deny' }; }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`app://${HOST}/`)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  // Exports (PNG, SVG, video, project files) ask where to save, like any desktop app.
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ title: 'Save', defaultPath: path.join(app.getPath('pictures'), item.getFilename()) });
  });

  win.loadURL(startUrl);
  return win;
}

/** Run a studio command by its name in the command palette (see paletteCommands in js/studio.js). */
function command(label) {
  return () => {
    const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!w) return;
    const go = () => w.webContents.executeJavaScript(`window.artfulCommand && window.artfulCommand(${JSON.stringify(label)})`).catch(() => {});
    if (!w.webContents.getURL().endsWith('/studio.html')) { w.loadURL(START); w.webContents.once('did-finish-load', () => setTimeout(go, 300)); } else go();
  };
}
const page = (file) => () => {
  const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (w) w.loadURL(`app://${HOST}/${file}`); else createWindow(`app://${HOST}/${file}`);
};

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Drawing', accelerator: 'CmdOrCtrl+N', click: command('New blank canvas') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: command('Open project file…') },
        { label: 'Save Project', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: command('Save project file') },
        { type: 'separator' },
        { label: 'Export PNG…', accelerator: 'CmdOrCtrl+E', click: command('Export PNG image') },
        { label: 'Export Sticker (transparent PNG)…', click: command('Export sticker (transparent PNG)') },
        { label: 'Export SVG…', accelerator: 'CmdOrCtrl+Shift+E', click: command('Export SVG (sharp at any size)') },
        { label: 'Export Video…', click: command('Export video of the drawing blooming') },
        { type: 'separator' },
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // These keys are handled by the page itself (so Ctrl+Z still undoes typing in the
        // code editor); the menu only shows them.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: command('Undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', registerAccelerator: false, click: command('Redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { label: 'Select All Parts', accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: command('Select everything') },
        { type: 'separator' },
        { label: 'Command Palette…', accelerator: 'CmdOrCtrl+K', registerAccelerator: false, click: command('Command palette') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Studio', click: page('studio.html') },
        { label: 'Learn', click: page('learn.html') },
        { label: 'Manual', accelerator: 'F1', click: page('manual.html') },
        { label: 'References', click: page('references.html') },
        { label: 'Home', click: page('index.html') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', registerAccelerator: false, click: command('Zoom in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', registerAccelerator: false, click: command('Zoom out') },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', registerAccelerator: false, click: command('Fit to screen') },
        { type: 'separator' },
        { label: 'Dark Theme', click: command('Theme: Dark') },
        { label: 'Light Theme', click: command('Theme: Light') },
        { label: 'Playful Theme', click: command('Theme: Playful') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: command('Keyboard shortcuts') },
        { label: 'Take the Tour', click: command('Take the 1-minute tour') },
        { type: 'separator' },
        { label: 'Website', click: () => shell.openExternal('https://normansrule.github.io/artful-drawing/') },
        { label: 'Source Code and Updates', click: () => shell.openExternal('https://github.com/Normansrule/artful-drawing/releases') },
        { label: `About artful drawing ${app.getVersion()}`, click: () => dialog.showMessageBox({ type: 'info', title: 'artful drawing', message: `artful drawing ${app.getVersion()}`, detail: 'Drawing made easy. Free and open source (MIT).\nhttps://github.com/Normansrule/artful-drawing' }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  serveFiles();
  // Fully offline and private: the pages may not fetch anything from the internet
  // (the website's web fonts fall back to the computer's own fonts). Links still open
  // in the browser through the handlers above.
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
