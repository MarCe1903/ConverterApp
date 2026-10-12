using ConverterApi.Models;

namespace ConverterApi.Services;

public interface ILibreOfficeConversionService
{
    Task<ConversionResult> ConvertAsync(
        string inputFilePath,
        string originalFileName,
        string targetFormat,
        CancellationToken cancellationToken);
}
