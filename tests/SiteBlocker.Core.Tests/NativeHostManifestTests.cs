using System.Text.Json;
using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class NativeHostManifestTests
{
    [Fact]
    public void Build_ProducesValidManifest_ForTheExtensionOrigin()
    {
        var json = NativeHostManifest.Build(@"C:\Apps\SiteBlocker\SiteBlocker.NativeHost.exe", new[] { "abc" });

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal("com.siteblocker.host", root.GetProperty("name").GetString());
        Assert.Equal("stdio", root.GetProperty("type").GetString());
        Assert.Equal(@"C:\Apps\SiteBlocker\SiteBlocker.NativeHost.exe", root.GetProperty("path").GetString());
        Assert.Equal("chrome-extension://abc/", root.GetProperty("allowed_origins")[0].GetString());
    }

    [Fact]
    public void Build_ListsEveryExtensionId()
    {
        var json = NativeHostManifest.Build("host.exe", new[] { "one", "two" });
        using var doc = JsonDocument.Parse(json);
        Assert.Equal(2, doc.RootElement.GetProperty("allowed_origins").GetArrayLength());
    }

    [Fact]
    public void Build_Throws_WhenNoExtensionIds()
    {
        Assert.Throws<ArgumentException>(() => NativeHostManifest.Build("host.exe", Array.Empty<string>()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void Build_Throws_ForEmptyPath(string path)
    {
        Assert.Throws<ArgumentException>(() => NativeHostManifest.Build(path, new[] { "abc" }));
    }

    [Fact]
    public void Build_EscapesBackslashesInPath()
    {
        var json = NativeHostManifest.Build(@"C:\a\b.exe", new[] { "abc" });
        Assert.Contains(@"C:\\a\\b.exe", json);
    }
}
