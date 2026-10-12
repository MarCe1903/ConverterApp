using System.Diagnostics;
using System.Text;
using ConverterApi.Models;
using ConverterApi.Options;
using Microsoft.Extensions.Options;

namespace ConverterApi.Services;

public sealed class LibreOfficeConversionService : ILibreOfficeConversionService
{
    private readonly LibreOfficeOptions _libreOfficeOptions;
    private readonly StorageOptions _storageOptions;

    public LibreOfficeConversionService(
        IOptions<LibreOfficeOptions> libreOfficeOptions,
        IOptions<StorageOptions> storageOptions)
    {
        _libreOfficeOptions = libreOfficeOptions.Value;
        _storageOptions = storageOptions.Value;
    }

    public async Task<ConversionResult> ConvertAsync(
        string inputFilePath,
        string originalFileName,
        string targetFormat,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(inputFilePath))
        {
            throw new FileNotFoundException("The source file could not be found.", inputFilePath);
        }

        var sofficePath = ResolveSofficePath();
        var workingDirectory = ResolveWorkingDirectory(sofficePath);
        var outputRoot = GetFullPath(_storageOptions.OutputDirectory);
        var userProfileDirectory = GetFullPath(_libreOfficeOptions.UserProfileDirectory);

        Directory.CreateDirectory(outputRoot);
        Directory.CreateDirectory(userProfileDirectory);

        var sourceExtension = Path.GetExtension(originalFileName).ToLowerInvariant();
        var safeBaseFileName = SanitizeFileName(Path.GetFileNameWithoutExtension(originalFileName));
        var jobDirectory = Path.GetDirectoryName(inputFilePath)
            ?? throw new InvalidOperationException("The job directory could not be resolved.");

        var converterOutputDirectory = Path.Combine(jobDirectory, "out");
        Directory.CreateDirectory(converterOutputDirectory);

