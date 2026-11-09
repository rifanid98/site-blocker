using System.Text.RegularExpressions;

namespace SiteBlocker.Core;

public enum BlockMode
{
    /// <summary>Every page on the domain is blocked.</summary>
    BlockAll,

    /// <summary>The domain is blocked except for the paths in <see cref="BlockRule.AllowPaths"/>.</summary>
    BlockExcept,
}

public sealed record BlockRule(string Domain, BlockMode Mode, IReadOnlyList<string> AllowPaths)
{
    private static readonly Regex DomainPattern =
        new(@"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", RegexOptions.Compiled);

    /// <summary>
    /// Lower-cases the input and strips scheme, "www." prefix, port, path, query and surrounding spaces.
    /// </summary>
    public static string NormalizeDomain(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new ArgumentException("Domain is empty.", nameof(input));

        var value = input.Trim().ToLowerInvariant();

        var schemeEnd = value.IndexOf("://", StringComparison.Ordinal);
        if (schemeEnd >= 0) value = value[(schemeEnd + 3)..];

        var cut = value.IndexOfAny(new[] { '/', '?', '#' });
        if (cut >= 0) value = value[..cut];

        var colon = value.IndexOf(':');
        if (colon >= 0) value = value[..colon];

        if (value.StartsWith("www.", StringComparison.Ordinal)) value = value[4..];

        if (!DomainPattern.IsMatch(value))
            throw new ArgumentException($"'{input}' is not a valid domain.", nameof(input));

        return value;
    }
}
