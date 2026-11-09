using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class JsonConfigStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "siteblocker-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }

    [Fact]
    public void Load_ReturnsEmptyConfig_WhenFileMissing()
    {
        var store = new JsonConfigStore(Path.Combine(_dir, "config.json"));
        var config = store.Load();
        Assert.Empty(config.Rules);
        Assert.Null(config.PasswordHash);
    }

    [Fact]
    public void SaveThenLoad_RoundTrips()
    {
        var path = Path.Combine(_dir, "config.json");
        var store = new JsonConfigStore(path);
        store.Save(new AppConfig
        {
            PasswordHash = "h",
            Rules = { new BlockRule("facebook.com", BlockMode.BlockExcept, new[] { "/marketplace*" }) },
        });

        var loaded = new JsonConfigStore(path).Load();
        Assert.Equal("h", loaded.PasswordHash);
        var rule = Assert.Single(loaded.Rules);
        Assert.Equal("facebook.com", rule.Domain);
        Assert.Equal(BlockMode.BlockExcept, rule.Mode);
        Assert.Equal(new[] { "/marketplace*" }, rule.AllowPaths);
    }

    [Fact]
    public void Load_Throws_OnCorruptFile_InsteadOfSilentlyUnblocking()
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "config.json");
        File.WriteAllText(path, "{ not json");
        Assert.Throws<InvalidDataException>(() => new JsonConfigStore(path).Load());
    }

    [Fact]
    public void ExtensionJson_UsesCamelCaseModes_ForTheBrowserExtension()
    {
        var json = JsonConfigStore.RulesToExtensionJson(new[]
        {
            new BlockRule("facebook.com", BlockMode.BlockExcept, new[] { "/marketplace*" }),
            new BlockRule("a.com", BlockMode.BlockAll, Array.Empty<string>()),
        });

        Assert.Contains("\"mode\":\"blockExcept\"", json);
        Assert.Contains("\"mode\":\"blockAll\"", json);
        Assert.Contains("\"allowPaths\":[\"/marketplace*\"]", json);
        Assert.Contains("\"domain\":\"facebook.com\"", json);
    }
}
