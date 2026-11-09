using System.Windows;

namespace SiteBlocker.App;

public partial class PasswordPrompt : Window
{
    public string Password => Input.Password;

    public PasswordPrompt(string message)
    {
        InitializeComponent();
        MessageText.Text = message;
        Loaded += (_, _) => Input.Focus();
    }

    /// <summary>Shows the dialog and returns the typed password, or null when cancelled.</summary>
    public static string? Ask(Window owner, string message)
    {
        var dialog = new PasswordPrompt(message) { Owner = owner };
        return dialog.ShowDialog() == true ? dialog.Password : null;
    }

    private void Ok_Click(object sender, RoutedEventArgs e) => DialogResult = true;
}
