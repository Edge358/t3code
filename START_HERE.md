# Start Here: Windows Setup

**No coding or terminal experience needed.**

This guide gets Codex and Claude working inside the T3 Code desktop app. You will
use PowerShell for setup, then use T3's normal window for your conversations.

Follow the steps on the computer where you will run T3. If you only want one
provider, skip the other provider's installation and sign-in steps. You can also
install T3 before setting up the providers; both need to be ready before you use
both of them in T3.

## Before you begin

Have your ChatGPT and Claude sign-in details handy, along with access to the email
or phone you use for verification. Your accounts must include access to Codex and
Claude Code. Installing the tools does not purchase a subscription or add usage
credits. This guide uses account sign-in rather than API keys.

Use an Intel/AMD 64-bit Windows computer for this custom installer and an internet
connection for provider installation, sign-in, and conversations. Git for Windows
is useful for project history and Claude's Bash tools; current Claude Code can
use PowerShell without it. See [Anthropic's Windows setup](https://code.claude.com/docs/en/setup#install-on-native-windows).

The commands below install the command-line tools that T3 uses. Having only the
ChatGPT/Codex or Claude desktop app does not establish that these tools are ready.

## 1. Open PowerShell

1. Click the **Start** button on the Windows taskbar, or press the **Windows key**.
2. Start typing **PowerShell**. Windows searches as you type.
3. Click **Windows PowerShell** in the results. Open it normally; you do not need
   to choose **Run as administrator** for these provider installations.

A window opens with a line similar to `PS C:\Users\YourName>`. This is the
**prompt**: it means PowerShell is ready for a command. Your name and folder may
be different, and the window's background color does not matter.

For each command below, copy the entire line inside the box, click in PowerShell,
press **Ctrl+V** to paste, then press **Enter**. If Ctrl+V does not paste, try
right-clicking inside the window. Run one command at a time. Do not type the
`PS C:\Users\YourName>` part yourself.

## 2. Install Codex

Copy, paste, and run:

```powershell
irm https://chatgpt.com/codex/install.ps1 | iex
```

This downloads and runs OpenAI's Windows installer. Follow any installer prompts
and wait for it to finish. Continue when it reports success and the PowerShell
prompt returns. The official [Codex installation guide](https://learn.chatgpt.com/docs/codex/cli)
and [Windows installer settings](https://learn.chatgpt.com/docs/config-file/environment-variables#installer-variables)
describe this installation method.

## 3. Install Claude Code

In the same PowerShell window, copy, paste, and run:

```powershell
irm https://claude.ai/install.ps1 | iex
```

This downloads and runs Anthropic's Windows installer. It may show no progress
while downloading. Wait for the completion message and the PowerShell prompt.
This is the command in the official [Claude Code setup guide](https://code.claude.com/docs/en/quickstart#step-1-install-claude-code).

**After both installations finish, close PowerShell and open it again using
Step 1.** A new window lets Windows find the newly installed commands.

Check each installation, one command at a time:

```powershell
codex --version
```

```powershell
claude --version
```

Each should print a version number. The numbers do not need to match each other.
If either command says it is not recognized, use the troubleshooting section
below before continuing with that provider.

## 4. Sign in to Codex

In PowerShell, run:

```powershell
codex login
```

A browser window should open. Sign in with the ChatGPT account you want to use
in T3 and approve the requested connection. If prompted, complete your email,
phone, or authenticator verification.

If the browser does not open, use the sign-in link printed in PowerShell. Keep
PowerShell open while you finish signing in. Return to it afterward and look for
confirmation that sign-in succeeded and the ordinary PowerShell prompt has returned.

This signs in without opening a terminal conversation. See OpenAI's
[login command reference](https://learn.chatgpt.com/docs/cli/reference#codex-login)
and [authentication guide](https://learn.chatgpt.com/docs/auth) for other account setups.

## 5. Sign in to Claude Code

In PowerShell, run:

```powershell
claude auth login
```

Follow the browser sign-in steps using your Claude account. If a choice of account
type appears, choose the option for your Claude subscription. Complete any
verification and authorization prompts. If the browser gives you a code and
PowerShell asks for it, paste that code into PowerShell and press **Enter**.

Wait for sign-in confirmation. Follow any instruction to press Enter to finish.
The official [Claude sign-in guide](https://code.claude.com/docs/en/authentication)
explains the browser flow, and the [command reference](https://code.claude.com/docs/en/cli-reference)
documents `claude auth login`.

**Once both sign-ins have finished, close PowerShell.** These sign-in commands do
not start full chat sessions, so there is no need to learn how to exit them with
Ctrl+C. Your everyday conversations will happen in T3.

## 6. Install and open T3 Code

Use the installer for the version you want:

- **This custom Windows build:** use the installer supplied with this build. Its
  name starts with `T3-Code-` and ends with `-x64.exe`. It is for Intel/AMD 64-bit
  Windows computers. You only need that installer file, not the source-code folder.
- **The standard T3 release from Theo's project:** use the Windows installer from
  the official [T3 Code releases](https://github.com/pingdotgg/t3code/releases).
  Choose the installer matching your computer. That release does not include this
  custom build's changes.

1. Open **File Explorer**, then **Downloads**, or the folder where you saved the
   installer.
2. Double-click the installer and follow any on-screen prompts.
3. Open **T3 Code** using its desktop shortcut or by searching for it in Start.
   The shortcut may be named **T3 Code (Beta)**.
4. Follow the welcome screens, then open the **gear icon → Providers** in Settings.
5. Check that Codex and Claude are enabled and recognized. For Codex, use the
   existing CLI/login option when offered, since you already signed in above.

If T3 was open while you installed the providers, close and reopen it first.
It needs a fresh start to discover newly installed tools.

A fresh installation can show **No projects yet** and **What should we work on?**
That is expected. Installing T3 does not import conversations or personal settings
from another computer or a separate development copy.

## 7. Start your first conversation

Choose **Add project** to work with an existing folder. If a chooser appears,
choose **Local folder** and browse to the folder you want T3 to work with.
If you already have projects, **Choose a project** opens the list and also offers
adding a folder. A project here is a working folder; it does not need a GitHub
repository. Choose **Start without a project** to begin without selecting one.
The neutral welcome page also appears after you delete the thread you are viewing.

Select Codex or Claude in the conversation's provider/model picker. Type a simple
first message, such as **"Hello. Tell me what you can help me do."**, and send it.
An answer confirms that the selected provider is working. Select the other provider
in a new conversation if you want to check both.

For daily use, open the T3 desktop shortcut. PowerShell and the providers' own
desktop apps do not need to stay open. T3 starts the tools it needs. You may need
to sign in again later if an account's authorization expires or changes.

## If something does not work

| What you see                                         | What to do                                                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex` or `claude` is not recognized                | Close PowerShell, reopen it from Start, and try the version command again. If it still fails, check the installer's final instructions or the provider's setup guide; Windows may not have added its command folder to the search path. |
| The sign-in page uses the wrong account              | Choose the intended account in the browser, or sign out of the wrong account there and repeat the provider's sign-in command.                                                                                                           |
| You signed in, but T3 says a provider is unavailable | Restart T3 and check **Settings → Providers** for its specific message. Installation and sign-in must be under the Windows account that runs T3.                                                                                        |
| T3 reports an incompatible provider version          | Follow the version guidance in **Settings → Providers** or ask the person who supplied your build.                                                                                                                                      |
| A message says Git is missing                        | Git is a separate tool used for project history. Install [Git for Windows](https://git-scm.com/downloads/win), then restart T3.                                                                                                         |
| Windows blocks the T3 installer                      | This custom installer is unsigned. Ask the person who supplied it to confirm the file and next steps; do not turn off Windows security.                                                                                                 |
| The text is too small                                | Open **Settings → Appearance** and adjust Interface and Monospace/Code sizes. Those are personal preferences saved on this computer.                                                                                                    |

For help, share the exact error message and which step you reached. Leave out
passwords, verification codes, and sign-in links.

For more detail, see [T3 installation and provider setup](docs/user/install.md),
[Codex setup](docs/user/providers-codex.md), and [Claude setup](docs/user/providers-claude.md).
T3 also offers a managed **Connect with ChatGPT** path; this guide uses an existing
Codex CLI login so both providers follow the same install-then-sign-in sequence.

Provider instructions checked against official documentation on November 1, 2026.
