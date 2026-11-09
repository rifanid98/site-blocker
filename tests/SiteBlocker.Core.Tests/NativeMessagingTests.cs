using System.Text;
using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class NativeMessagingTests
{
    [Fact]
    public void WriteThenRead_RoundTripsMessage()
    {
        using var stream = new MemoryStream();
        NativeMessaging.Write(stream, "{\"type\":\"getRules\"}");
        stream.Position = 0;
        Assert.Equal("{\"type\":\"getRules\"}", NativeMessaging.Read(stream));
    }

    [Fact]
    public void Write_PrefixesLittleEndianLength()
    {
        using var stream = new MemoryStream();
        NativeMessaging.Write(stream, "abc");
        var bytes = stream.ToArray();
        Assert.Equal(new byte[] { 3, 0, 0, 0 }, bytes[..4]);
        Assert.Equal("abc", Encoding.UTF8.GetString(bytes[4..]));
    }

    [Fact]
    public void Write_UsesByteLength_ForMultibyteText()
    {
        using var stream = new MemoryStream();
        NativeMessaging.Write(stream, "é");
        Assert.Equal(2, stream.ToArray()[0]);
    }

    [Fact]
    public void Read_ReturnsNull_OnEmptyStream()
    {
        using var stream = new MemoryStream();
        Assert.Null(NativeMessaging.Read(stream));
    }

    [Fact]
    public void Read_Throws_OnTruncatedBody()
    {
        using var stream = new MemoryStream(new byte[] { 10, 0, 0, 0, 65, 66 });
        Assert.Throws<EndOfStreamException>(() => NativeMessaging.Read(stream));
    }

    [Fact]
    public void Read_Throws_WhenMessageExceedsLimit()
    {
        using var stream = new MemoryStream(new byte[] { 0xFF, 0xFF, 0xFF, 0x7F });
        Assert.Throws<InvalidDataException>(() => NativeMessaging.Read(stream));
    }

    [Fact]
    public void HandleRequest_GetRules_ReturnsRulesEnvelope()
    {
        var rules = new[] { new BlockRule("a.com", BlockMode.BlockAll, Array.Empty<string>()) };
        var reply = NativeMessaging.HandleRequest("{\"type\":\"getRules\"}", rules);
        Assert.Contains("\"rules\":[", reply);
        Assert.Contains("\"domain\":\"a.com\"", reply);
    }

    [Theory]
    [InlineData("{\"type\":\"nope\"}")]
    [InlineData("not json")]
    [InlineData("")]
    public void HandleRequest_UnknownOrInvalid_ReturnsError(string request)
    {
        var reply = NativeMessaging.HandleRequest(request, Array.Empty<BlockRule>());
        Assert.Contains("\"error\"", reply);
        Assert.DoesNotContain("\"rules\"", reply);
    }
}
