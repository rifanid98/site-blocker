using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class PasswordHasherTests
{
    [Fact]
    public void Verify_ReturnsTrue_ForCorrectPassword()
    {
        var hash = PasswordHasher.Hash("s3cret-pin");
        Assert.True(PasswordHasher.Verify("s3cret-pin", hash));
    }

    [Fact]
    public void Verify_ReturnsFalse_ForWrongPassword()
    {
        var hash = PasswordHasher.Hash("s3cret-pin");
        Assert.False(PasswordHasher.Verify("wrong", hash));
    }

    [Fact]
    public void Hash_IsSalted_SamePasswordGivesDifferentHashes()
    {
        Assert.NotEqual(PasswordHasher.Hash("same"), PasswordHasher.Hash("same"));
    }

    [Fact]
    public void Hash_DoesNotContainPlaintext()
    {
        Assert.DoesNotContain("plain-text-pw", PasswordHasher.Hash("plain-text-pw"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("garbage")]
    [InlineData("1.2")]
    [InlineData("x.y.z.w")]
    public void Verify_ReturnsFalse_ForMalformedStoredHash(string stored)
    {
        Assert.False(PasswordHasher.Verify("anything", stored));
    }

    [Fact]
    public void Hash_Throws_ForEmptyPassword()
    {
        Assert.Throws<ArgumentException>(() => PasswordHasher.Hash(""));
    }

    [Fact]
    public void Verify_ReturnsFalse_ForEmptyPassword()
    {
        var hash = PasswordHasher.Hash("abc");
        Assert.False(PasswordHasher.Verify("", hash));
    }
}
