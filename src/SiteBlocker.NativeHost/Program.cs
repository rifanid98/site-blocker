using System.Diagnostics;
using SiteBlocker.Core;

// Chrome/Edge/Brave start this process through native messaging. It answers each request on stdout, and
// runs shutdown.exe when the extension asks for it. It exits when the browser closes stdin.
var input = Console.OpenStandardInput();
var output = Console.OpenStandardOutput();
var store = new JsonConfigStore(AppPaths.ConfigFile);

while (true)
{
    var request = NativeMessaging.Read(input);
    if (request is null) break;

    NativeReply reply;
    try
    {
        reply = NativeMessaging.Handle(request, store.Load().Rules);
    }
    catch (Exception ex) when (ex is InvalidDataException or IOException)
    {
        // Unreadable config: tell the extension, which then keeps its last known rules.
        reply = new NativeReply("{\"error\":\"config unavailable\"}", null);
    }

    // Answer first so the extension is not left waiting, then act.
    NativeMessaging.Write(output, reply.Json);

    if (reply.Shutdown is { } shutdown) RunShutdown(shutdown);
}

static void RunShutdown(ShutdownRequest request)
{
    var message = request.Host.Length > 0
        ? $"SiteBlocker: a blocked site was opened ({request.Host}). This PC is shutting down."
        : "SiteBlocker: a blocked site was opened. This PC is shutting down.";

    try
    {
        using var process = Process.Start(new ProcessStartInfo("shutdown.exe", ShutdownCommand.Arguments(request.Seconds, message))
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        });
        process?.WaitForExit(5000);
    }
    catch (Exception)
    {
        // A shutdown that is already in progress makes shutdown.exe fail; that is fine.
    }
}
