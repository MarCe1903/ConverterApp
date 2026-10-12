using System.IO;
using ConverterApi.Models;
using ConverterApi.Options;
using ConverterApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ConverterApi.Controllers;

[ApiController]
[Route("api/convert")]
public sealed class ConvertController : ControllerBase
{
    private const long MaxFileSizeInBytes = 50 * 1024 * 1024;

    private readonly IConversionJobStore _jobStore;
    private readonly IConversionJobQueue _jobQueue;
    private readonly StorageOptions _storageOptions;

    public ConvertController(
        IConversionJobStore jobStore,
        IConversionJobQueue jobQueue,
        IOptions<StorageOptions> storageOptions)
    {
        _jobStore = jobStore;
        _jobQueue = jobQueue;
        _storageOptions = storageOptions.Value;
    }

    [HttpGet("formats")]
    public IActionResult GetSupportedFormats()
    {
        var formats = new[]
        {
            new
            {
                family = "word",
                sources = new[] { "doc", "docx", "odt" },
                targets = new[] { "pdf" }
            },
            new
            {
                family = "spreadsheet",
                sources = new[] { "xls", "xlsx", "ods" },
                targets = new[] { "pdf" }
            },
            new
            {
                family = "presentation",
                sources = new[] { "ppt", "pptx", "odp" },
                targets = new[] { "pdf" }
            }
        };

        return Ok(formats);
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> CreateJob(
        [FromForm] ConvertRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var formFile = request.File;

        if (formFile is null)
        {
            return BadRequest(new { message = "The file field is required." });
        }

        if (formFile.Length == 0)
        {
            return BadRequest(new { message = "The uploaded file cannot be empty." });
        }

        if (formFile.Length > MaxFileSizeInBytes)
        {
            return BadRequest(new { message = "The file size cannot exceed 50 MB." });
        }

        if (string.IsNullOrWhiteSpace(request.TargetFormat))
        {
            return BadRequest(new { message = "The targetFormat field is required." });
        }

        var sourceExtension = Path.GetExtension(formFile.FileName).ToLowerInvariant();
        var targetFormat = request.TargetFormat.Trim().ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(sourceExtension))
        {
            return BadRequest(new { message = "The file extension could not be detected." });
        }

        if (!IsSupportedSourceExtension(sourceExtension))
        {
            return BadRequest(new
            {
                message = "The source file extension is not supported.",
                sourceExtension
            });
        }

        if (!IsSupportedTargetFormat(targetFormat))
        {
            return BadRequest(new
            {
                message = "The target format is not supported.",
                targetFormat
            });
        }

        if (!IsSupportedConversion(sourceExtension, targetFormat))
        {
            return BadRequest(new
            {
                message = "This conversion combination is not supported.",
                sourceExtension,
                targetFormat
            });
        }

        var jobId = Guid.NewGuid().ToString("N");
        var inputRoot = GetFullPath(_storageOptions.InputDirectory);
        var safeBaseName = SanitizeFileName(Path.GetFileNameWithoutExtension(formFile.FileName));
        var jobDirectory = Path.Combine(inputRoot, jobId);
        var inputFilePath = Path.Combine(jobDirectory, safeBaseName + sourceExtension);

        Directory.CreateDirectory(jobDirectory);

        await using (var fileStream = new FileStream(
            inputFilePath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None))
        {
            await formFile.CopyToAsync(fileStream, cancellationToken);
        }

        var now = DateTime.UtcNow;

        var job = new ConversionJob
        {
            Id = jobId,
            OriginalFileName = formFile.FileName,
            SourceExtension = sourceExtension,
            TargetFormat = targetFormat,
            Status = ConversionJobStatus.Queued,
            Progress = 10,
            Message = "Queued for conversion.",
            InputFilePath = inputFilePath,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        _jobStore.Add(job);
        await _jobQueue.QueueAsync(job.Id, cancellationToken);

        return Accepted(new
        {
            jobId = job.Id,
            statusUrl = $"/api/convert/jobs/{job.Id}"
        });
    }

    [HttpGet("jobs/{jobId}")]
    public IActionResult GetJobStatus(string jobId)
    {
        var job = _jobStore.Get(jobId);

        if (job is null)
        {
            return NotFound(new { message = "The job could not be found." });
        }

        return Ok(job);
    }

    [HttpGet("jobs/{jobId}/download")]
    public IActionResult DownloadConvertedFile(string jobId)
    {
        var job = _jobStore.Get(jobId);

        if (job is null)
        {
            return NotFound(new { message = "The job could not be found." });
        }

        if (job.Status != ConversionJobStatus.Completed ||
            string.IsNullOrWhiteSpace(job.OutputFilePath) ||
            string.IsNullOrWhiteSpace(job.OutputFileName))
        {
            return Conflict(new { message = "The converted file is not ready yet." });
        }

        if (!System.IO.File.Exists(job.OutputFilePath))
        {
            return NotFound(new { message = "The converted file could not be found on disk." });
        }

        return PhysicalFile(
            job.OutputFilePath,
            "application/pdf",
            BuildUserFacingOutputFileName(job.OriginalFileName, job.TargetFormat));
    }

    private static bool IsSupportedSourceExtension(string sourceExtension)
    {
        return sourceExtension is
            ".doc" or ".docx" or ".odt" or
            ".xls" or ".xlsx" or ".ods" or
            ".ppt" or ".pptx" or ".odp";
    }

    private static bool IsSupportedTargetFormat(string targetFormat)
    {
        return targetFormat is "pdf";
    }

    private static bool IsSupportedConversion(string sourceExtension, string targetFormat)
    {
        return targetFormat == "pdf" && IsSupportedSourceExtension(sourceExtension);
    }

    private static string BuildUserFacingOutputFileName(string originalFileName, string targetFormat)
    {
        var safeBaseName = SanitizeFileName(Path.GetFileNameWithoutExtension(originalFileName));
        return safeBaseName + "." + targetFormat;
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

    private static string SanitizeFileName(string fileName)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var chars = fileName.ToCharArray();

        for (var i = 0; i < chars.Length; i++)
        {
            if (Array.IndexOf(invalidChars, chars[i]) >= 0)
            {
                chars[i] = '_';
            }
        }

        var sanitized = new string(chars).Trim();

        return string.IsNullOrWhiteSpace(sanitized)
            ? "document"
            : sanitized;
    }

    public sealed class ConvertRequest
    {
        public IFormFile? File { get; set; }

        public string? TargetFormat { get; set; }
    }
}
