using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class BlockListServiceTests
{
    private sealed class MemoryStore : IConfigStore
    {
        public AppConfig Config { get; set; } = new();
        public AppConfig Load() => Config;
        public void Save(AppConfig config) => Config = config;
    }

    private static (BlockListService svc, MemoryStore store) Create(string? password = "pw123")
    {
        var store = new MemoryStore();
        var svc = new BlockListService(store);
        if (password != null) svc.SetInitialPassword(password);
        return (svc, store);
    }

    [Fact]
    public void SetInitialPassword_StoresHash_NotPlaintext()
    {
        var (_, store) = Create("pw123");
        Assert.NotNull(store.Config.PasswordHash);
        Assert.DoesNotContain("pw123", store.Config.PasswordHash!);
    }

    [Fact]
    public void SetInitialPassword_Throws_WhenAlreadySet()
    {
        var (svc, _) = Create("pw123");
        Assert.Throws<InvalidOperationException>(() => svc.SetInitialPassword("other"));
    }

    [Fact]
    public void AddRule_NewDomain_NeedsNoPassword()
    {
        var (svc, store) = Create();
        svc.AddRule("https://www.Facebook.com/", BlockMode.BlockExcept, new[] { "/marketplace*" });

        var rule = Assert.Single(store.Config.Rules);
        Assert.Equal("facebook.com", rule.Domain);
        Assert.Equal(BlockMode.BlockExcept, rule.Mode);
        Assert.Equal(new[] { "/marketplace*" }, rule.AllowPaths);
    }

    [Fact]
    public void AddRule_Throws_ForInvalidDomain()
    {
        var (svc, _) = Create();
        Assert.Throws<ArgumentException>(() => svc.AddRule("not a domain", BlockMode.BlockAll, Array.Empty<string>()));
    }

    [Fact]
    public void AddRule_ExistingDomain_ThrowsWithoutPassword()
    {
        var (svc, _) = Create();
        svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>());
        Assert.Throws<InvalidOperationException>(() => svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>()));
    }

    [Fact]
    public void RemoveRule_WithCorrectPassword_Removes()
    {
        var (svc, store) = Create("pw123");
        svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>());

        Assert.True(svc.RemoveRule("a.com", "pw123"));
        Assert.Empty(store.Config.Rules);
    }

    [Fact]
    public void RemoveRule_WithWrongPassword_KeepsRule()
    {
        var (svc, store) = Create("pw123");
        svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>());

        Assert.False(svc.RemoveRule("a.com", "nope"));
        Assert.Single(store.Config.Rules);
    }

    [Fact]
    public void RemoveRule_UnknownDomain_ReturnsFalse()
    {
        var (svc, _) = Create("pw123");
        Assert.False(svc.RemoveRule("missing.com", "pw123"));
    }

    [Fact]
    public void UpdateRule_NeedsPassword_AndReplacesRule()
    {
        var (svc, store) = Create("pw123");
        svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>());

        Assert.False(svc.UpdateRule("a.com", BlockMode.BlockExcept, new[] { "/ok*" }, "bad"));
        Assert.Equal(BlockMode.BlockAll, store.Config.Rules[0].Mode);

        Assert.True(svc.UpdateRule("a.com", BlockMode.BlockExcept, new[] { "/ok*" }, "pw123"));
        Assert.Equal(BlockMode.BlockExcept, store.Config.Rules[0].Mode);
    }

    [Fact]
    public void ChangePassword_RequiresOldPassword()
    {
        var (svc, _) = Create("pw123");
        Assert.False(svc.ChangePassword("wrong", "new"));
        Assert.True(svc.ChangePassword("pw123", "new"));
        Assert.True(svc.VerifyPassword("new"));
        Assert.False(svc.VerifyPassword("pw123"));
    }

    [Fact]
    public void VerifyPassword_False_WhenNoPasswordSet()
    {
        var (svc, _) = Create(password: null);
        Assert.False(svc.VerifyPassword("anything"));
    }

    [Fact]
    public void BlockAllDomains_ListsOnlyBlockAllRules_ForHostsFile()
    {
        var (svc, _) = Create();
        svc.AddRule("a.com", BlockMode.BlockAll, Array.Empty<string>());
        svc.AddRule("facebook.com", BlockMode.BlockExcept, new[] { "/marketplace*" });

        Assert.Equal(new[] { "a.com" }, svc.HostsFileDomains());
    }
}
