using System.Runtime.Versioning;
using SiteBlocker.Core;

namespace SiteBlocker.Service;

/// <summary>Keeps the hosts-file block and the browser force-install policy in place: re-applies them whenever someone edits them away.</summary>
[SupportedOSPlatform("windows")]
public class Worker : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(15);

    private readonly ILogger<Worker> _logger;
    private readonly JsonConfigStore _store = new(AppPaths.ConfigFile);
    private readonly HostsApplier _hosts = new(AppPaths.HostsFile);

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            Enforce();
            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private void Enforce()
    {
        try
        {
            var service = new BlockListService(_store);

            var domains = service.HostsFileDomains();
            if (_hosts.EnsureApplied(domains))
                _logger.LogInformation("Hosts block was missing or changed; restored it ({Count} domains).", domains.Count);

            var protection = service.ProtectionEntries();
            if (protection.Count > 0 && PolicyRegistry.EnsureApplied(protection))
                _logger.LogInformation("Browser force-install policy was missing or changed; restored it.");
        }
        catch (Exception ex)
        {
            // Never crash the service, and never loosen the block because the config could not be read.
            _logger.LogError(ex, "Could not enforce the hosts block; will retry.");
        }
    }
}
