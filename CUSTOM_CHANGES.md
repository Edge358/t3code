# Custom Windows build: changes and rationale

Documentation checkpoint: 2026-10-31. Upstream base: T3 Code `v0.1.6`, commit
`2359643cffa6ba9ee84d6f2694b935de54a8013e`. Last packaged build: `0.1.6-private.18` (final confirmation correction; private.17 manual deletion/retry checks retained).

T3 Code is the upstream project by T3 Tools Inc. This document describes a locally
modified build, not an official release or an upstream-endorsed product. The
upstream [LICENSE](LICENSE) and attribution remain intact. This local checkpoint
is maintained on `edge358-custom-build`; no hosted fork or pull request has
been published.

The work started with a privacy review and expanded to readability, project
navigation, settings defaults, and optional speech. Personal preferences are
separated below from changes that could be proposed independently upstream.
The companion [privacy review](docs/custom-build/privacy-review.md) records
findings, implementation choices, evidence, and unresolved review areas.

Documentation locations: this file is the shareable overview; `docs/custom-build`
holds the detailed privacy review. Machine-specific documentation lives under Git-ignored `docs/local`; private
artifacts, runtime data and verification evidence live under Git-ignored `.local`.
Neither is distributed with the source.
The upstream README links here so a future reader can identify this variant.

## 1. Readability and appearance

| Change                       | Reason and resulting behavior                                                                                                                                                                                                                                  | Main implementation                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consistent 24px upper limit  | Previously Interface/Prompt/Terminal stopped at 20px and Code at 18px. All four now permit 24px for distant viewing and accessibility. Existing minimums and default font values remain.                                                                       | [settings.ts](packages/contracts/src/settings.ts)                                                                                                                               |
| One shared chat/code size    | With Separate fonts off, the size beside Monospace font controls the typing box, ordinary replies, code, diffs, file previews, and terminal. Changing it in Settings updates the display without rebuilding.                                                   | [appearanceFonts.ts](apps/web/src/appearanceFonts.ts), [TypographySettings.tsx](apps/web/src/components/settings/TypographySettings.tsx), [utils.ts](apps/web/src/lib/utils.ts) |
| Uniform reply content size   | Prose, inline/fenced code, headings, and tables use the reply size. Weights, structure, and syntax coloring remain. This is a deliberate aesthetic choice; different fonts can still have different apparent letter heights at the same CSS size.              | [index.css](apps/web/src/index.css), [ChatMarkdown.tsx](apps/web/src/components/ChatMarkdown.tsx)                                                                               |
| Adjustable right-click menus | A new independent Right-click menu size setting uses 12-24px, default 18px, and the Interface font. App action menus use the existing app-rendered menu instead of the native desktop menu so the setting can apply. This does not restyle every Windows menu. | [localApi.ts](apps/web/src/localApi.ts), [contextMenuFallback.ts](apps/web/src/contextMenuFallback.ts), settings schema/UI/search                                               |
| Smaller welcome heading      | The new-thread heading uses Interface size plus 6px rather than the former large heading scale. It remains part of the empty-thread view.                                                                                                                      | [DraftHeroHeadline.tsx](apps/web/src/components/chat/DraftHeroHeadline.tsx), [DraftHeroProjectHeading.tsx](apps/web/src/components/chat/DraftHeroProjectHeading.tsx)            |
| Dimmer empty input hint      | The placeholder has 50% opacity; entered text stays fully opaque. This makes the hint easier to distinguish from an actual draft.                                                                                                                              | [ComposerPromptEditorTiptap.tsx](apps/web/src/components/ComposerPromptEditorTiptap.tsx)                                                                                        |

Font family and size remain distinct choices. Ordinary messages use Interface
lettering; code uses the selected monospace lettering. Separate fonts retains
independent prompt/terminal controls when enabled; replies continue to use the
chat/code size. No additional chat-only size control was introduced.

The reviewer's saved profile is Interface 24px, shared chat/code 22px, right-click
menus 18px, with Separate fonts off. **These are saved preferences, not new
installation defaults.** Source defaults remain Interface 16px, Prompt 14px,
Code 13px, Terminal 12px. Because ordinary replies now follow Code size, a fresh
profile's reply size also follows that 13px value. Another computer can use its
own sizes in Settings.

