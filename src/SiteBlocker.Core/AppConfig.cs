namespace SiteBlocker.Core;

public sealed class AppConfig
{
    public string? PasswordHash { get; set; }
    public List<BlockRule> Rules { get; set; } = new();

    /// <summary>Chrome Web Store ID of the published extension (used for Chrome and Brave). Null = not protected there.</summary>
    public string? ChromeExtensionId { get; set; }

    /// <summary>Edge Add-ons ID of the published extension. Null = not protected in Edge.</summary>
    public string? EdgeExtensionId { get; set; }
}

public interface IConfigStore
{
    AppConfig Load();
    void Save(AppConfig config);
}
