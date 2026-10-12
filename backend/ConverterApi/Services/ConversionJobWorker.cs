using ConverterApi.Models;
using Microsoft.Extensions.DependencyInjection;

namespace ConverterApi.Services;

public sealed class ConversionJobWorker : BackgroundService
{
    private readonly IConversionJobQueue _jobQueue;
    private readonly IConversionJobStore _jobStore;
    private readonly IServiceScopeFactory _scopeFactory;

    public ConversionJobWorker(
        IConversionJobQueue jobQueue,
        IConversionJobStore jobStore,
        IServiceScopeFactory scopeFactory)
    {
        _jobQueue = jobQueue;
        _jobStore = jobStore;
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var jobId = await _jobQueue.DequeueAsync(stoppingToken);
            var job = _jobStore.Get(jobId);

            if (job is null)
            {
                continue;
            }

            try
            {
                job.Status = ConversionJobStatus.Processing;
                job.Progress = 60;
                job.Message = "Converting document...";
                job.UpdatedAtUtc = DateTime.UtcNow;
                _jobStore.Update(job);

                using var scope = _scopeFactory.CreateScope();
                var conversionService = scope.ServiceProvider
                    .GetRequiredService<ILibreOfficeConversionService>();

                var result = await conversionService.ConvertAsync(
                    job.InputFilePath,
                    job.OriginalFileName,
                    job.TargetFormat,
                    stoppingToken);

                job.Status = ConversionJobStatus.Completed;
                job.Progress = 100;
                job.Message = "Conversion completed.";
                job.OutputFileName = result.OutputFileName;
                job.OutputFilePath = result.OutputFilePath;
                job.ErrorMessage = null;
                job.UpdatedAtUtc = DateTime.UtcNow;
                _jobStore.Update(job);
            }
            catch (Exception ex)
            {
                job.Status = ConversionJobStatus.Failed;
                job.Progress = 100;
                job.Message = "Conversion failed.";
                job.ErrorMessage = ex.Message;
                job.UpdatedAtUtc = DateTime.UtcNow;
                _jobStore.Update(job);
            }
        }
    }
}