Validation includes schema limits, persisted settings, live font changes,
Markdown sizes, app-menu selection/navigation, and packaged computed styles.
The final packaged check measured actual reply/input text at 22px, actual menu
labels at 18px, Interface at 24px, hint opacity 0.5, and typed-text opacity 1.
This is not a claim that every display/DPI combination has been tested.

## 2. Projects and new conversations

The top New Thread button and Ctrl+N now open the project chooser consistently,
including when there is only one project or none. A project's own New Thread
button still starts directly in that project; Shift-clicking the top button
retains the direct-current-project path.

The chooser order is:

1. **Add project / choose folder...**
2. Existing projects.
3. **No project**.

Adding uses the existing Add Project workflow; choose Local folder to browse.
It does not introduce a second folder picker or place multiple project folders
inside a thread. Existing numbered project shortcuts are preserved.

The existing project-organized sidebar is now enabled by default. This is the
`boringSidebarEnabled` setting, distinct from grouping matching repositories
across environments.

Sources: [Sidebar.tsx](apps/web/src/components/Sidebar.tsx),
[SidebarThreadHeader.tsx](apps/web/src/components/sidebar/SidebarThreadHeader.tsx),
[CommandPalette.tsx](apps/web/src/components/CommandPalette.tsx),
[chatRouteCommands.ts](apps/web/src/shortcuts/chatRouteCommands.ts).
The obsolete project-count shortcut helper was removed. User documentation was
updated in [keybindings](docs/user/keybindings.md) and
[thread sidebar](docs/user/thread-sidebar.md). Browser coverage includes opening
the chooser with no projects. Folder browsing and chooser order were also
checked in packaged builds.

## 3. Changed settings defaults

These defaults apply when a saved field is absent, including an older profile
missing the field. Explicit saved values are not forcibly overwritten. Fixed
privacy restrictions are a separate mechanism, documented in the privacy review.

| Setting                                                              | Upstream default       | Custom default |
| -------------------------------------------------------------------- | ---------------------- | -------------- |
| Project-organized sidebar (`boringSidebarEnabled`)                   | Off                    | On             |
| Auto-settle inactive threads                                         | After 3 days           | Off (`null`)   |
| Auto-settle merged threads                                           | On                     | Off            |
| Continue threads after server restarts                               | On                     | Off            |
| Delete old browser artifacts                                         | Off                    | After 30 days  |
| Delete old rotated logs                                              | Off                    | After 30 days  |
| Provider update checks / model-manifest refresh setting              | On                     | Off            |
| Right-click menu size (new)                                          | No independent control | 18px           |
| Read replies aloud / speech address (new)                            | Not present            | Off / blank    |
| Automatic external conversation media loading (new local preference) | No consent control     | Off            |

Worktree cleanup remains off. Browser-artifact expiry can make old capture links
stop opening; current logs are kept. These settings do not add conversation or
provider-history deletion. No personal projects directory, provider credential,
speech address, or TV-specific size is built into the defaults.

The two auto-settle defaults govern inactivity and merge behavior. They do not
remove manual Settle or rewrite every existing close/settle rule. A thread's
Enabled/Disabled auto-settle override is not an indication that it is already
settled.

Settings reset/search support covers the added menu and speech fields. The final
review also added reset coverage for speech and the local external-media
preference. Sources: [settings.ts](packages/contracts/src/settings.ts),
[SettingsPanels.tsx](apps/web/src/components/settings/SettingsPanels.tsx),
[SettingsPanels.logic.ts](apps/web/src/components/settings/SettingsPanels.logic.ts),
[settingsSearch.ts](apps/web/src/components/settings/settingsSearch.ts).

## 4. Optional read-aloud integration

Settings > Chat contains Read replies aloud, Speech service address, and Test
speech. It sends completed assistant reply text to an existing compatible speech
queue. It does not install a speech engine, provide speech recognition, or make
every installed TTS product compatible automatically.

Fresh defaults are off and blank. Editing the address switches automatic speech
off until explicitly enabled again. Test speech sends a fixed sentence even
while automatic speech is off. A configured service can run locally or at an
explicitly entered HTTP/HTTPS address; playback happens on the service machine.
Only the local service was live-tested. Network-hosted services were not tested.

### Service contract

POST JSON to the exact configured queue URL:

```json
{
  "text": "Completed assistant reply",
  "source": "codex",
  "session": "opaque-conversation-and-run-id"
}
```

`source` is `codex`, `claude`, or `t3code`. A successful response must have a
successful HTTP status and JSON `{"queued":true}`. Queue acceptance does not
by itself prove that sound played. Voice selection, text cleanup, synthesis, and
playback belong to the external service.

