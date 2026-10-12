# ConverterApp

**Convert office documents to PDF on your own computer.**

ConverterApp is a local document converter built with Angular, ASP.NET Core, Electron, and LibreOffice. The desktop app runs a local conversion service, so documents do not need to be sent to an external conversion provider.

## Features

- Convert word processing documents, spreadsheets, and presentations to PDF.
- Track queued, processing, completed, and failed conversions.
- Download PDFs in the browser or save them to a selected desktop folder.
- Switch between English and Turkish and between light and dark themes.
- Distribute the frontend, self-contained backend, and LibreOffice in a desktop package.

## Supported formats

| Document type | Input formats | Output |
| --- | --- | --- |
| Word processing | `.doc`, `.docx`, `.odt` | `.pdf` |
| Spreadsheets | `.xls`, `.xlsx`, `.ods` | `.pdf` |
| Presentations | `.ppt`, `.pptx`, `.odp` | `.pdf` |

The API validates files against a 50 MiB limit. Server or reverse proxy request limits may reject smaller uploads before that validation runs. PDF layout depends on LibreOffice and the fonts installed on the machine.

## Download and use

When a desktop release is available, open this repository's **Releases** tab and download the package for your platform. The Windows installer is named `ConverterApp Setup <version>.exe`.

Packages built with the included release script contain the Electron app, Angular interface, self-contained .NET backend, and LibreOffice runtime. End users do not need a separate .NET runtime or LibreOffice installation.

1. Install and open ConverterApp.
2. Select supported documents and start conversion.
3. Wait for conversion to finish.
4. Save the resulting PDFs.

## Project structure

```text
backend/ConverterApi/                ASP.NET Core API and conversion worker
frontend/converter-ui/src/          Angular interface
frontend/converter-ui/electron/     Desktop shell and packaging scripts
ConverterApp.sln                    Backend solution
```

The frontend submits files to the API. The API stores uploads on disk, queues jobs in memory, and processes them with a background worker that launches headless LibreOffice. The desktop shell starts the API locally and opens the interface in Electron.

## Development requirements

- .NET 9 SDK, matching the backend's `net9.0` target.
- Node.js matching the Angular CLI requirement: `^20.19.0`, `^22.12.0`, or `>=24.0.0`.
- npm; the project declares `npm@11.6.2` as its package manager.
- LibreOffice installed locally.

Clone this repository, open its root directory, and install frontend dependencies:

```bash
cd frontend/converter-ui
npm ci
```

### Browser development

From the repository root, start the backend:

```bash
dotnet run --project backend/ConverterApi/ConverterApi.csproj
```

In another terminal, start the frontend:

```bash
cd frontend/converter-ui
npm start
```

Open `http://localhost:4200`. The default API address is `http://localhost:5254`.

### Desktop development

From `frontend/converter-ui`:

```bash
npm run desktop:dev
```

This starts the Angular development server, opens Electron, and starts the backend through the desktop shell. Stop an independently running backend first to avoid a port conflict.

### LibreOffice configuration

The backend searches common LibreOffice installation paths on Windows, macOS, and Linux. For a custom installation, create `backend/ConverterApi/appsettings.Local.json`:

```json
{
  "LibreOffice": {
    "ProgramPath": "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "WorkingDirectory": "C:\\Program Files\\LibreOffice\\program"
  }
}
```

Use paths appropriate to your platform. Environment-specific overrides can also be placed in `appsettings.Development.Local.json`. Both kinds of local override files are ignored by Git.

| Setting | Purpose | Default |
| --- | --- | --- |
| `LibreOffice:ProgramPath` | LibreOffice executable | Automatic discovery |
| `LibreOffice:WorkingDirectory` | Working directory for LibreOffice | Derived from executable |
| `LibreOffice:UserProfileDirectory` | Conversion-specific profile | `.converter-profile` (`.converter-profile-dev` in development) |
| `LibreOffice:ConversionTimeoutSeconds` | Conversion timeout | `120` |
| `Storage:InputDirectory` | Uploaded documents | `temp/input` |
| `Storage:OutputDirectory` | Converted documents | `temp/output` |
| `Cors:AllowedOrigins` | Allowed browser origins | `http://localhost:4200` |

