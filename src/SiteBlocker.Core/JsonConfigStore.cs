using System.Text.Json;
using System.Text.Json.Serialization;

namespace SiteBlocker.Core;

public sealed class JsonConfigStore : IConfigStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    private static readonly JsonSerializerOptions CompactOptions = new(Options) { WriteIndented = false };

    private readonly string _path;

    public JsonConfigStore(string path)
    {
        _path = path;
    }

    public AppConfig Load()
    {
        if (!File.Exists(_path)) return new AppConfig();

        try
        {
            return JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(_path), Options)
                   ?? throw new InvalidDataException("Config file is empty.");
        }
        catch (JsonException ex)
        {
            // Fail loudly. Silently falling back to an empty config would unblock every site.
            throw new InvalidDataException($"Config file '{_path}' is corrupt.", ex);
        }
    }

    public void Save(AppConfig config)
    {
        var directory = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(config, Options));
        File.Move(temp, _path, overwrite: true);
    }

    /// <summary>JSON array the browser extension reads: [{ domain, mode, allowPaths }].</summary>
    public static string RulesToExtensionJson(IEnumerable<BlockRule> rules) =>
        JsonSerializer.Serialize(rules, CompactOptions);
}
