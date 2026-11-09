using System.IO;
using Microsoft.Win32;
using SiteBlocker.Core;

namespace SiteBlocker.App;

/// <summary>
/// Tells Chrome, Edge and Brave where the native host is, so the extension can read the app's rules.
/// Writes only under HKCU (no extra admin rights) and a manifest file under the app's data folder.
/// </summary>
public static class NativeHostRegistrar
{
    private static readonly string[] BrowserKeys =
    {
        @"Software\Google\Chrome\NativeMessagingHosts",
        @"Software\Microsoft\Edge\NativeMessagingHosts",
        @"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
    };

    /// <returns>The host executable path that was registered, or null when it could not be found.</returns>
    /// <param name="storeExtensionIds">Published (Web Store / Edge Add-ons) IDs, allowed in addition to the unpacked dev ID.</param>
    public static string? Register(IEnumerable<string> storeExtensionIds)
    {
        var hostExe = FindHostExecutable();
        if (hostExe is null) return null;

        var manifestDir = Path.Combine(AppPaths.DataDirectory, "native-host");
        Directory.CreateDirectory(manifestDir);
        var manifestPath = Path.Combine(manifestDir, NativeHostManifest.HostName + ".json");
        File.WriteAllText(manifestPath, NativeHostManifest.Build(hostExe, new[] { NativeHostManifest.DevExtensionId }.Concat(storeExtensionIds).Distinct().ToList()));

        foreach (var browserKey in BrowserKeys)
        {
            using var key = Registry.CurrentUser.CreateSubKey($@"{browserKey}\{NativeHostManifest.HostName}");
            key.SetValue(null, manifestPath);
        }

        return hostExe;
    }

    private static string? FindHostExecutable()
    {
        const string exe = "SiteBlocker.NativeHost.exe";

        // Installed layout: next to the app. Dev layout: the sibling project's build output.
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, exe),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, @"..\..\..\..\SiteBlocker.NativeHost\bin\Debug\net8.0", exe)),
        };
        return candidates.FirstOrDefault(File.Exists);
    }
}
