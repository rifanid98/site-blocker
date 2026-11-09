using System.Diagnostics;

namespace SiteBlocker.Core;

/// <summary>Reads the hosts file, brings the SiteBlocker block up to date, and flushes the DNS cache when it changed.</summary>
public sealed class HostsApplier
{
    private readonly string _hostsPath;
    private readonly bool _flushDns;

    public HostsApplier(string hostsPath, bool flushDns = true)
    {
        _hostsPath = hostsPath;
        _flushDns = flushDns;
    }

    /// <returns>true when the file was changed.</returns>
    public bool EnsureApplied(IEnumerable<string> domains)
    {
        var list = domains.ToList();
        var current = File.Exists(_hostsPath) ? File.ReadAllText(_hostsPath) : "";
        if (HostsFileWriter.IsUpToDate(current, list)) return false;

        File.WriteAllText(_hostsPath, HostsFileWriter.Apply(current, list));
        if (_flushDns) FlushDns();
        return true;
    }

    private static void FlushDns()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo("ipconfig", "/flushdns")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
            });
            process?.WaitForExit(5000);
        }
        catch (Exception)
        {
            // The hosts change still applies once the cache expires; a flush failure is not fatal.
        }
    }
}
