using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class RuleMatcherTests
{
    private static BlockRule FacebookExceptMarketplace() =>
        new("facebook.com", BlockMode.BlockExcept, new[] { "/marketplace*" });

    [Theory]
    [InlineData("https://facebook.com/")]
    [InlineData("https://www.facebook.com/")]
    [InlineData("https://m.facebook.com/profile.php?id=1")]
    [InlineData("https://www.facebook.com/groups/123")]
    [InlineData("https://www.facebook.com/market")]
    public void BlockExcept_BlocksEverythingOutsideAllowedPaths(string url)
    {
        var matcher = new RuleMatcher(new[] { FacebookExceptMarketplace() });
        Assert.True(matcher.IsBlocked(url));
    }

    [Theory]
    [InlineData("https://www.facebook.com/marketplace")]
    [InlineData("https://www.facebook.com/marketplace/")]
    [InlineData("https://www.facebook.com/marketplace/item/999")]
    [InlineData("https://www.facebook.com/marketplace?x=1")]
    [InlineData("https://facebook.com/MarketPlace/category/cars")]
    public void BlockExcept_AllowsMarketplacePaths(string url)
    {
        var matcher = new RuleMatcher(new[] { FacebookExceptMarketplace() });
        Assert.False(matcher.IsBlocked(url));
    }

    [Theory]
    [InlineData("https://facebook.com/")]
    [InlineData("https://www.facebook.com/marketplace")]
    [InlineData("http://sub.facebook.com/anything")]
    public void BlockAll_BlocksEveryPath(string url)
    {
        var matcher = new RuleMatcher(new[] { new BlockRule("facebook.com", BlockMode.BlockAll, Array.Empty<string>()) });
        Assert.True(matcher.IsBlocked(url));
    }

    [Theory]
    [InlineData("https://example.com/")]
    [InlineData("https://notfacebook.com/")]
    [InlineData("https://facebook.com.evil.org/")]
    [InlineData("https://fbcdn.net/x.jpg")]
    public void UnrelatedHosts_AreNotBlocked(string url)
    {
        var matcher = new RuleMatcher(new[] { FacebookExceptMarketplace() });
        Assert.False(matcher.IsBlocked(url));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not a url")]
    [InlineData("chrome://extensions")]
    public void InvalidOrNonHttpUrls_AreNotBlocked(string url)
    {
        var matcher = new RuleMatcher(new[] { FacebookExceptMarketplace() });
        Assert.False(matcher.IsBlocked(url));
    }

    [Fact]
    public void NoRules_BlocksNothing()
    {
        var matcher = new RuleMatcher(Array.Empty<BlockRule>());
        Assert.False(matcher.IsBlocked("https://facebook.com/"));
    }

    [Theory]
    [InlineData("Facebook.com", "facebook.com")]
    [InlineData("https://www.Facebook.com/", "facebook.com")]
    [InlineData("  www.facebook.com/path  ", "facebook.com")]
    public void NormalizeDomain_StripsSchemeWwwAndPath(string input, string expected)
    {
        Assert.Equal(expected, BlockRule.NormalizeDomain(input));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not a domain")]
    public void NormalizeDomain_RejectsInvalidInput(string input)
    {
        Assert.Throws<ArgumentException>(() => BlockRule.NormalizeDomain(input));
    }

    [Fact]
    public void ExactAllowedPath_WithoutWildcard_MatchesPathAndSubSegmentsOnly()
    {
        var rule = new BlockRule("example.com", BlockMode.BlockExcept, new[] { "/docs" });
        var matcher = new RuleMatcher(new[] { rule });
        Assert.False(matcher.IsBlocked("https://example.com/docs"));
        Assert.False(matcher.IsBlocked("https://example.com/docs/intro"));
        Assert.True(matcher.IsBlocked("https://example.com/docsx"));
    }
}
