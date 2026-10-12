import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '../..');

const pathsToClean = [
  path.join(frontendRoot, 'dist'),
  path.join(frontendRoot, 'dist-desktop'),
  path.join(frontendRoot, 'electron', 'backend-publish'),
  path.join(frontendRoot, 'electron', 'libreoffice-bundle')
];

for (const targetPath of pathsToClean) {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
  console.log(`Cleaned ${targetPath}`);
}
