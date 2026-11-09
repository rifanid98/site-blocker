using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class BrowserPolicyTests
{
    private const string Id = "abcdefghijklmnopabcdefghijklmnop";
    private const string Url = "https://clients2.google.com/service/update2/crx";

    [Theory]
    [InlineData("abcdefghijklmnopabcdefghijklmnop", true)]
    [InlineData("kpinpjjnhkllnpfpblbobpjbijjeadcd", true)]
    [InlineData("", false)]
    [InlineData("tooshort", false)]
    [InlineData("ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP", false)]
    [InlineData("qbcdefghijklmnopabcdefghijklmnop", false)] // 'q' is outside a-p
    [InlineData("abcdefghijklmnopabcdefghijklmnopx", false)]
    public void IsValidExtensionId_FollowsChromiumFormat(string id, bool expected)
    {
        Assert.Equal(expected, BrowserPolicy.IsValidExtensionId(id));
    }

    [Fact]
    public void Entry_JoinsIdAndUpdateUrlWithSemicolon()
    {
        Assert.Equal($"{Id};{Url}", BrowserPolicy.Entry(Id, Url));
    }

    [Fact]
    public void PlanForcelist_AddsEntry_ToEmptyList()
    {
        var plan = BrowserPolicy.PlanForcelist(new Dictionary<string, string>(), Id, Url);
        Assert.Equal(new Dictionary<string, string> { ["1"] = $"{Id};{Url}" }, plan);
    }

    [Fact]
    public void PlanForcelist_KeepsOtherExtensions_AndUsesNextFreeName()
    {
        var existing = new Dictionary<string, string>
        {
            ["1"] = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz;https://example.test/update",
            ["3"] = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy;https://example.test/update",
        };

        var plan = BrowserPolicy.PlanForcelist(existing, Id, Url);

        Assert.Equal(3, plan.Count);
        Assert.Equal($"{Id};{Url}", plan["2"]);
        Assert.Equal(existing["1"], plan["1"]);
        Assert.Equal(existing["3"], plan["3"]);
    }

    [Fact]
    public void PlanForcelist_IsIdempotent()
    {
        var once = BrowserPolicy.PlanForcelist(new Dictionary<string, string>(), Id, Url);
        var twice = BrowserPolicy.PlanForcelist(once, Id, Url);
        Assert.Equal(once, twice);
    }

    [Fact]
    public void PlanForcelist_ReplacesStaleEntryForTheSameId()
    {
        var existing = new Dictionary<string, string> { ["1"] = $"{Id};https://old.example/update" };

        var plan = BrowserPolicy.PlanForcelist(existing, Id, Url);

        Assert.Single(plan);
        Assert.Equal($"{Id};{Url}", plan["1"]);
    }

    [Fact]
    public void PlanForcelist_Throws_ForInvalidId()
    {
        Assert.Throws<ArgumentException>(() => BrowserPolicy.PlanForcelist(new Dictionary<string, string>(), "bad", Url));
    }

    [Fact]
    public void PlanRemoval_DropsOnlyOurEntry()
    {
        var existing = new Dictionary<string, string>
        {
            ["1"] = $"{Id};{Url}",
            ["2"] = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz;https://example.test/update",
        };

        var plan = BrowserPolicy.PlanRemoval(existing, Id);

        Assert.Single(plan);
        Assert.True(plan.ContainsKey("2"));
    }

    [Fact]
    public void PlanRemoval_WhenAbsent_ChangesNothing()
    {
        var existing = new Dictionary<string, string> { ["1"] = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz;https://example.test/update" };
        Assert.Equal(existing, BrowserPolicy.PlanRemoval(existing, Id));
    }

    [Fact]
    public void IsApplied_TrueOnlyWhenEntryMatchesExactly()
    {
        var applied = BrowserPolicy.PlanForcelist(new Dictionary<string, string>(), Id, Url);
        Assert.True(BrowserPolicy.IsApplied(applied, Id, Url));
        Assert.False(BrowserPolicy.IsApplied(new Dictionary<string, string>(), Id, Url));
        Assert.False(BrowserPolicy.IsApplied(applied, Id, "https://other.example/update"));
    }

    [Fact]
    public void Targets_CoverChromeBraveAndEdge_WithTheirOwnStores()
    {
        var names = BrowserPolicy.Targets.Select(t => t.Name).ToList();
        Assert.Contains("Chrome", names);
        Assert.Contains("Brave", names);
        Assert.Contains("Edge", names);

        Assert.All(BrowserPolicy.Targets.Where(t => t.Store == ExtensionStore.Chrome),
            t => Assert.Equal(BrowserPolicy.ChromeWebStoreUpdateUrl, t.UpdateUrl));
        Assert.All(BrowserPolicy.Targets.Where(t => t.Store == ExtensionStore.Edge),
            t => Assert.Equal(BrowserPolicy.EdgeAddonsUpdateUrl, t.UpdateUrl));
    }
}