The desktop main process reads the saved address, validates the requesting main
renderer, permits HTTP/HTTPS without URL credentials or fragments, rejects
redirects, and uses a five-second delivery timeout. The app does not automatically
retry uncertain delivery. The IPC payload has text/session length limits. The
renderer cannot pass an arbitrary destination in the speech request.

Speech selects completed main assistant messages for that run, excluding user,
tool, child-agent, streaming, and notification messages. Previously completed
history is not replayed on startup. Completion handling works independently of
visual notification preferences and rechecks settings/current run before sending.
This is an app completion integration, not screen scraping. Web/mobile speech
transport is not implemented.

Sources: [replySpeech.ts](apps/desktop/src/app/replySpeech.ts),
[speech IPC](apps/desktop/src/ipc/methods/replySpeech.ts),
[reply selection](apps/web/src/replySpeech.logic.ts),
[web coordination](apps/web/src/replySpeech.ts),
[ThreadNotificationCoordinator.tsx](apps/web/src/components/ThreadNotificationCoordinator.tsx),
[ReplySpeechSettings.tsx](apps/web/src/components/settings/ReplySpeechSettings.tsx),
contracts IPC, desktop channels/preload/handlers.

### Existing speech hooks and portability

The native desktop backend sets `T3CODE_APP_SPEECH_MANAGED=1`. Two pre-existing
personal speech adapters were separately updated to honor this marker and avoid
duplicate audio from provider hooks, including generated titles. Their backups
and exact locations are in the private record. Those adapters and the speech
service are **not included in this repository**. Other users' speech hooks do not
automatically honor the marker. Ordinary terminal sessions do not receive it
through this app change. Remote/WSL behavior has not been validated.

An intermediate build failed to select normal replies because their message
nodes were direct children of the run root. The selector was corrected and a
regression test added. Codex and Claude then each queued and played one reply;
speech-off stayed silent, unavailable service produced a notice, and reopening
old conversations did not read them aloud.

## 5. Privacy and startup behavior

The [privacy review](docs/custom-build/privacy-review.md) is the detailed ledger.
The custom policy disables T3 reporting, cloud/relay services, automatic external
icons, app auto-updates, automatic pricing downloads, periodic provider checks,
and the GitHub-star prompt. Claude child processes receive optional-traffic
opt-outs. Remote conversation images require consent by default.

Initial provider discovery was restored after disabling it left model/status
information unchecked. It can contact providers and remains separate from
periodic checks, optional telemetry, and model-manifest update settings. This
change does not promise every provider request is local or that provider quotas
are governed by the app. Model use still requires provider connections.

The star-request popup is suppressed as a personal preference. The change does
not remove upstream credit or claim authorship of T3 Code.

## 6. Review fixes and validation record

The private.13 review removed a stale table-size rule/comment, removed the
no-project disabled state from New Thread, completed settings-reset coverage,
and reconciled tests with the private favicon policy. An unknown-scheme test
fixture changed from a Windows drive-like `d:` value to `unknown:`; link runtime
behavior was not changed by that test correction.

Two existing desktop settings tests repeatedly failed while creating symlink
fixtures on Windows. They now use the repository's existing capability probe
and skip only those fixtures where the probe fails. Ordinary persistence tests
still run. No Windows privilege or Developer Mode setting was changed. Skipped
symlink behavior is not counted as verified on this host.

The private.13 accumulated-change validation: **37 test files passed; 445 tests passed;
four skipped; zero failed.** Six affected packages passed typechecking (web,
desktop, server, contracts, shared, provider-core). Changed-code lint/format
checks passed. This was a targeted accumulated-change run, not the entire
repository or a cross-platform certification. Earlier focused runs overlap and
must not be added to this count.

The native Windows x64 packaging workflow completed. The unpacked private.13 app
was launched and inspected; its unsigned installer was produced but not executed.
The two symlink-test guards were added after packaging; they do not change the
runtime binary. This documentation pass makes no additional runtime change.
Earlier bounded network observations belong to private.2, not a new complete
network audit of private.13.

