namespace SiteBlocker.Core;

/// <summary>
/// Decides whether a URL is blocked by a set of rules. The browser extension ports this exact logic to
/// JavaScript, so keep the two in sync (see extension/src/matcher.js).
/// </summary>
public sealed class RuleMatcher
{
    private readonly IReadOnlyList<BlockRule> _rules;

    public RuleMatcher(IEnumerable<BlockRule> rules)
    {
        _rules = rules.ToList();
    }

    public bool IsBlocked(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;

        var host = uri.Host.ToLowerInvariant();
        var path = uri.AbsolutePath.ToLowerInvariant();

        foreach (var rule in _rules)
        {
            if (!HostMatches(host, rule.Domain)) continue;
            if (rule.Mode == BlockMode.BlockAll) return true;
            if (!rule.AllowPaths.Any(pattern => PathAllowed(path, pattern))) return true;
        }

        return false;
    }

    private static bool HostMatches(string host, string domain) =>
        host == domain || host.EndsWith("." + domain, StringComparison.Ordinal);

    private static bool PathAllowed(string path, string pattern)
    {
        pattern = pattern.ToLowerInvariant();

        if (pattern.EndsWith('*'))
            return path.StartsWith(pattern[..^1], StringComparison.Ordinal);

        var trimmed = pattern.TrimEnd('/');
        return path == trimmed || path == trimmed + "/" || path.StartsWith(trimmed + "/", StringComparison.Ordinal);
    }
}
