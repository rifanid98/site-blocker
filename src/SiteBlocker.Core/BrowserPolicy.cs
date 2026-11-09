using System.Text.RegularExpressions;

namespace SiteBlocker.Core;

public enum ExtensionStore
{
    Chrome,
    Edge,
}

/// <param name="Name">Display name; also the identity used in logs.</param>
/// <param name="PolicyKey">Registry path under HKLM where the browser reads its policies.</param>
public sealed record BrowserTarget(string Name, string PolicyKey, ExtensionStore Store)
{
    public string UpdateUrl =>
        Store == ExtensionStore.Chrome ? BrowserPolicy.ChromeWebStoreUpdateUrl : BrowserPolicy.EdgeAddonsUpdateUrl;
}

public sealed record ProtectionEntry(BrowserTarget Target, string ExtensionId);

/// <summary>
/// Pure logic for the browser "force-install" policy (ExtensionInstallForcelist). A force-installed
/// extension cannot be disabled or removed by the user. Registry access lives in PolicyRegistry.
/// </summary>
public static class BrowserPolicy
{
    public const string ChromeWebStoreUpdateUrl = "https://clients2.google.com/service/update2/crx";
    public const string EdgeAddonsUpdateUrl = "https://edge.microsoft.com/extensions/edgewebstorebase/v1/crx";
    public const string ForcelistSubKey = "ExtensionInstallForcelist";

    private static readonly Regex ExtensionIdPattern = new("^[a-p]{32}$", RegexOptions.Compiled);

    /// <summary>
    /// Brave reports differ on whether it reads "Brave" or "Brave-Browser", so both are written.
    /// Confirm what a browser actually applied on its brave://policy, chrome://policy or edge://policy page.
    /// </summary>
    public static readonly IReadOnlyList<BrowserTarget> Targets = new[]
    {
        new BrowserTarget("Chrome", @"SOFTWARE\Policies\Google\Chrome", ExtensionStore.Chrome),
        new BrowserTarget("Brave", @"SOFTWARE\Policies\BraveSoftware\Brave", ExtensionStore.Chrome),
        new BrowserTarget("Brave-Browser", @"SOFTWARE\Policies\BraveSoftware\Brave-Browser", ExtensionStore.Chrome),
        new BrowserTarget("Edge", @"SOFTWARE\Policies\Microsoft\Edge", ExtensionStore.Edge),
    };

    public static bool IsValidExtensionId(string? id) => id is not null && ExtensionIdPattern.IsMatch(id);

    public static string Entry(string extensionId, string updateUrl) => $"{extensionId};{updateUrl}";

    /// <summary>The list as it should be after adding our entry: other extensions kept, any stale entry of ours replaced.</summary>
    public static Dictionary<string, string> PlanForcelist(
        IReadOnlyDictionary<string, string> existing, string extensionId, string updateUrl)
    {
        if (!IsValidExtensionId(extensionId))
            throw new ArgumentException($"'{extensionId}' is not a valid extension ID.", nameof(extensionId));

        var plan = PlanRemoval(existing, extensionId);
        plan[NextFreeName(plan)] = Entry(extensionId, updateUrl);
        return plan;
    }

    public static Dictionary<string, string> PlanRemoval(IReadOnlyDictionary<string, string> existing, string extensionId) =>
        existing.Where(pair => IdOf(pair.Value) != extensionId)
                .ToDictionary(pair => pair.Key, pair => pair.Value);

    public static bool IsApplied(IReadOnlyDictionary<string, string> existing, string extensionId, string updateUrl) =>
        existing.Values.Contains(Entry(extensionId, updateUrl));

    private static string IdOf(string entry) => entry.Split(';')[0];

    private static string NextFreeName(IReadOnlyDictionary<string, string> used)
    {
        for (var n = 1; ; n++)
        {
            var name = n.ToString();
            if (!used.ContainsKey(name)) return name;
        }
    }
}