The private.14 correction fixes **Claude: Could not read limits**. The installed
Claude CLI's essential-traffic restriction also blocks its OAuth usage lookup.
Its SDK response reports limits
available but returns no limits. A diagnostic direct GET to the provider usage
endpoint succeeded with HTTP 200 and a weekly window, without enabling reporting
or sending a model prompt. The page already requests refresh on opening; another
UI refresh trigger alone would not solve this. A narrowly scoped usage lookup
now supplies missing SDK usage data for eligible first-party subscription
accounts. It keeps the broad opt-out, rejects redirects, times out after five
seconds, and uses the selected account's credentials. API-key, custom endpoint,
and environment-token configurations do not use this fallback. Authentication
and usage-read failure remain distinct, with clearer failure messages.

Sources: [claudePlanUsage.ts](apps/server/src/provider/claudePlanUsage.ts),
[ClaudeProvider.ts](apps/server/src/provider/ClaudeProvider.ts), and
[ClaudeDriver.ts](apps/server/src/provider/Drivers/ClaudeDriver.ts). The helper
reuses credential/header functions from `claudeResetCredits.ts`; it neither
consumes a reset credit nor sends a model prompt.

Private.14 validation: **six focused test files, 99 passing tests, no skips or
failures**, server typechecking, and changed-code lint passed. These overlap
earlier suites and are not additive. The Windows build passed, and the unpacked
app displayed Claude weekly limits both on opening Usage and after Refresh.
Its unsigned installer was produced but not executed. This targeted check is
not a fresh comprehensive network audit. See the privacy ledger for credential
platform and response-field limitations.

The follow-up review found a credential-selection edge case for inherited
relative `CLAUDE_CONFIG_DIR` values. The usage fallback now reuses the existing
configuration resolver with the capability probe's working directory, rather
than resolving that relative path from the server's working directory. Explicit
home settings still take precedence. A regression exercises credential selection
from the probe-relative folder. The change affects this fallback; it does not
redesign other existing credential readers.

Review validation passed 118 tests across seven files, with two symlink-dependent
skill fixtures skipped because this Windows host cannot create their links.
Those fixtures now use the existing capability check; other skill tests still
run. Server typechecking and changed-code lint passed. These totals overlap the
previous runs. The focused review found no other release-blocking issue within
the new usage fallback's account, transport, mapping and failure paths.
Private.15 packages the correction and was reopened in the same isolated profile;
Claude weekly data remained visible after a completed manual Refresh. The
unsigned installer was produced but not executed.

### Synchronized local conversation deletion

Delete now addresses every recorded Codex/Claude native history associated with
the thread, including provider switches. Confirmation is required. The server
keeps deletion progress durably and waits for provider shutdown and usage-cache
persistence before removing histories. Partial failures keep the thread visible
for retry; successful targets are not repeated. Histories referenced by retained
threads, including native children that would be removed with their parent, are
protected. Other providers' native histories remain, as the confirmation states.

Settle, Archive and Unarchive do not invoke native deletion. Project removal
keeps its existing app-only cleanup behavior. Existing optional worktree cleanup
is unchanged and separate from conversation-history deletion. Available usage
continues under the existing 92-day cache-retention policy. Deletion uses each
provider instance's configured local storage; it does not search moved histories
in old provider homes, backups, global prompt indexes or cloud accounts.

Validation: 128 focused tests passed, with two pre-existing platform skips;
server, web, contracts, provider-core and client-runtime typechecks and changed
code lint passed. Tests cover mixed histories, partial success/retry, missing
histories, restart recovery, stopped/slow-closing sessions, shared histories,
side chats, and usage rescan/restart. Installed Codex 0.166.0 deleted active and
archived disposable native histories while a neighbor still resumed. Installed
Claude SDK 0.3.276 removed a disposable transcript and child directory, handled
an orphaned child directory on retry, and protected a retained child. These native
checks required no paid model turns.

User-driven Windows checks on private.16 confirmed cancellation, Codex deletion,
resume of a retained Codex conversation, and deletion of both histories in a
mixed Codex/Claude thread. Native files were checked independently. The next
resumed-thread deletion failed because a detached display binding hid the still
live provider process from the deletion lookup. The thread and retry references
were correctly retained.

Private.17 resolves provider processes from the persisted native thread records
as well as current bindings, and only mentions shared histories when one was
actually retained. A regression failed before the fix and passed afterward;
all eight deletion-service cases, the shared-session protection case, server
typecheck and focused lint pass. An isolated two-process Codex test reproduced
the exact active-writer rejection and proved deletion succeeds after writer exit,
without a paid turn. The user's retry succeeded in private.17, and the last disposable thread was
deleted successfully. Native histories were verified absent. The user then
removed the empty project through Settings and confirmed it disappeared from
the project picker. Project removal intentionally remains T3-only; the user
chose to keep that behavior separate from synchronized thread deletion.

