using System.Text.RegularExpressions;
using SiteBlocker.Core;
using Xunit;

namespace SiteBlocker.Core.Tests;

public class ShutdownCommandTests
{
    [Fact]
    public void Arguments_BuildsShutdownWithDelayAndMessage()
    {
        Assert.Equal("/s /t 15 /c \"Blocked site opened\"", ShutdownCommand.Arguments(15, "Blocked site opened"));
    }

    [Fact]
    public void Arguments_NeverForcesAppsToClose()
    {
        Assert.DoesNotContain("/f", ShutdownCommand.Arguments(15, "x"));
    }

    [Theory]
    [InlineData(601)]
    [InlineData(-1)]
    public void Arguments_Throws_OutsideTheAllowedDelayRange(int delay)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => ShutdownCommand.Arguments(delay, "x"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(600)]
    public void Arguments_AcceptsTheBounds(int delay)
    {
        Assert.Contains($"/t {delay} ", ShutdownCommand.Arguments(delay, "x"));
    }

    [Fact]
    public void Arguments_SanitizesTheMessage()
    {
        var args = ShutdownCommand.Arguments(10, "say \"hi\"\r\nthere");
        Assert.Equal("/s /t 10 /c \"say 'hi' there\"", args);
    }

    [Fact]
    public void Arguments_TruncatesLongMessages()
    {
        var args = ShutdownCommand.Arguments(10, new string('a', 500));
        Assert.True(args.Length < 260);
    }

    [Theory]
    [InlineData(-5, 0)]
    [InlineData(0, 0)]
    [InlineData(5, 5)]
    [InlineData(30, 30)]
    [InlineData(600, 600)]
    [InlineData(99999, 600)]
    public void ClampDelay_KeepsValuesInRange(int input, int expected)
    {
        Assert.Equal(expected, ShutdownCommand.ClampDelay(input));
    }
}

public class NativeMessagingShutdownTests
{
    private static NativeReply Handle(string request) => NativeMessaging.Handle(request, Array.Empty<BlockRule>());

    [Fact]
    public void Shutdown_Request_ReturnsSecondsAndHost()
    {
        var reply = Handle("{\"type\":\"shutdown\",\"seconds\":20,\"host\":\"facebook.com\"}");

        Assert.NotNull(reply.Shutdown);
        Assert.Equal(20, reply.Shutdown!.Seconds);
        Assert.Equal("facebook.com", reply.Shutdown.Host);
        Assert.Contains("\"ok\":true", reply.Json);
    }

    [Theory]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":-3,\"host\":\"a.com\"}", 0)]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":0,\"host\":\"a.com\"}", 0)]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":99999,\"host\":\"a.com\"}", 600)]
    [InlineData("{\"type\":\"shutdown\",\"host\":\"a.com\"}", 15)]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":\"soon\",\"host\":\"a.com\"}", 15)]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":2.5,\"host\":\"a.com\"}", 15)]
    public void Shutdown_Seconds_AreClampedOrDefaulted(string request, int expected)
    {
        Assert.Equal(expected, Handle(request).Shutdown!.Seconds);
    }

    [Fact]
    public void Shutdown_Host_IsReducedToSafeCharacters()
    {
        var reply = Handle("{\"type\":\"shutdown\",\"seconds\":10,\"host\":\"evil.com\\\"; calc & \\\\x\"}");
        Assert.Matches(new Regex("^[a-z0-9.-]*$"), reply.Shutdown!.Host);
    }

    [Fact]
    public void Shutdown_MissingHost_StillShutsDown_WithEmptyHost()
    {
        var reply = Handle("{\"type\":\"shutdown\",\"seconds\":10}");
        Assert.Equal("", reply.Shutdown!.Host);
    }

    [Fact]
    public void Ping_RepliesOk_WithoutShuttingDown()
    {
        var reply = Handle("{\"type\":\"ping\"}");
        Assert.Contains("\"ok\":true", reply.Json);
        Assert.Null(reply.Shutdown);
    }

    [Fact]
    public void GetRules_NeverShutsDown()
    {
        var reply = Handle("{\"type\":\"getRules\"}");
        Assert.Contains("\"rules\"", reply.Json);
        Assert.Null(reply.Shutdown);
    }

    [Theory]
    [InlineData("{\"type\":\"nope\"}")]
    [InlineData("not json")]
    [InlineData("")]
    [InlineData("[]")]
    public void UnknownOrInvalid_ReturnsError_AndNeverShutsDown(string request)
    {
        var reply = Handle(request);
        Assert.Contains("\"error\"", reply.Json);
        Assert.Null(reply.Shutdown);
    }
}

public class CancelShutdownTests
{
    private static NativeReply Handle(string request) => NativeMessaging.Handle(request, Array.Empty<BlockRule>());

    [Fact]
    public void AbortArguments_AreTheWindowsAbortSwitch()
    {
        Assert.Equal("/a", ShutdownCommand.AbortArguments);
    }

    [Fact]
    public void CancelShutdown_Request_AsksTheHostToAbort_WithoutStartingAShutdown()
    {
        var reply = Handle("{\"type\":\"cancelShutdown\"}");

        Assert.True(reply.CancelShutdown);
        Assert.Null(reply.Shutdown);
        Assert.Contains("\"ok\":true", reply.Json);
    }

    [Theory]
    [InlineData("{\"type\":\"ping\"}")]
    [InlineData("{\"type\":\"getRules\"}")]
    [InlineData("{\"type\":\"shutdown\",\"seconds\":10,\"host\":\"a.com\"}")]
    [InlineData("{\"type\":\"nope\"}")]
    public void OtherRequests_NeverAbort(string request)
    {
        Assert.False(Handle(request).CancelShutdown);
    }
}
