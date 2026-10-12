namespace ConverterApi.Services;

public interface IConversionJobQueue
{
    ValueTask QueueAsync(string jobId, CancellationToken cancellationToken);

    ValueTask<string> DequeueAsync(CancellationToken cancellationToken);
}
