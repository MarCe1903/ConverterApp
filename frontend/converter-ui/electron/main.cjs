const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const BACKEND_URL = process.env.CONVERTER_APP_BACKEND_URL || 'http://localhost:5254';
const APP_URL = process.env.CONVERTER_APP_FRONTEND_URL || BACKEND_URL;
const BACKEND_READY_TIMEOUT_MS = 45_000;

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.converterapp.desktop');
}

function getBackendWritablePaths() {
  const userDataDirectory = app.getPath('userData');
  const backendDataDirectory = path.join(userDataDirectory, 'backend-data');

  return {
    inputDirectory: path.join(backendDataDirectory, 'temp', 'input'),
    outputDirectory: path.join(backendDataDirectory, 'temp', 'output'),
    userProfileDirectory: path.join(backendDataDirectory, 'libreoffice-profile')
  };
}

function getBackendLaunchConfig() {
  const environment = process.env.ASPNETCORE_ENVIRONMENT || (app.isPackaged ? 'Production' : 'Development');
  const writablePaths = getBackendWritablePaths();
  const bundledLibreOfficeConfig = getBundledLibreOfficeConfig();
  const sharedEnvironment = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: environment,
    ASPNETCORE_URLS: BACKEND_URL,
    Storage__InputDirectory: writablePaths.inputDirectory,
    Storage__OutputDirectory: writablePaths.outputDirectory,
    LibreOffice__UserProfileDirectory: writablePaths.userProfileDirectory,
    ...(bundledLibreOfficeConfig
      ? {
          LibreOffice__ProgramPath: bundledLibreOfficeConfig.programPath,
          LibreOffice__WorkingDirectory: bundledLibreOfficeConfig.workingDirectory
        }
      : {})
  };

  if (app.isPackaged) {
    const backendDirectory = path.join(process.resourcesPath, 'backend');
    const executableName = process.platform === 'win32'
      ? 'ConverterApi.exe'
      : 'ConverterApi';
    const executablePath = path.join(backendDirectory, executableName);

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Published backend executable could not be found at "${executablePath}".`);
    }

    return {
      command: executablePath,
      args: [],
      cwd: backendDirectory,
      env: sharedEnvironment
    };
  }

  const repoRoot = path.resolve(__dirname, '../../..');
  const projectPath = path.join(repoRoot, 'backend', 'ConverterApi', 'ConverterApi.csproj');

  return {
    command: 'dotnet',
    args: ['run', '--no-launch-profile', '--project', projectPath],
    cwd: repoRoot,
    env: sharedEnvironment
  };
}

function cleanupBackendWorkingDirectories() {
  const writablePaths = getBackendWritablePaths();

  cleanupDirectory(writablePaths.inputDirectory);
  cleanupDirectory(writablePaths.outputDirectory);
}

function cleanupDirectory(directoryPath) {
  try {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Could not clean directory "${directoryPath}".`, error);
  }
}

function getBundledLibreOfficeConfig() {
  const bundleRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'libreoffice')
    : path.join(__dirname, 'libreoffice-bundle');

  const candidates = process.platform === 'win32'
    ? [
        {
          programPath: path.join(bundleRoot, 'program', 'soffice.exe'),
          workingDirectory: path.join(bundleRoot, 'program')
        }
      ]
    : process.platform === 'darwin'
      ? [
          {
            programPath: path.join(bundleRoot, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice'),
            workingDirectory: path.join(bundleRoot, 'LibreOffice.app', 'Contents', 'MacOS')
          },
          {
            programPath: path.join(bundleRoot, 'Contents', 'MacOS', 'soffice'),
            workingDirectory: path.join(bundleRoot, 'Contents', 'MacOS')
          }
        ]
      : [
          {
            programPath: path.join(bundleRoot, 'program', 'soffice'),
            workingDirectory: path.join(bundleRoot, 'program')
          }
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.programPath)) {
      return candidate;
    }
  }

  return null;
}

