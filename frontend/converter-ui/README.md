# ConverterApp UI

Angular interface and Electron desktop shell for ConverterApp.

See the [project README](../../README.md) for supported formats, backend setup, configuration, privacy details, and GitHub release instructions.

## Requirements

Install a compatible Node.js version, npm, the .NET 9 SDK, and LibreOffice as described in the project README.

## Commands

Run these commands from this directory:

```bash
npm ci
npm start                  # Browser development at http://localhost:4200
npm run desktop:dev        # Angular, Electron, and the local backend
npm run build              # Production frontend build
npm test -- --watch=false  # Unit tests
npm run desktop:dist       # Desktop package with backend and LibreOffice
```

For browser development, start the backend separately from the repository root:

```bash
dotnet run --project backend/ConverterApi/ConverterApi.csproj
```

The default API address is `http://localhost:5254`, configured in `src/app/config/api-config.ts`. Adjust it before building for hosted web deployment.

Frontend builds are written to `dist/`; desktop packages are written to `dist-desktop/`. Generated artifacts are ignored by Git and should be distributed through GitHub Releases.
