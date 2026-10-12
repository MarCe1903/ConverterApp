namespace ConverterApi.Models;

public sealed class ConversionResult
{
    public required string OutputFileName { get; init; }

    public required string OutputFilePath { get; init; }

    public required string SourceExtension { get; init; }

    public required string TargetFormat { get; init; }
}
