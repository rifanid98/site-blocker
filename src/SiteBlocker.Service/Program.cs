using SiteBlocker.Service;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "SiteBlocker");
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
