using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class ProtectionTests
{
    private const string ChromeId = "abcdefghijklmnopabcdefghijklmnop";
    private const string EdgeId = "ponmlkjihgfedcbaponmlkjihgfedcba";

    private sealed class MemoryStore : IConfigStore
    {
        public AppConfig Config { get; set; } = new();
        public AppConfig Load() => Config;
        public void Save(AppConfig config) => Config = config;
    }

    private static BlockListService Create(string password = "pw123")
    {
        var svc = new BlockListService(new MemoryStore());
        svc.SetInitialPassword(password);
        return svc;
    }

    [Fact]
    public void Protection_IsOffByDefault_WithNoTargets()
    {
        var svc = Create();
        Assert.False(svc.ProtectionEnabled);
        Assert.Empty(svc.ProtectionEntries());
    }

    [Fact]
    public void EnableProtection_NeedsNoPassword_AndYieldsEntriesPerBrowser()
    {
        var svc = Create();
        svc.EnableProtection(ChromeId, EdgeId);

        Assert.True(svc.ProtectionEnabled);
        var entries = svc.ProtectionEntries();

        Assert.All(entries.Where(e => e.Target.Store == ExtensionStore.Chrome), e => Assert.Equal(ChromeId, e.ExtensionId));
        Assert.All(entries.Where(e => e.Target.Store == ExtensionStore.Edge), e => Assert.Equal(EdgeId, e.ExtensionId));
        Assert.Contains(entries, e => e.Target.Name == "Brave");
    }

    [Fact]
    public void EnableProtection_WithOnlyChromeId_SkipsEdge()
    {
        var svc = Create();
        svc.EnableProtection(ChromeId, null);

        var entries = svc.ProtectionEntries();
        Assert.DoesNotContain(entries, e => e.Target.Name == "Edge");
        Assert.Contains(entries, e => e.Target.Name == "Chrome");
    }

    [Fact]
    public void EnableProtection_RejectsInvalidOrMissingIds()
    {
        var svc = Create();
        Assert.Throws<ArgumentException>(() => svc.EnableProtection("bad", null));
        Assert.Throws<ArgumentException>(() => svc.EnableProtection(null, null));
        Assert.Throws<ArgumentException>(() => svc.EnableProtection(ChromeId, "bad"));
        Assert.False(svc.ProtectionEnabled);
    }

    [Fact]
    public void EnableProtection_Throws_WhenAlreadyEnabled()
    {
        var svc = Create();
        svc.EnableProtection(ChromeId, null);
        Assert.Throws<InvalidOperationException>(() => svc.EnableProtection(ChromeId, EdgeId));
    }

    [Fact]
    public void DisableProtection_NeedsCorrectPassword()
    {
        var svc = Create("pw123");
        svc.EnableProtection(ChromeId, EdgeId);

        Assert.False(svc.DisableProtection("wrong"));
        Assert.True(svc.ProtectionEnabled);

        Assert.True(svc.DisableProtection("pw123"));
        Assert.False(svc.ProtectionEnabled);
        Assert.Empty(svc.ProtectionEntries());
    }

    [Fact]
    public void DisableProtection_WhenNotEnabled_ReturnsFalse()
    {
        var svc = Create("pw123");
        Assert.False(svc.DisableProtection("pw123"));
    }

    [Fact]
    public void ExtensionIds_ListsEveryConfiguredId_ForTheNativeHostManifest()
    {
        var svc = Create();
        Assert.Empty(svc.ProtectedExtensionIds());

        svc.EnableProtection(ChromeId, EdgeId);
        Assert.Equal(new[] { ChromeId, EdgeId }, svc.ProtectedExtensionIds());
    }
}
