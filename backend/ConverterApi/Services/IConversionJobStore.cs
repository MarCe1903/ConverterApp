using ConverterApi.Models;

namespace ConverterApi.Services;

public interface IConversionJobStore
{
    void Add(ConversionJob job);

    ConversionJob? Get(string jobId);

    void Update(ConversionJob job);
}
