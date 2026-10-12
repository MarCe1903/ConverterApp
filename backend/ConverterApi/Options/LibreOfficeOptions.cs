namespace ConverterApi.Options;

public sealed class LibreOfficeOptions
{
    public const string SectionName = "LibreOffice";

    public string ProgramPath { get; set; } = string.Empty;

    public string WorkingDirectory { get; set; } = string.Empty;

    public string UserProfileDirectory { get; set; } = string.Empty;

    public int StartupTimeoutSeconds { get; set; } = 30;

    public int ConversionTimeoutSeconds { get; set; } = 120;
}