function startBackend() {
  if (backendProcess) {
    return backendProcess;
  }

  const launchConfig = getBackendLaunchConfig();
  const child = spawn(launchConfig.command, launchConfig.args, {
    cwd: launchConfig.cwd,
    env: launchConfig.env,
    stdio: 'inherit',
    windowsHide: true
  });

  child.once('exit', (code, signal) => {
    backendProcess = null;

    if (!isQuitting) {
      const reason = signal
        ? `signal ${signal}`
        : `code ${code ?? 'unknown'}`;

      dialog.showErrorBox(
        'ConverterApp',
        `The local backend process stopped unexpectedly (${reason}).`
      );

      app.quit();
    }
  });

  backendProcess = child;
  return child;
}

function stopBackend() {
  if (!backendProcess) {
    return;
  }

  const child = backendProcess;
  backendProcess = null;

  if (child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return;
  }

  child.kill('SIGTERM');
}

function waitForBackend(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const request = http.get(url, (response) => {
        response.resume();

        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        retryOrFail(new Error(`Backend returned status ${response.statusCode ?? 'unknown'}.`));
      });

      request.on('error', retryOrFail);
      request.setTimeout(3_000, () => {
        request.destroy(new Error('Connection timed out.'));
      });
    };

    const retryOrFail = (error) => {
      if (Date.now() >= deadline) {
        reject(error);
        return;
      }

      setTimeout(tryConnect, 500);
    };

    tryConnect();
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: 'ConverterApp',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#151a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  try {
    await mainWindow.webContents.session.clearCache();
  } catch (error) {
    console.warn('Could not clear the desktop app cache before loading.', error);
  }

  const appUrl = new URL(APP_URL);
  appUrl.searchParams.set('desktopVersion', app.getVersion());

  await mainWindow.loadURL(appUrl.toString());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerDesktopIpcHandlers() {
  ipcMain.handle('desktop:pick-output-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const directoryPath = result.filePaths[0];

    return {
      path: directoryPath,
      name: path.basename(directoryPath)
    };
  });

  ipcMain.handle('desktop:save-file', async (_event, payload) => {
    const directoryPath = typeof payload?.directoryPath === 'string'
      ? payload.directoryPath
      : '';
    const fileName = typeof payload?.fileName === 'string'
      ? payload.fileName
      : '';
    const bytes = payload?.bytes;

    if (!directoryPath || !fileName || !(bytes instanceof Uint8Array || Array.isArray(bytes))) {
      throw new Error('The desktop save request is invalid.');
    }

    const safeBytes = bytes instanceof Uint8Array
      ? bytes
      : Uint8Array.from(bytes);
    const targetPath = await buildAvailableTargetPath(directoryPath, fileName);

    try {
      await fs.promises.mkdir(directoryPath, { recursive: true });
      await fs.promises.writeFile(targetPath, Buffer.from(safeBytes));
    } catch (error) {
      if (isAccessDeniedError(error)) {
        throw new Error(
          'ConverterApp could not write to the selected folder. Check folder permissions or choose a different folder.'
        );
      }

      throw error;
    }

    return {
      filePath: targetPath,
      fileName: path.basename(targetPath),
      directoryName: path.basename(directoryPath)
    };
  });
}

async function buildAvailableTargetPath(directoryPath, desiredFileName) {
  const extension = path.extname(desiredFileName);
  const baseName = extension
    ? desiredFileName.slice(0, -extension.length)
    : desiredFileName;

  let counter = 0;

  while (true) {
    const candidateName = counter === 0
      ? desiredFileName
      : `${baseName} (${counter})${extension}`;
    const candidatePath = path.join(directoryPath, candidateName);

    try {
      await fs.promises.access(candidatePath, fs.constants.F_OK);
      counter += 1;
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return candidatePath;
      }

      throw error;
    }
  }
}

function isAccessDeniedError(error) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    (error.code === 'EACCES' || error.code === 'EPERM')
  );
}

async function bootstrapDesktopApp() {
  try {
    cleanupBackendWorkingDirectories();
    startBackend();
    await waitForBackend(BACKEND_URL, BACKEND_READY_TIMEOUT_MS);
    await createMainWindow();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Unknown startup error.';

    dialog.showErrorBox(
      'ConverterApp',
      `The desktop shell could not start the local conversion service.\n\n${message}`
    );

    app.quit();
  }
}

app.whenReady().then(bootstrapDesktopApp);
app.whenReady().then(registerDesktopIpcHandlers);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