The repository's Browser panel tools were unavailable; UI actions were performed
by the user, with screenshots and read-only state checks. No substitute UI
automation was used. Mobile, remote clients and installer execution remain
unverified. Existing optional worktree behavior is unchanged.

### Final code review after consolidation

The review found that the shared confirmed-delete action could fall through to
deletion when its dialog service was unavailable. It now returns a failure without
sending a deletion request. Regression checks cover an unavailable, cancelled,
or failed dialog, and a previously disabled confirmation preference. Another
integration case verifies that a failed side-chat cleanup keeps both child and
parent available, then completes child cleanup before the parent on retry.

The final focused suite passed 176 tests with two existing platform skips.
Server, web, contracts, provider-core and client-runtime typechecks passed;
web/server checks were repeated after the correction. No worktree or whole-project
removal behavior was changed. Private.18 packaging validated 53 Windows payload files and 12 sidecar natives;
the app reopened with its retained profile and a healthy local backend. The new
missing-dialog case is covered by tests, not an automated desktop UI run. Details
are in the private build record. No commit or publication is part of this review.

## 7. Possible independent upstream proposals

These are candidate topics, not claims that maintainers want the changes or that
every change is an upstream bug. Check the current contribution requirements
before any submission; the pinned [CONTRIBUTING.md](CONTRIBUTING.md) describes
limited review capacity, focused scope, and prior discussion for product changes.

| Candidate                                      | Concrete problem to discuss                                                                   | What should stay separate                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Larger consistent font limits                  | One text control cannot reach the readable size available in another.                         | Personal 24/22/18 preferences and other default changes.                                             |
| Configurable app context-menu text             | Native action menus remain too small despite larger app text.                                 | Broad restyling; verify keyboard/accessibility/platform behavior independently.                      |
| Shared chat/code size                          | A single reply mixes unexpectedly different sizes; existing size controls are confusing.      | Treat as an optional product design discussion, not a universal fix.                                 |
| Add-folder action in new-thread chooser        | Choosing a new conversation offers existing projects but no direct way to add a folder.       | Project grouping defaults and global shortcut behavior can be reviewed separately.                   |
| Explicit remote-image loading                  | Displaying a reply can contact an image host before a click.                                  | Fixed removal of analytics/cloud features.                                                           |
| Skip identity reads when reporting is disabled | Disabling reporting should also avoid unnecessary identity collection.                        | Hard-coded private-build policy.                                                                     |
| Optional external speech queue                 | Users with an existing local speech service can hear completed replies.                       | Personal adapter patches; needs a portable integration design.                                       |
| Symlink capability guards                      | Unprivileged Windows tests fail during fixture setup.                                         | Runtime settings changes; preserve real link validation on capable hosts.                            |
| Less prominent placeholder                     | Hint text resembles entered text at large sizes.                                              | Other typography choices.                                                                            |
| Claude subscription usage fallback             | The CLI can return no usage under its optional-traffic restriction despite a working account. | Private telemetry policy; assess supported auth modes and provider schema before proposing upstream. |

Automatic-settle defaults, cleanup retention, suppressed promotion, and fixed
privacy restrictions are local preferences. They need not accompany a useful
readability or reliability proposal. A PR is a request to merge a selected change;
a fork is a separately maintained copy. Neither is required to keep this record.

## 8. Deferred work and publication boundary

Synchronized local deletion and the private.17 correction passed the manual
in-app deletion and retry checks. Archive/restore, thread-age labels, idle-session policy and
cross-thread communication were not redesigned. Local deletion must not be
presented as cloud deletion. No personal projects directory is hard-coded.

Before any eventual public release, choose its identity/version, preserve
upstream notices, review the selected files, and document the support scope.
Fresh installation, laptop/DPI testing, and network speech remain unverified.
App auto-updates are disabled, so future upstream changes require deliberate
review and rebuilding. The private record, account details, raw network traces,
real conversation screenshots, speech adapters, and test profile are not part of
this shareable document. Preparing these notes does not publish the working tree.

## 9. Maintaining and building this variant

### Launch, folders, and cleanup

From the repository folder, double-click [Start Private T3.cmd](Start%20Private%20T3.cmd).
This opens the private app with its saved conversations and settings. No installer
is needed for this development copy.

