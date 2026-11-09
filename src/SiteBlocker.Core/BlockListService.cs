namespace SiteBlocker.Core;

/// <summary>
/// The rules and the password gate. Adding a block for a new domain is free; anything that could make
/// blocking weaker (removing or changing a rule, changing the password) requires the password.
/// </summary>
public sealed class BlockListService
{
    private readonly IConfigStore _store;

    public BlockListService(IConfigStore store)
    {
        _store = store;
    }

    public IReadOnlyList<BlockRule> Rules => _store.Load().Rules;

    public bool HasPassword => !string.IsNullOrEmpty(_store.Load().PasswordHash);

    public void SetInitialPassword(string password)
    {
        var config = _store.Load();
        if (!string.IsNullOrEmpty(config.PasswordHash))
            throw new InvalidOperationException("A password is already set.");

        config.PasswordHash = PasswordHasher.Hash(password);
        _store.Save(config);
    }

    public bool VerifyPassword(string password)
    {
        var hash = _store.Load().PasswordHash;
        return !string.IsNullOrEmpty(hash) && PasswordHasher.Verify(password, hash);
    }

    public bool ChangePassword(string oldPassword, string newPassword)
    {
        if (!VerifyPassword(oldPassword)) return false;

        var config = _store.Load();
        config.PasswordHash = PasswordHasher.Hash(newPassword);
        _store.Save(config);
        return true;
    }

    public void AddRule(string domainInput, BlockMode mode, IEnumerable<string> allowPaths)
    {
        var domain = BlockRule.NormalizeDomain(domainInput);
        var config = _store.Load();

        if (config.Rules.Any(r => r.Domain == domain))
            throw new InvalidOperationException($"'{domain}' is already in the list. Use UpdateRule (needs the password).");

        config.Rules.Add(new BlockRule(domain, mode, CleanPaths(mode, allowPaths)));
        _store.Save(config);
    }

    public bool UpdateRule(string domainInput, BlockMode mode, IEnumerable<string> allowPaths, string password)
    {
        if (!VerifyPassword(password)) return false;

        var domain = BlockRule.NormalizeDomain(domainInput);
        var config = _store.Load();
        var index = config.Rules.FindIndex(r => r.Domain == domain);
        if (index < 0) return false;

        config.Rules[index] = new BlockRule(domain, mode, CleanPaths(mode, allowPaths));
        _store.Save(config);
        return true;
    }

    public bool RemoveRule(string domainInput, string password)
    {
        if (!VerifyPassword(password)) return false;

        var domain = BlockRule.NormalizeDomain(domainInput);
        var config = _store.Load();
        var removed = config.Rules.RemoveAll(r => r.Domain == domain) > 0;
        if (removed) _store.Save(config);
        return removed;
    }

    public bool ProtectionEnabled
    {
        get
        {
            var config = _store.Load();
            return config.ChromeExtensionId is not null || config.EdgeExtensionId is not null;
        }
    }

    /// <summary>Turns on force-install protection. Stricter than before, so no password; changing it later needs one.</summary>
    public void EnableProtection(string? chromeExtensionId, string? edgeExtensionId)
    {
        if (chromeExtensionId is null && edgeExtensionId is null)
            throw new ArgumentException("Give at least one extension ID.");
        if (chromeExtensionId is not null && !BrowserPolicy.IsValidExtensionId(chromeExtensionId))
            throw new ArgumentException($"'{chromeExtensionId}' is not a valid extension ID.", nameof(chromeExtensionId));
        if (edgeExtensionId is not null && !BrowserPolicy.IsValidExtensionId(edgeExtensionId))
            throw new ArgumentException($"'{edgeExtensionId}' is not a valid extension ID.", nameof(edgeExtensionId));
        if (ProtectionEnabled)
            throw new InvalidOperationException("Protection is already on. Turn it off first (needs the password).");

        var config = _store.Load();
        config.ChromeExtensionId = chromeExtensionId;
        config.EdgeExtensionId = edgeExtensionId;
        _store.Save(config);
    }

    public bool DisableProtection(string password)
    {
        if (!ProtectionEnabled || !VerifyPassword(password)) return false;

        var config = _store.Load();
        config.ChromeExtensionId = null;
        config.EdgeExtensionId = null;
        _store.Save(config);
        return true;
    }

    /// <summary>Which extension must be force-installed in which browser. Empty when protection is off.</summary>
    public IReadOnlyList<ProtectionEntry> ProtectionEntries()
    {
        var config = _store.Load();
        return BrowserPolicy.Targets
            .Select(target => (target, id: target.Store == ExtensionStore.Chrome ? config.ChromeExtensionId : config.EdgeExtensionId))
            .Where(x => x.id is not null)
            .Select(x => new ProtectionEntry(x.target, x.id!))
            .ToList();
    }

    /// <summary>Store IDs to allow in the native messaging manifest.</summary>
    public IReadOnlyList<string> ProtectedExtensionIds()
    {
        var config = _store.Load();
        return new[] { config.ChromeExtensionId, config.EdgeExtensionId }.Where(id => id is not null).Select(id => id!).ToList();
    }

    /// <summary>Domains the hosts file can block outright. Rules with path exceptions need the browser extension.</summary>
    public IReadOnlyList<string> HostsFileDomains() =>
        _store.Load().Rules.Where(r => r.Mode == BlockMode.BlockAll).Select(r => r.Domain).ToList();

    private static IReadOnlyList<string> CleanPaths(BlockMode mode, IEnumerable<string> allowPaths) =>
        mode == BlockMode.BlockAll
            ? Array.Empty<string>()
            : allowPaths.Select(p => p.Trim()).Where(p => p.Length > 0).Select(p => p.StartsWith('/') ? p : "/" + p).ToList();
}