        try
        {
            var convertedFilePath = await RunLibreOfficeAsync(
                sofficePath,
                workingDirectory,
                inputFilePath,
                converterOutputDirectory,
                safeBaseFileName,
                targetFormat,
                userProfileDirectory,
                cancellationToken);

            var finalFileName = BuildAvailableFileName(
                outputRoot,
                safeBaseFileName,
                "." + targetFormat);

            var finalOutputPath = Path.Combine(outputRoot, finalFileName);
            var userVisibleFileName = safeBaseFileName + "." + targetFormat;

            File.Move(convertedFilePath, finalOutputPath);

            return new ConversionResult
            {
                OutputFileName = userVisibleFileName,
                OutputFilePath = finalOutputPath,
                SourceExtension = sourceExtension,
                TargetFormat = targetFormat
            };
        }
        finally
        {
            TryDeleteDirectory(jobDirectory);
        }
    }

    private async Task<string> RunLibreOfficeAsync(
        string sofficePath,
        string workingDirectory,
        string inputFilePath,
        string converterOutputDirectory,
        string safeBaseFileName,
        string targetFormat,
        string userProfileDirectory,
        CancellationToken cancellationToken)
    {
        var userInstallationUri = new Uri(EnsureTrailingSeparator(userProfileDirectory)).AbsoluteUri;

        var arguments =
            $"-env:UserInstallation={userInstallationUri} " +
            $"--headless --nologo --nodefault --nolockcheck --nofirststartwizard " +
            $"--convert-to {targetFormat} " +
            $"--outdir {Quote(converterOutputDirectory)} {Quote(inputFilePath)}";

        var startInfo = new ProcessStartInfo
        {
            FileName = sofficePath,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = startInfo };

        if (!process.Start())
        {
            throw new InvalidOperationException("The LibreOffice process could not be started.");
        }

        var standardOutputTask = process.StandardOutput.ReadToEndAsync();
        var standardErrorTask = process.StandardError.ReadToEndAsync();

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(_libreOfficeOptions.ConversionTimeoutSeconds));

        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            TryKillProcess(process);
            throw new TimeoutException("The LibreOffice conversion timed out.");
        }

        var standardOutput = await standardOutputTask;
        var standardError = await standardErrorTask;

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                "The LibreOffice conversion failed." +
                $"{Environment.NewLine}STDOUT: {standardOutput}" +
                $"{Environment.NewLine}STDERR: {standardError}");
        }

        var expectedOutputPath = Path.Combine(
            converterOutputDirectory,
            safeBaseFileName + "." + targetFormat);

        if (File.Exists(expectedOutputPath))
        {
            return expectedOutputPath;
        }

        var generatedFiles = Directory.GetFiles(
            converterOutputDirectory,
            "*." + targetFormat);

        if (generatedFiles.Length > 0)
        {
            return generatedFiles[0];
        }

        throw new InvalidOperationException(
            "LibreOffice finished, but the target file could not be found." +
            $"{Environment.NewLine}STDOUT: {standardOutput}" +
            $"{Environment.NewLine}STDERR: {standardError}");
    }

    private string ResolveSofficePath()
    {
        var candidatePaths = GetSofficePathCandidates();

        foreach (var candidatePath in candidatePaths)
        {
            var sofficePath = GetFullPath(candidatePath);

            if (File.Exists(sofficePath))
            {
                return sofficePath;
            }
        }

        throw new FileNotFoundException(
            "The LibreOffice executable could not be found. " +
            "Set LibreOffice:ProgramPath or use a local appsettings override.",
            string.Join(Environment.NewLine, candidatePaths));
    }

    private string ResolveWorkingDirectory(string sofficePath)
    {
        if (!string.IsNullOrWhiteSpace(_libreOfficeOptions.WorkingDirectory))
        {
            return GetFullPath(_libreOfficeOptions.WorkingDirectory);
        }

        var programDirectory = Path.GetDirectoryName(sofficePath);

        if (string.IsNullOrWhiteSpace(programDirectory))
        {
            throw new InvalidOperationException("The LibreOffice working directory could not be resolved.");
        }

        return programDirectory;
    }

    private string[] GetSofficePathCandidates()
    {
        var candidates = new HashSet<string>(
            OperatingSystem.IsWindows()
                ? StringComparer.OrdinalIgnoreCase
                : StringComparer.Ordinal);

        AddCandidate(candidates, _libreOfficeOptions.ProgramPath);

        var executableNames = OperatingSystem.IsWindows()
            ? new[] { "soffice.exe" }
            : new[] { "soffice", "libreoffice" };

        foreach (var pathEntry in GetPathEntries())
        {
            foreach (var executableName in executableNames)
            {
                AddCandidate(candidates, Path.Combine(pathEntry, executableName));
            }
        }

        if (OperatingSystem.IsWindows())
        {
            AddCandidate(
                candidates,
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "LibreOffice",
                    "program",
                    "soffice.exe"));

            AddCandidate(
                candidates,
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "LibreOffice",
                    "program",
                    "soffice.exe"));
        }
        else if (OperatingSystem.IsMacOS())
        {
            AddCandidate(candidates, "/Applications/LibreOffice.app/Contents/MacOS/soffice");
            AddCandidate(candidates, "/opt/homebrew/bin/soffice");
            AddCandidate(candidates, "/usr/local/bin/soffice");
        }
        else if (OperatingSystem.IsLinux())
        {
            AddCandidate(candidates, "/usr/bin/soffice");
            AddCandidate(candidates, "/usr/bin/libreoffice");
            AddCandidate(candidates, "/snap/bin/libreoffice");
        }

        return candidates.ToArray();
    }

    private static string[] GetPathEntries()
    {
        var pathValue = Environment.GetEnvironmentVariable("PATH");

        if (string.IsNullOrWhiteSpace(pathValue))
        {
            return [];
        }

        return pathValue
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static void AddCandidate(ISet<string> candidates, string? candidate)
    {
        if (!string.IsNullOrWhiteSpace(candidate))
        {
            candidates.Add(candidate.Trim());
        }
    }

    private static string GetFullPath(string path)
    {
        var normalizedPath = NormalizeConfiguredPath(path);

        return Path.IsPathRooted(normalizedPath)
            ? Path.GetFullPath(normalizedPath)
            : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), normalizedPath));
    }

    private static string NormalizeConfiguredPath(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        var normalizedPath = path.Trim();

        if (!OperatingSystem.IsWindows())
        {
            normalizedPath = normalizedPath.Replace('\\', Path.DirectorySeparatorChar);
        }

        if (normalizedPath == "~")
        {
            return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        }

        if (normalizedPath.StartsWith("~/", StringComparison.Ordinal) ||
            normalizedPath.StartsWith("~\\", StringComparison.Ordinal))
        {
            var homeDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return Path.Combine(homeDirectory, normalizedPath[2..]);
        }

        return normalizedPath;
    }

    private static string BuildAvailableFileName(
        string outputRoot,
        string baseFileName,
        string extension)
    {
        var candidate = baseFileName + extension;

        if (!File.Exists(Path.Combine(outputRoot, candidate)))
        {
            return candidate;
        }

        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var counter = 1;

        while (true)
        {
            candidate = $"{baseFileName}-{timestamp}-{counter}{extension}";

            if (!File.Exists(Path.Combine(outputRoot, candidate)))
            {
                return candidate;
            }

            counter++;
        }
    }

    private static string SanitizeFileName(string fileName)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(fileName.Length);

        foreach (var ch in fileName)
        {
            builder.Append(Array.IndexOf(invalidChars, ch) >= 0 ? '_' : ch);
        }

        var sanitized = builder.ToString().Trim();

        return string.IsNullOrWhiteSpace(sanitized)
            ? "document"
            : sanitized;
    }

    private static string EnsureTrailingSeparator(string path)
    {
        return Path.EndsInDirectorySeparator(path)
            ? path
            : path + Path.DirectorySeparatorChar;
    }

    private static string Quote(string value)
    {
        return $"\"{value}\"";
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
        }
    }
}
