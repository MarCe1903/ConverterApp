namespace ConverterApi.Options;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    public string InputDirectory { get; set; } = "temp/input";

    public string OutputDirectory { get; set; } = "temp/output";

    public int MaxFileSizeInMb { get; set; } = 50;
}
