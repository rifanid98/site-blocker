using System.IO;
using System.Windows;
using System.Windows.Controls;
using SiteBlocker.Core;

namespace SiteBlocker.App;

public partial class MainWindow : Window
{
    private readonly BlockListService _service = new(new JsonConfigStore(AppPaths.ConfigFile));
    private readonly HostsApplier _hosts = new(AppPaths.HostsFile);

    private sealed record RuleRow(string Domain, string ModeText, string PathsText);

    public MainWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => ShowCorrectPanel();
        RuleList.SelectionChanged += RuleList_SelectionChanged;
    }

    private void ShowCorrectPanel()
    {
        try
        {
            var hasPassword = _service.HasPassword;
            SetupPanel.Visibility = hasPassword ? Visibility.Collapsed : Visibility.Visible;
            MainPanel.Visibility = hasPassword ? Visibility.Visible : Visibility.Collapsed;
            if (hasPassword)
            {
                Refresh();
                RegisterBrowserLink();
            }
        }
        catch (InvalidDataException ex)
        {
            MessageBox.Show(this, ex.Message, "SiteBlocker", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private void RegisterBrowserLink()
    {
        try
        {
            var host = NativeHostRegistrar.Register(_service.ProtectedExtensionIds());
            SetStatus(host is null
                ? "Browser link not set up: SiteBlocker.NativeHost.exe was not found, so path exceptions will not reach the browser."
                : "Browser link ready. Path exceptions reach the extension within about a minute.");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            SetStatus($"Browser link failed: {ex.Message}");
        }
    }

    private void SavePassword_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(NewPassword.Password) || NewPassword.Password != ConfirmPassword.Password)
        {
            MessageBox.Show(this, "The two passwords must match and not be empty.", "SiteBlocker");
            return;
        }

        _service.SetInitialPassword(NewPassword.Password);
        ShowCorrectPanel();
    }

    private void Refresh()
    {
        RuleList.ItemsSource = _service.Rules
            .Select(r => new RuleRow(
                r.Domain,
                r.Mode == BlockMode.BlockAll ? "Block everything" : "Block, with exceptions",
                string.Join(", ", r.AllowPaths)))
            .ToList();

        // Whole-domain blocks go into the hosts file; path rules are enforced by the browser extension.
        _hosts.EnsureApplied(_service.HostsFileDomains());
        RefreshProtection();
    }

    private void RefreshProtection()
    {
        var entries = _service.ProtectionEntries();
        if (entries.Count > 0) PolicyRegistry.EnsureApplied(entries);

        ProtectionState.Text = entries.Count == 0
            ? "Protection is off: the extension can be disabled or removed."
            : "Protection is on for: " + string.Join(", ", entries.Select(e => e.Target.Name)) + ".";
    }

    private void EnableProtection_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var chrome = string.IsNullOrWhiteSpace(ChromeIdBox.Text) ? null : ChromeIdBox.Text.Trim();
            var edge = string.IsNullOrWhiteSpace(EdgeIdBox.Text) ? null : EdgeIdBox.Text.Trim();

            _service.EnableProtection(chrome, edge);
            RefreshProtection();
            RegisterBrowserLink();
            SetStatus("Protection turned on. Restart the browser, then check its policy page (brave://policy, chrome://policy, edge://policy).");
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or UnauthorizedAccessException)
        {
            SetStatus(ex.Message);
        }
    }

    private void DisableProtection_Click(object sender, RoutedEventArgs e)
    {
        var entries = _service.ProtectionEntries();
        if (entries.Count == 0)
        {
            SetStatus("Protection is already off.");
            return;
        }

        var password = PasswordPrompt.Ask(this, "Enter your password to turn off extension protection. The browsers will then remove the extension.");
        if (password is null) return;

        if (!_service.DisableProtection(password))
        {
            SetStatus("Wrong password.");
            return;
        }

        PolicyRegistry.Remove(entries);
        RefreshProtection();
        SetStatus("Protection turned off.");
    }

    private void RuleList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (RuleList.SelectedItem is not RuleRow row) return;

        DomainBox.Text = row.Domain;
        ModeBox.SelectedIndex = row.ModeText == "Block everything" ? 0 : 1;
        PathsBox.Text = row.PathsText;
    }

    private BlockMode SelectedMode => ModeBox.SelectedIndex == 0 ? BlockMode.BlockAll : BlockMode.BlockExcept;

    private IEnumerable<string> EnteredPaths =>
        PathsBox.Text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private void Add_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _service.AddRule(DomainBox.Text, SelectedMode, EnteredPaths);
            Refresh();
            SetStatus($"Added {DomainBox.Text}.");
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            SetStatus(ex.Message);
        }
    }

    private void Update_Click(object sender, RoutedEventArgs e)
    {
        if (RuleList.SelectedItem is not RuleRow row)
        {
            SetStatus("Select a rule first.");
            return;
        }

        var password = PasswordPrompt.Ask(this, $"Enter your password to change {row.Domain}.");
        if (password is null) return;

        if (_service.UpdateRule(row.Domain, SelectedMode, EnteredPaths, password))
        {
            Refresh();
            SetStatus($"Updated {row.Domain}.");
        }
        else
        {
            SetStatus("Wrong password.");
        }
    }

    private void Remove_Click(object sender, RoutedEventArgs e)
    {
        if (RuleList.SelectedItem is not RuleRow row)
        {
            SetStatus("Select a rule first.");
            return;
        }

        var password = PasswordPrompt.Ask(this, $"Enter your password to unblock {row.Domain}.");
        if (password is null) return;

        if (_service.RemoveRule(row.Domain, password))
        {
            Refresh();
            SetStatus($"Unblocked {row.Domain}.");
        }
        else
        {
            SetStatus("Wrong password.");
        }
    }

    private void SetStatus(string text) => StatusText.Text = text;
}
