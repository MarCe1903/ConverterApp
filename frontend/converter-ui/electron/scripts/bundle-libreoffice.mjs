import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '../..');
const bundleDirectory = path.join(frontendRoot, 'electron', 'libreoffice-bundle');

const sourceDirectory = resolveLibreOfficeSourceDirectory();

await fs.promises.rm(bundleDirectory, { recursive: true, force: true });
await fs.promises.mkdir(path.dirname(bundleDirectory), { recursive: true });
await fs.promises.cp(sourceDirectory, bundleDirectory, { recursive: true });

console.log(`LibreOffice bundled from ${sourceDirectory} to ${bundleDirectory}`);

function resolveLibreOfficeSourceDirectory() {
  const overrideDirectory = process.env.CONVERTER_APP_LIBREOFFICE_DIR;

  if (overrideDirectory) {
    return validateLibreOfficeDirectory(path.resolve(overrideDirectory));
  }

  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\LibreOffice',
        'C:\\Program Files (x86)\\LibreOffice'
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/LibreOffice.app'
        ]
      : [
          '/usr/lib/libreoffice',
          '/opt/libreoffice',
          '/snap/libreoffice/current'
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return validateLibreOfficeDirectory(candidate);
    }
  }

  throw new Error(
    'LibreOffice source directory could not be found. Install LibreOffice locally or set CONVERTER_APP_LIBREOFFICE_DIR before running desktop:dist.'
  );
}

function validateLibreOfficeDirectory(sourceDirectory) {
  const executableCandidates = process.platform === 'win32'
    ? [
        path.join(sourceDirectory, 'program', 'soffice.exe')
      ]
    : process.platform === 'darwin'
      ? [
          path.join(sourceDirectory, 'Contents', 'MacOS', 'soffice')
        ]
      : [
          path.join(sourceDirectory, 'program', 'soffice'),
          path.join(sourceDirectory, 'program', 'libreoffice')
        ];

  for (const executableCandidate of executableCandidates) {
    if (fs.existsSync(executableCandidate)) {
      return sourceDirectory;
    }
  }

  throw new Error(
    `LibreOffice executable could not be found under "${sourceDirectory}".`
  );
}
