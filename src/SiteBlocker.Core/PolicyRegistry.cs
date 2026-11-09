using System.Runtime.Versioning;
using Microsoft.Win32;

namespace SiteBlocker.Core;

/// <summary>Reads and writes the browsers' ExtensionInstallForcelist under HKLM. Needs administrator rights to write.</summary>
[SupportedOSPlatform("windows")]
public static class PolicyRegistry
{
    /// <returns>true when anything in the registry was changed.</returns>
    public static bool EnsureApplied(IEnumerable<ProtectionEntry> entries)
    {
        var changed = false;
        foreach (var entry in entries)
        {
            using var key = Registry.LocalMachine.CreateSubKey($@"{entry.Target.PolicyKey}\{BrowserPolicy.ForcelistSubKey}");
            var current = Read(key);
            if (BrowserPolicy.IsApplied(current, entry.ExtensionId, entry.Target.UpdateUrl)) continue;

            Write(key, current, BrowserPolicy.PlanForcelist(current, entry.ExtensionId, entry.Target.UpdateUrl));
            changed = true;
        }
        return changed;
    }

    /// <summary>Removes our extension from every browser's force-list. Chrome then uninstalls it, which is expected.</summary>
    public static bool Remove(IEnumerable<ProtectionEntry> entries)
    {
        var changed = false;
        foreach (var entry in entries)
        {
            using var key = Registry.LocalMachine.OpenSubKey($@"{entry.Target.PolicyKey}\{BrowserPolicy.ForcelistSubKey}", writable: true);
            if (key is null) continue;

            var current = Read(key);
            var plan = BrowserPolicy.PlanRemoval(current, entry.ExtensionId);
            if (plan.Count == current.Count) continue;

            Write(key, current, plan);
            changed = true;
        }
        return changed;
    }

    private static Dictionary<string, string> Read(RegistryKey key)
    {
        var values = new Dictionary<string, string>();
        foreach (var name in key.GetValueNames())
        {
            if (key.GetValue(name) is string value) values[name] = value;
        }
        return values;
    }

    private static void Write(RegistryKey key, Dictionary<string, string> current, Dictionary<string, string> plan)
    {
        foreach (var name in current.Keys.Where(name => !plan.ContainsKey(name))) key.DeleteValue(name, throwOnMissingValue: false);
        foreach (var (name, value) in plan)
        {
            if (!current.TryGetValue(name, out var existing) || existing != value)
                key.SetValue(name, value, RegistryValueKind.String);
        }
    }
}
