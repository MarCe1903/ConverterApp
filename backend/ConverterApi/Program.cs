using System.Text.Json.Serialization;
using ConverterApi.Options;
using ConverterApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true)
    .AddJsonFile(
        $"appsettings.{builder.Environment.EnvironmentName}.Local.json",
        optional: true,
        reloadOnChange: true);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.Configure<LibreOfficeOptions>(
    builder.Configuration.GetSection(LibreOfficeOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));

builder.Services.AddSingleton<IConversionJobStore, InMemoryConversionJobStore>();
builder.Services.AddSingleton<IConversionJobQueue, ConversionJobQueue>();
builder.Services.AddScoped<ILibreOfficeConversionService, LibreOfficeConversionService>();
builder.Services.AddHostedService<ConversionJobWorker>();

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (allowedOrigins.Length == 0)
        {
            return;
        }

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();
var hasFrontendAssets =
    !string.IsNullOrWhiteSpace(app.Environment.WebRootPath) &&
    Directory.Exists(app.Environment.WebRootPath) &&
    File.Exists(Path.Combine(app.Environment.WebRootPath, "index.html"));
var configuredUrls =
    builder.Configuration["ASPNETCORE_URLS"] ??
    Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
var shouldUseHttpsRedirection =
    !string.IsNullOrWhiteSpace(configuredUrls) &&
    configuredUrls.Contains("https://", StringComparison.OrdinalIgnoreCase);

if (shouldUseHttpsRedirection)
{
    app.UseHttpsRedirection();
}

app.UseCors("Frontend");
app.UseAuthorization();

if (hasFrontendAssets)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.MapControllers();

if (hasFrontendAssets)
{
    app.MapFallbackToFile("index.html");
}
else
{
    app.MapGet("/", () => Results.Ok(new
    {
        application = "Converter API",
        status = "ready",
        mode = "background-jobs"
    }));
}

app.Run();