All paths below are relative to the repository folder:

| Location                | Contents                                          | Cleanup guidance                                                                   |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `.local/builds/current` | Complete unpacked app and latest installer        | Close the app before replacing its build. Keep the app's companion files together. |
| `.local/profile`        | Conversations, settings, and other saved app data | Keep this during build cleanup; back it up separately from Git.                    |
| `.local/records`        | Verification records and supporting backups       | Retain the evidence and backups you still need.                                    |
| `build/desktop-staging` | Temporary packaging files                         | Normally removed automatically after packaging; do not remove during a build.      |

On this development machine, disposable material blocked from automatic cleanup
is moved to `../temp/delete` (the parent GitHub folder's `temp/delete` directory).
Its `CONTENTS.txt` identifies what is awaiting manual deletion. The current app
and saved profile do not belong there.

The profile, records, and generated builds are ignored by Git. Committing source
does not back them up. Your actual project folders remain wherever you chose them.
The launcher preserves disabled telemetry and updates, enables no debug port,
and records its process information in `.local/records/launch.json`.

### Installing on this or another Windows machine

The private.18 Windows x64 installer is
`.local/builds/current/T3-Code-0.1.6-private.18-x64.exe`. Copy only that EXE for
installation; the blockmap and build metadata are not needed. This installer is
unsigned. It installs supporting files, so the unpacked app EXE alone is not a
portable single-file application.

Installer execution is still unverified at this checkpoint. The next step is
installation and acceptance on the development desktop, followed by other
machines only after that succeeds. Launch the installed shortcut for acceptance;
`Start Private T3.cmd` opens the separate development copy and saved test profile.

A normal installed launch uses the user's `.t3/userdata` backend data and
`%APPDATA%/t3code-v2` desktop profile unless environment overrides are present.
It does not import the repository's `.local/profile` automatically. Fresh font
preferences and speech defaults therefore differ from the saved test profile.
Each machine needs its own Codex/Claude installation and sign-in; existing working
installations/sign-ins can be reused. The installer does not transfer accounts,
conversations, settings, or this machine's custom speech-hook changes.

### Building and maintaining the source

Keep the upstream Git history and v0.1.6 base intact. The custom changes are
recorded on the local `edge358-custom-build` branch without creating an online
repository. Publishing a fork and proposing a pull request are separate
decisions. The parent folder's name does not determine whether anything is
uploaded.

The commit hook passes relative file paths to its staged formatter/linter. This
avoids the Windows command-length limit when committing this larger change set;
the formatter, linter and unused-code checks remain enabled.

Use this checkout's pinned Node/pnpm requirements and established Windows
TypeScript/Electron/Rust packaging workflow. General development setup remains
in [CONTRIBUTING.md](CONTRIBUTING.md). Check the diff, relevant tests, typechecks,
and `.gitattributes` line endings before packaging. Do not use .NET build tools
for this application.

Close the private app before packaging. From the repository root, choose an
unused build version; the default output is `.local/builds/current`:

```powershell
pnpm.cmd run dist:desktop:win:x64 --build-version 0.1.6-private.18
```

The Git-ignored `.local` directory contains all persistent private build and
runtime material. Windows packaging copies the complete `win-unpacked` app along
with the installer. Staging runs under `build/desktop-staging` and is removed
automatically unless `--keep-stage` is explicitly requested. Mock output uses
`.local/builds/mock`; `--output-dir` still overrides the destination.

The verified builds were native Windows, unsigned, with WSL runtime packaging
unset. Their build environment explicitly set `T3CODE_DESKTOP_SIGNED=false`,
`T3CODE_DESKTOP_SKIP_BUILD=false`, `T3CODE_TELEMETRY_ENABLED=false`,
`T3CODE_OTEL_SDK_DISABLED=true`, `OTEL_SDK_DISABLED=true`, and
`T3CODE_DISABLE_AUTO_UPDATE=true`. Packaging uses the Rust toolchain on PATH.
These do not replace the fixed source privacy policy. An unpacked executable
requires its companion files; copying only that EXE is not an installation.

For each future change, update the applicable behavior/default entry here and
the privacy ledger when data flows change. Record the build version, actual
checks, skips, artifact hash and runtime result in the private record. Keep
historical evidence dated; never combine overlapping test counts or describe
an old network capture as validation of a newer build. No fresh install,
cross-platform certification or full dependency audit is implied.
