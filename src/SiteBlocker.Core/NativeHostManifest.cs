using System.Text.Json;

namespace SiteBlocker.Core;

public static class NativeHostManifest
{
    public const string HostName = "com.siteblocker.host";

    /// <summary>
    /// ID of the unpacked extension. It comes from the "key" field in extension/manifest.json, so it stays
    /// the same on every machine. A Web Store build gets its own ID; add it to the list passed to <see cref="Build"/>.
    /// </summary>
    public const string DevExtensionId = "kpinpjjnhkllnpfpblbobpjbijjeadcd";

    public static string Build(string hostExecutablePath, IReadOnlyCollection<string> extensionIds)
    {
        if (string.IsNullOrWhiteSpace(hostExecutablePath))
            throw new ArgumentException("Host path is empty.", nameof(hostExecutablePath));
        if (extensionIds.Count == 0)
            throw new ArgumentException("At least one extension ID is required.", nameof(extensionIds));

        var manifest = new
        {
            name = HostName,
            description = "SiteBlocker rule provider",
            path = hostExecutablePath,
            type = "stdio",
            allowed_origins = extensionIds.Select(id => $"chrome-extension://{id}/").ToArray(),
        };
        return JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });
    }
}
