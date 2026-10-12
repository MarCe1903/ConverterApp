import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '../..');
const frontendUrl = process.env.CONVERTER_APP_FRONTEND_URL || 'http://localhost:4200';
const backendUrl = process.env.CONVERTER_APP_BACKEND_URL || 'http://localhost:5254';
const angularCliPath = path.join(frontendRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const electronBinaryPath = resolveElectronBinaryPath();

let frontendProcess = null;
let electronProcess = null;
let isCleaningUp = false;

try {
  ensureFileExists(
    angularCliPath,
    'Angular CLI could not be found. Run "npm.cmd install" inside frontend/converter-ui first.'
  );

  ensureFileExists(
    electronBinaryPath,
    'Electron could not be found. Run "npm.cmd install" inside frontend/converter-ui first.'
  );

  frontendProcess = spawn(process.execPath, [angularCliPath, 'serve', '--proxy-config', 'proxy.conf.json'], {
    cwd: frontendRoot,
    stdio: 'inherit',
    windowsHide: true
  });

  frontendProcess.once('exit', (code) => {
    if (!isCleaningUp && code !== 0) {
      process.exit(code ?? 1);
    }
  });

  await waitForUrl(frontendUrl, 60_000);

  electronProcess = spawn(electronBinaryPath, ['.'], {
    cwd: frontendRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      CONVERTER_APP_FRONTEND_URL: frontendUrl,
      CONVERTER_APP_BACKEND_URL: backendUrl
    }
  });

  electronProcess.once('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
} catch (error) {
  cleanup();
  throw error;
}

function resolveElectronBinaryPath() {
  if (process.platform === 'win32') {
    return path.join(frontendRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  }

  if (process.platform === 'darwin') {
    return path.join(
      frontendRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
  }

  return path.join(frontendRoot, 'node_modules', 'electron', 'dist', 'electron');
}

function cleanup() {
  if (isCleaningUp) {
    return;
  }

  isCleaningUp = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill('SIGTERM');
  }

  if (frontendProcess && !frontendProcess.killed) {
    frontendProcess.kill('SIGTERM');
  }
}

function ensureFileExists(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }
}

function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const request = http.get(url, (response) => {
        response.resume();

        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        retryOrFail(new Error(`Service returned status ${response.statusCode ?? 'unknown'}.`));
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
