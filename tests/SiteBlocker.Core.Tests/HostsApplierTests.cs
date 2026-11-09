using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class HostsApplierTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "siteblocker-hosts-" + Guid.NewGuid().ToString("N"));
    private readonly string _hosts;

    public HostsApplierTests()
    {
        Directory.CreateDirectory(_dir);
        _hosts = Path.Combine(_dir, "hosts");
        File.WriteAllText(_hosts, "127.0.0.1 localhost\r\n");
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void EnsureApplied_WritesBlock_AndReportsChange()
    {
        var applier = new HostsApplier(_hosts, flushDns: false);
        Assert.True(applier.EnsureApplied(new[] { "a.com" }));
        Assert.Contains("0.0.0.0 a.com", File.ReadAllText(_hosts));
    }

    [Fact]
    public void EnsureApplied_SecondCall_ReportsNoChange()
    {
        var applier = new HostsApplier(_hosts, flushDns: false);
        applier.EnsureApplied(new[] { "a.com" });
        Assert.False(applier.EnsureApplied(new[] { "a.com" }));
    }

    [Fact]
    public void EnsureApplied_RestoresBlock_AfterTampering()
    {
        var applier = new HostsApplier(_hosts, flushDns: false);
        applier.EnsureApplied(new[] { "a.com" });
        File.WriteAllText(_hosts, "127.0.0.1 localhost\r\n");

        Assert.True(applier.EnsureApplied(new[] { "a.com" }));
        Assert.Contains("0.0.0.0 a.com", File.ReadAllText(_hosts));
    }

    [Fact]
    public void EnsureApplied_CreatesHostsFile_WhenMissing()
    {
        File.Delete(_hosts);
        var applier = new HostsApplier(_hosts, flushDns: false);
        Assert.True(applier.EnsureApplied(new[] { "a.com" }));
        Assert.True(File.Exists(_hosts));
    }
}