Relative storage and profile paths resolve from the backend process's working directory. The desktop shell supplies writable paths under its application data directory.

## Build and validate

From the repository root:

```bash
dotnet build ConverterApp.sln --configuration Release
```

From `frontend/converter-ui`:

```bash
npm run build
npm test -- --watch=false
```

Before distributing a release, convert representative files from every supported document family and inspect the PDFs visually.

## Create a desktop release

Build on the platform and architecture you intend to distribute, with a matching LibreOffice installation. From `frontend/converter-ui`:

```bash
npm ci
npm run desktop:dist
```

The command removes previous desktop build outputs, builds Angular, copies it into the backend's `wwwroot`, bundles LibreOffice, publishes a self-contained backend, and runs Electron Builder.

For a custom LibreOffice bundle source, set `CONVERTER_APP_LIBREOFFICE_DIR` to the installation directory before packaging. This packaging setting is separate from the backend's executable path setting.

Artifacts are written to `frontend/converter-ui/dist-desktop/`. Configured targets are Windows NSIS installers, macOS DMG files, and Linux AppImages. Validate each target on its own platform; a configured target alone does not establish tested support.

### Publish on GitHub Releases

1. Update `version` in `frontend/converter-ui/package.json` and the root package entries in `package-lock.json` together.
2. Run the build and validation commands, then build the desktop package.
3. Install and test the package on a clean machine, including startup, conversion, and saving PDFs.
4. Commit source changes and create a matching version tag, such as `v0.1.0`.
5. Create a GitHub Release for the tag and attach the generated installer or package.
6. Include release notes, the supported platform and architecture, and known limitations.

Distribute installers as release assets rather than committing them. Generated assets, bundled runtimes, uploaded documents, and local conversion profiles are ignored by Git. Windows executable signing and editing is currently disabled in the build configuration; configure signing separately if signed distribution is required.

## Web hosting

Publishing the repository or a desktop release does not deploy the conversion API. GitHub Pages can serve static frontend files, but cannot run this ASP.NET Core backend or LibreOffice. A working web deployment needs a server that runs both and provides writable conversion storage.

The frontend currently uses `http://localhost:5254` in `frontend/converter-ui/src/app/config/api-config.ts`. For a hosted web build, change the API base URL to the hosted API address, or use an empty base URL for same-origin `/api` requests, then rebuild. Configure `Cors:AllowedOrigins` if the frontend and API use different origins.

To produce a combined frontend and backend publish directory, run from `frontend/converter-ui`:

```bash
npm run desktop:prepare
dotnet publish ../../backend/ConverterApi/ConverterApi.csproj --configuration Release --output ../../artifacts/web
```

This web publish requires a compatible .NET runtime and a separate LibreOffice installation on the server. Run the API from the publish directory so relative storage paths are predictable.

The current API is designed for local use: it has no authentication or per-user job ownership, keeps jobs and its queue in memory, and has no scheduled file retention. Before exposing it to public traffic, add access controls, request and queue limits, file cleanup, process isolation, and HTTPS. Job responses currently include output paths and may include raw conversion errors; review these responses for public deployment. Restarts lose job state, and multiple server instances do not share jobs.

## Privacy and local data

- Desktop conversion runs through a local API and LibreOffice.
- Source files and PDFs are written to disk during conversion.
- The desktop shell clears temporary input and output folders at the next startup. PDFs saved to a selected folder are kept.
- When running the backend independently, temporary files remain until you remove them.
- Keep local settings, environment files, logs, and generated LibreOffice profiles outside version control.

## Contributing

Use GitHub Issues for reproducible bug reports and feature requests. Include the platform, app version, document format, and reproduction steps. For conversion issues, use a sanitized sample document containing no private information.

Keep pull requests focused and describe how changes were verified. Do not attach personal documents, credentials, or local machine settings.

## Licensing

This repository currently has no project license file. Choose and add a project license before presenting the source as licensed open-source software. Third-party components retain their own licenses. Desktop packages include LibreOffice; preserve its bundled license and notice files when distributing packages.
