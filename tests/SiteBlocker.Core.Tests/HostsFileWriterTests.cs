using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class HostsFileWriterTests
{
    private const string Original = "127.0.0.1 localhost\r\n::1 localhost\r\n";

    [Fact]
    public void Apply_AppendsMarkedBlock_WithBareAndWwwEntries()
    {
        var result = HostsFileWriter.Apply(Original, new[] { "example.com" });

        Assert.StartsWith(Original, result);
        Assert.Contains(HostsFileWriter.BeginMarker, result);
        Assert.Contains("0.0.0.0 example.com", result);
        Assert.Contains("0.0.0.0 www.example.com", result);
        Assert.Contains(HostsFileWriter.EndMarker, result);
    }

    [Fact]
    public void Apply_IsIdempotent()
    {
        var once = HostsFileWriter.Apply(Original, new[] { "example.com" });
        var twice = HostsFileWriter.Apply(once, new[] { "example.com" });
        Assert.Equal(once, twice);
    }

    [Fact]
    public void Apply_ReplacesPreviousBlock_WhenListChanges()
    {
        var first = HostsFileWriter.Apply(Original, new[] { "a.com" });
        var second = HostsFileWriter.Apply(first, new[] { "b.com" });

        Assert.DoesNotContain("a.com", second);
        Assert.Contains("0.0.0.0 b.com", second);
        Assert.StartsWith(Original, second);
    }

    [Fact]
    public void Apply_WithNoDomains_RemovesBlockAndRestoresOriginal()
    {
        var blocked = HostsFileWriter.Apply(Original, new[] { "a.com" });
        var cleared = HostsFileWriter.Apply(blocked, Array.Empty<string>());
        Assert.Equal(Original, cleared);
    }

    [Fact]
    public void Apply_PreservesUserEntriesOutsideTheBlock()
    {
        var content = "127.0.0.1 localhost\r\n10.0.0.5 myserver\r\n";
        var result = HostsFileWriter.Apply(content, new[] { "a.com" });
        Assert.Contains("10.0.0.5 myserver", result);
    }

    [Fact]
    public void Apply_DeduplicatesDomains_AndSkipsEmpty()
    {
        var result = HostsFileWriter.Apply(Original, new[] { "a.com", "A.com", "", "www.a.com" });
        Assert.Equal(1, CountOccurrences(result, "0.0.0.0 a.com"));
        Assert.Equal(1, CountOccurrences(result, "0.0.0.0 www.a.com"));
    }

    [Fact]
    public void Apply_HandlesEmptyOriginal()
    {
        var result = HostsFileWriter.Apply("", new[] { "a.com" });
        Assert.Contains("0.0.0.0 a.com", result);
    }

    [Fact]
    public void ContainsExactBlock_DetectsTampering()
    {
        var applied = HostsFileWriter.Apply(Original, new[] { "a.com" });
        Assert.True(HostsFileWriter.IsUpToDate(applied, new[] { "a.com" }));

        var tampered = applied.Replace("0.0.0.0 a.com", "# 0.0.0.0 a.com");
        Assert.False(HostsFileWriter.IsUpToDate(tampered, new[] { "a.com" }));
    }

    private static int CountOccurrences(string text, string needle)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf(needle, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += needle.Length;
        }
        return count;
    }
}
