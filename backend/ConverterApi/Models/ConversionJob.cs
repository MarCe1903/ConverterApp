using System.Text.Json.Serialization;

namespace ConverterApi.Models;

public sealed class ConversionJob
{
    public string Id { get; set; } = string.Empty;

    public string OriginalFileName { get; set; } = string.Empty;

    public string SourceExtension { get; set; } = string.Empty;

    public string TargetFormat { get; set; } = string.Empty;

    public ConversionJobStatus Status { get; set; }

    public int Progress { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? OutputFileName { get; set; }

    public string? OutputFilePath { get; set; }

    public string? ErrorMessage { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    [JsonIgnore]
    public string InputFilePath { get; set; } = string.Empty;
}
