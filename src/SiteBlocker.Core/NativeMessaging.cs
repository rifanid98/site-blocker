using System.Text;
using System.Text.Json;

namespace SiteBlocker.Core;

public sealed record ShutdownRequest(int Seconds, string Host);

public sealed record NativeReply(string Json, ShutdownRequest? Shutdown);

/// <summary>Chrome/Edge native messaging: 4-byte little-endian length prefix followed by UTF-8 JSON.</summary>
public static class NativeMessaging
{
    // Chrome allows up to 1 MB from the host to the browser; reject absurd inbound sizes.
    private const int MaxMessageBytes = 1024 * 1024;

    public static string? Read(Stream input)
    {
        var header = new byte[4];
        var read = ReadFully(input, header, 4);
        if (read == 0) return null;
        if (read < 4) throw new EndOfStreamException("Truncated message header.");

        var length = BitConverter.ToInt32(header, 0);
        if (length < 0 || length > MaxMessageBytes)
            throw new InvalidDataException($"Message length {length} is out of range.");

        var body = new byte[length];
        if (ReadFully(input, body, length) < length)
            throw new EndOfStreamException("Truncated message body.");

        return Encoding.UTF8.GetString(body);
    }

    public static void Write(Stream output, string message)
    {
        var body = Encoding.UTF8.GetBytes(message);
        output.Write(BitConverter.GetBytes(body.Length), 0, 4);
        output.Write(body, 0, body.Length);
        output.Flush();
    }

    public static string HandleRequest(string request, IReadOnlyList<BlockRule> rules) => Handle(request, rules).Json;

    /// <summary>Answers one extension request. A "shutdown" request also returns what the host process must run.</summary>
    public static NativeReply Handle(string request, IReadOnlyList<BlockRule> rules)
    {
        try
        {
            using var doc = JsonDocument.Parse(request);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("type", out var typeElement))
            {
                switch (typeElement.GetString())
                {
                    case "getRules":
                        return new NativeReply("{\"rules\":" + JsonConfigStore.RulesToExtensionJson(rules) + "}", null);
                    case "ping":
                        return new NativeReply("{\"ok\":true}", null);
                    case "shutdown":
                        var shutdown = new ShutdownRequest(ReadSeconds(root), SafeHost(root));
                        return new NativeReply("{\"ok\":true}", shutdown);
                }
            }
        }
        catch (JsonException)
        {
            // fall through to the error reply
        }

        return new NativeReply("{\"error\":\"unknown request\"}", null);
    }

    private static int ReadSeconds(JsonElement root)
    {
        if (root.TryGetProperty("seconds", out var seconds)
            && seconds.ValueKind == JsonValueKind.Number
            && seconds.TryGetInt32(out var value))
        {
            return ShutdownCommand.ClampDelay(value);
        }
        return ShutdownCommand.DefaultDelaySeconds;
    }

    /// <summary>The host name only ends up in a message shown to the user; keep it to harmless characters.</summary>
    private static string SafeHost(JsonElement root)
    {
        if (!root.TryGetProperty("host", out var host) || host.ValueKind != JsonValueKind.String) return "";
        var chars = host.GetString()!.ToLowerInvariant().Where(c => (c is >= 'a' and <= 'z') || (c is >= '0' and <= '9') || c is '.' or '-');
        return new string(chars.Take(100).ToArray());
    }

    private static int ReadFully(Stream stream, byte[] buffer, int count)
    {
        var total = 0;
        while (total < count)
        {
            var n = stream.Read(buffer, total, count - total);
            if (n == 0) break;
            total += n;
        }
        return total;
    }
}
