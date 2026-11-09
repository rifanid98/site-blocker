namespace SiteBlocker.Core;

/// <summary>Builds the arguments for Windows' shutdown.exe. Never uses /f, so apps with unsaved work get to prompt.</summary>
public static class ShutdownCommand
{
    public const int MinDelaySeconds = 0; // 0 = shut down immediately, with no chance to cancel
    public const int MaxDelaySeconds = 600;
    public const int DefaultDelaySeconds = 15;
    private const int MaxMessageLength = 200;

    public static int ClampDelay(int seconds) => Math.Clamp(seconds, MinDelaySeconds, MaxDelaySeconds);

    public static string Arguments(int delaySeconds, string message)
    {
        if (delaySeconds < MinDelaySeconds || delaySeconds > MaxDelaySeconds)
            throw new ArgumentOutOfRangeException(nameof(delaySeconds), $"Delay must be {MinDelaySeconds}-{MaxDelaySeconds} seconds.");

        var cleaned = System.Text.RegularExpressions.Regex.Replace(message.Replace('"', '\''), @"\s+", " ").Trim();
        if (cleaned.Length > MaxMessageLength) cleaned = cleaned[..MaxMessageLength];

        return $"/s /t {delaySeconds} /c \"{cleaned}\"";
    }
}
