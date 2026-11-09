namespace SiteBlocker.Core;

public static class AppPaths
{
    public static string DataDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SiteBlocker");

    public static string ConfigFile => Path.Combine(DataDirectory, "config.json");

    public static string HostsFile =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "drivers", "etc", "hosts");
}
