using System.Collections.Concurrent;
using ConverterApi.Models;

namespace ConverterApi.Services;

public sealed class InMemoryConversionJobStore : IConversionJobStore
{
    private readonly ConcurrentDictionary<string, ConversionJob> _jobs = new();

    public void Add(ConversionJob job)
    {
        _jobs[job.Id] = job;
    }

    public ConversionJob? Get(string jobId)
    {
        return _jobs.TryGetValue(jobId, out var job)
            ? job
            : null;
    }

    public void Update(ConversionJob job)
    {
        _jobs[job.Id] = job;
    }
}
