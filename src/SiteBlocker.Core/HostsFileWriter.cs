using System.Text;

namespace SiteBlocker.Core;

/// <summary>Pure text transform that adds/removes the SiteBlocker block inside a hosts file.</summary>
public static class HostsFileWriter
{
    public const string BeginMarker = "# >>> SiteBlocker begin (managed, do not edit) >>>";
    public const string EndMarker = "# <<< SiteBlocker end <<<";
    private const string NewLine = "\r\n";

    /// <summary>Returns <paramref name="content"/> with its SiteBlocker block replaced by one for <paramref name="domains"/>.</summary>
    public static string Apply(string content, IEnumerable<string> domains)
    {
        var withoutBlock = RemoveBlock(content);
        var entries = BuildEntries(domains);
        if (entries.Count == 0) return withoutBlock;

        var sb = new StringBuilder(withoutBlock);
        if (sb.Length > 0 && !withoutBlock.EndsWith('\n')) sb.Append(NewLine);

        sb.Append(BeginMarker).Append(NewLine);
        foreach (var entry in entries) sb.Append(entry).Append(NewLine);
        sb.Append(EndMarker).Append(NewLine);
        return sb.ToString();
    }

    /// <summary>True when the block in <paramref name="content"/> is exactly what Apply would produce.</summary>
    public static bool IsUpToDate(string content, IEnumerable<string> domains) =>
        Apply(content, domains) == content;

    private static List<string> BuildEntries(IEnumerable<string> domains)
    {
        var normalized = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var domain in domains)
        {
            try { normalized.Add(BlockRule.NormalizeDomain(domain)); }
            catch (ArgumentException) { /* skip empty or invalid */ }
        }

        var entries = new List<string>();
        foreach (var domain in normalized)
        {
            entries.Add($"0.0.0.0 {domain}");
            entries.Add($"0.0.0.0 www.{domain}");
        }
        return entries;
    }

    private static string RemoveBlock(string content)
    {
        var begin = content.IndexOf(BeginMarker, StringComparison.Ordinal);
        if (begin < 0) return content;

        var end = content.IndexOf(EndMarker, begin, StringComparison.Ordinal);
        if (end < 0) return content[..begin];

        var after = end + EndMarker.Length;
        if (after < content.Length && content[after] == '\r') after++;
        if (after < content.Length && content[after] == '\n') after++;
        return content[..begin] + content[after..];
    }
}
