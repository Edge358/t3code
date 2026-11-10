# Custom Windows build: changes and rationale

These are my personal modifications to T3 Code, shaped around privacy, reliable
cleanup, readability, and the way I work. Some are preferences for my own setup;
others may be useful to more users. The summary below separates those interests,
with rationale, implementation links, and verification details in the sections
that follow.

## At a glance

### Privacy and cleanup

- Disable T3 reporting, diagnostic exports, cloud/relay features, and desktop
  remote exposure.
- Block automatic external icons, require consent for remote conversation images,
  and disable app auto-updates and several automatic checks/downloads.
- Apply provider optional-traffic opt-outs and default old browser captures and
  rotated logs to 30-day cleanup.
- Delete descendant conversations, owned T3 content, and unshared local
  Codex/Claude histories, with retry and protection for shared resources.

### Potential upstream contributions

- More reliable conversation deletion and preservation of the current view while
  an unrelated thread finishes deleting.
- Clickable menu Close/Back controls and an add-folder action in the thread chooser.
- Readability controls, remote-image consent, and avoiding unnecessary identity
  reads when reporting is disabled.
- Claude usage-display fixes and Windows profile/path compatibility improvements.

These are candidates for discussion, not assumptions about upstream priorities;
[section 7](#7-possible-independent-upstream-proposals) identifies their scope.

### Personal workflow and appearance

- Larger, more consistent text, adjustable context-menu sizes, smaller headings,
  and dimmer typing hints.
- A folder chooser for new threads and a neutral welcome page after deleting the
  thread being viewed.
- Optional spoken replies through an existing speech service.
- Automatic settling and restart continuation off by default, with the
  GitHub-star prompt suppressed.

## Background and scope

Original upstream base: T3 Code `v0.1.6`, commit `2359643cffa6ba9ee84d6f2694b935de54a8013e`,
tagged locally as `private-base-v0.1.6`. The maintained source incorporates later
upstream updates with the private behavior preserved. The private build
record (not published) owns the current incorporated upstream snapshot, separately from the installed
private build. Use that snapshot when identifying the remaining custom differences.
This document describes how the variant
behaves now and why. The verification section states the public evidence limits;
exact artifact hashes and machine-specific records live under ignored `docs/local`
and `.local`. The privacy review keeps its own dated runtime evidence.

T3 Code is the upstream project by T3 Tools Inc. This document describes a locally
modified build, not an official release or an upstream-endorsed product. The
upstream [LICENSE](LICENSE) and attribution remain intact. This variant is
maintained on the `edge358-custom-build` branch. The public fork
[Edge358/t3code](https://github.com/Edge358/t3code) keeps `main` identical to
upstream; this branch and single-suggestion branches are published there when ready.

The work started with a privacy review and expanded to readability, project
navigation, settings defaults, optional speech, and synchronized deletion of
provider histories. Personal preferences are separated below from changes that
could be proposed independently upstream. **If you maintain upstream T3 Code and
want to see what might be worth taking, start at
[section 7](#7-possible-independent-upstream-proposals)**; each row names the
problem and links to its implementation or the section explaining the change.
Code and test entry points for the latest work are included below.
The companion [privacy review](docs/custom-build/privacy-review.md) records
findings, implementation choices, evidence, and unresolved review areas.

Documentation locations: this file is the shareable overview; `docs/custom-build`
holds the detailed privacy review. Machine-specific documentation lives under Git-ignored `docs/local`; private
artifacts, runtime data and verification evidence live under Git-ignored `.local`.
Neither is distributed with the source.
The README links here so a future reader can identify this variant.

## 1. Readability and appearance

| Change                       | Reason and resulting behavior                                                                                                                                                                                                                                  | Main implementation                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consistent 24px upper limit  | Previously Interface/Prompt/Terminal stopped at 20px and Code at 18px. All four now permit 24px for distant viewing and accessibility. Existing minimums and default font values remain.                                                                       | [settings.ts](packages/contracts/src/settings.ts)                                                                                                                               |
| One shared chat/code size    | With Separate fonts off, the size beside Monospace font controls the typing box, ordinary replies, code, diffs, file previews, and terminal. Changing it in Settings updates the display without rebuilding.                                                   | [appearanceFonts.ts](apps/web/src/appearanceFonts.ts), [TypographySettings.tsx](apps/web/src/components/settings/TypographySettings.tsx), [utils.ts](apps/web/src/lib/utils.ts) |
| Uniform reply content size   | Prose, inline/fenced code, headings, and tables use the reply size. Weights, structure, and syntax coloring remain. This is a deliberate aesthetic choice; different fonts can still have different apparent letter heights at the same CSS size.              | [index.css](apps/web/src/index.css), [ChatMarkdown.tsx](apps/web/src/components/ChatMarkdown.tsx)                                                                               |
| Independent thread size      | Thread font size sits above Right-click menu size in Appearance > Typography. It uses 12-24, default 22, on the Interface size scale. Only sidebar thread/draft names and their rename fields change; folder names keep following Interface size.              | [TypographySettings.tsx](apps/web/src/components/settings/TypographySettings.tsx), [appearanceFonts.ts](apps/web/src/appearanceFonts.ts), sidebar thread/draft rows             |
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

Thread font size defaults to 22 for profiles without a saved value. It retains
the sidebar label scale (0.875 times the selected size), so matching Thread and
Interface settings produce equal-size labels. At Interface 24, Thread 22 or 20
reduces only the sidebar thread lettering. Settings search, individual reset, and
Restore defaults include this control; the font family remains the Interface font.

Validation includes schema limits, persisted settings, live font changes,
Markdown sizes, app-menu selection/navigation, and packaged computed styles.
The final packaged check measured actual reply/input text at 22px, actual menu
labels at 18px, Interface at 24px, hint opacity 0.5, and typed-text opacity 1.
This is not a claim that every display/DPI combination has been tested.

The sidebar Search placeholder uses half the input font size and 40% opacity.
Typed search text and the search icon keep their normal appearance.

Sidebar folder rows size their offscreen placeholders with the interface scale,
so large fonts do not leave fixed-height gaps when groups expand. Panel maximize
controls disappear immediately on close instead of fading beside their replacement.

The top-bar project name, thread title (including parent threads), and browser tab
name use 50% text opacity. Browser address/search text and its placeholder use the
same half-opacity foreground color. Icons, buttons, sidebar labels, and rename
inputs retain their existing appearance.

The thread-details card starts closed. Collapsing or reopening the left sidebar
does not open it. Its titlebar toggle remains available, and an explicitly opened
inline card is remembered per thread across restarts. Popovers are not restored.

The following model-marker and terminal improvements are supplied by the
incorporated upstream code. They are useful existing behavior, not additional
private changes to reapply during an update.

Model and effort changes appear above the message where the change took effect,
including queued messages promoted to Steer. Web, desktop and mobile share the
change calculation. Existing provider-handoff rows remain separate, and old
messages without recorded switches do not gain guessed history markers.

Terminal updates affect only the relevant thread. Process labels retain spaces;
non-web URLs are not mistaken for editor paths. Terminal context handles inverted
line ranges, and output styling and resume processing avoid repeated parsing.

## 2. Projects and new conversations

Here, a project is T3's record for a working folder. It does not have to be a Git
repository or have a GitHub remote. These navigation changes apply to web and
desktop; mobile keeps its separate navigation behavior.

### Starting a thread

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

### Project order, empty drafts, and open groups

Project heading text matches the existing monogram or configured icon color,
using the same light/dark palette. Emoji and displayed image icons keep neutral
headings; a failed image returns to the monogram color. Only the project name is
colored. This color rule does not change thread names, counts, or controls.

The T3 Code title and sidebar toggle share a navy-blue accent. The Settled label
uses a deep red, while its count and chevron remain neutral. Both accents have
light-mode counterparts; environment backdrops retain their white title and toggle.
These are sidebar presentation colors, not new settings or thread-status colors.

In the desktop app, the T3 Code name is a window-drag area with no Home action.
The sidebar toggle, history arrows, and project/thread dropdowns keep their actions.
In a web browser, the T3 Code name remains a Home link.

In **Manual** project order, drag a project heading onto another heading to move
it in the saved order. Moving downward places it after the target; moving upward
places it before the target. The other project sort modes do not allow dragging
and retain their existing ordering rules. The saved manual order uses the existing
project preference storage and survives restart and conversation deletion.

Choosing a folder for a conversation immediately shows its saved empty draft under
that project as **New thread**. Unsent drafts are saved on this client, including
an explicit title, and do not start an AI session. The existing empty-draft reuse
and workspace/model choices remain. The first prompt uses the normal automatic
T3 title generation unless the user already renamed the draft. Renaming works
from the header or sidebar; a manual title is preserved when sending, including
multiple-model sends. T3 and provider-native titles are not synchronized.

Discard also removes an untouched empty draft, even when no composer content has
been saved. Undo restores the draft and its project association.

Opening or creating a conversation expands its project without closing other
projects. An explicitly collapsed project hides all its rows and stays collapsed
until another visit or New thread action opens it. This applies in every project
sort mode. The former collapsed-group exception that displayed only the current
thread has been removed.

These changes apply to the web and desktop sidebar. Native mobile navigation is
unchanged. Implementation: [Sidebar.tsx](apps/web/src/components/Sidebar.tsx),
[project header](apps/web/src/components/sidebar/SidebarProjectFolderHeader.tsx),
[draft rows](apps/web/src/components/sidebar/SidebarDraftBlock.tsx), and
[draft persistence](apps/web/src/composerDraftStore.ts). Regression coverage:
[browser interaction](apps/web/src/components/ChatView.browser.test.tsx),
[draft storage](apps/web/src/composerDraftStore.test.ts),
[draft discard and Undo](apps/web/src/lib/discardComposerDraft.test.ts),
[project preferences](apps/web/src/uiStateStore.test.ts), and
[title generation](apps/server/src/orchestration-v2/ThreadTitleRegenerationService.test.ts).

### Home after deletion

Home now stays on the neutral **What should we work on?** page until you choose
to start a thread. With existing projects, **Choose a project** opens the same
project chooser; **Start without a project** uses the existing scratch workflow.
Deleting the thread currently being viewed returns home, even if other threads
remain. Deleting an unrelated thread leaves the current view alone, including when
the user navigates elsewhere while deletion is finishing. These rules also apply
to settled threads; deletion no longer selects a replacement conversation.

The home route no longer starts a draft as a side effect. After a successful
delete, the action checks the current environment/thread before navigating home;
no replacement-thread sorting is needed. Implementation:
[home route](apps/web/src/routes/_chat.index.tsx),
[welcome page](apps/web/src/components/NoProjectsHero.tsx), and
[thread actions](apps/web/src/hooks/useThreadActions.ts).
[Navigation regressions](apps/web/src/hooks/useThreadActions.permissions.test.ts)
cover siblings, another environment, a missing sidebar shell, failed deletion,
and navigation while deletion is pending.

### Clickable menu dismissal

Command-menu footer **Close** controls are clickable. File and content search
footers instead offer clickable **Back**, preserving the parent search. Keyboard
shortcuts and the existing submenu Back arrow remain available. The shared
[footer](apps/web/src/components/CommandPaletteContent.tsx) uses the existing
button component and an explicit action from each caller; Back restores the parent
search rather than closing it. [Footer tests](apps/web/src/components/CommandPaletteContent.browser.test.tsx)
and [palette tests](apps/web/src/components/CommandPalette.browser.test.tsx) exercise
mouse dismissal, focus, and restoring the search query with the real app stylesheet.

Chooser implementation: [Sidebar.tsx](apps/web/src/components/Sidebar.tsx),
[SidebarThreadHeader.tsx](apps/web/src/components/sidebar/SidebarThreadHeader.tsx),
[CommandPalette.tsx](apps/web/src/components/CommandPalette.tsx),
[chatRouteCommands.ts](apps/web/src/shortcuts/chatRouteCommands.ts).
The obsolete project-count shortcut helper was removed. User documentation was
updated in [keybindings](docs/user/keybindings.md) and
[thread sidebar](docs/user/thread-sidebar.md). Browser coverage includes opening
the chooser with no projects. Folder browsing and chooser order were also
checked in packaged builds.

The Browser three-dot menu ends with **Close browser**. It uses the existing tab
close operation, including its agent-control confirmation, and removes that
browser session and its floating preview. Other tabs stay open. Closing does not
clear cookies, cache, history, or other browser-profile data.

### Dictation mouse buttons

The desktop main window cancels mouse Back/Forward defaults, including an isolated
button release. This protects conversation navigation when a dictation tool consumes
the press but lets the release through. Intentional side-button history navigation
in the main window is also disabled. Keyboard history, explicit navigation controls,
ordinary mouse input and the preview browser's own history remain available.
This is a T3 safeguard; it does not repair an external tool's mouse interception.

Implementation: [desktopMouseNavigation.ts](apps/web/src/desktopMouseNavigation.ts).
Focused tests cover isolated releases and listener cleanup; existing preview and
keyboard browser tests also run with the guard installed. Native mouse acceptance
is recorded separately in the private build record.

## 3. Changed settings defaults

These defaults apply when a saved field is absent, including an older profile
missing the field. Explicit saved values are not forcibly overwritten. Fixed
privacy restrictions are a separate mechanism, documented in the privacy review.

| Setting                                                               | Upstream default       | Custom default |
| --------------------------------------------------------------------- | ---------------------- | -------------- |
| Project-organized sidebar (`boringSidebarEnabled`)                    | Off                    | On             |
| Auto-settle inactive threads                                          | After 3 days           | Off (`null`)   |
| Auto-settle merged threads                                            | On                     | Off            |
| Continue threads after server restarts                                | On                     | Off            |
| Delete old browser artifacts                                          | Off                    | After 30 days  |
| Delete old rotated logs                                               | Off                    | After 30 days  |
| Provider update checks / model-manifest refresh setting               | On                     | Off            |
| Right-click menu size (new)                                           | No independent control | 18px           |
| Read replies aloud / speech address (new)                             | Not present            | Off / blank    |
| Automatic external media and interactive pages (new local preference) | No consent control     | Off            |

Worktree cleanup remains off. Browser-artifact expiry can make old capture links
stop opening; current logs are kept. These settings do not add conversation or
provider-history deletion. No personal projects directory, provider credential,
speech address, or TV-specific size is built into the defaults.

Because provider update checks default to off and app auto-update is disabled,
newly released models do not appear on their own. Enable the setting under
**Settings → Maintenance** and refresh provider status when you want the current
model catalog; see [Updating](docs/user/updating.md).

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
speech. It sends each finished main assistant message as a separate item to an
existing compatible speech queue, while the agent can continue working. The final
answer is a separate item too. It does not install a speech engine, provide speech recognition, or make
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
  "session": "opaque-environment-thread-run-message-id"
}
```

`source` is `codex`, `claude`, or `t3code`. A successful response must have a
successful HTTP status and JSON `{"queued":true}`. Queue acceptance does not
by itself prove that sound played. Voice selection, text cleanup, synthesis, and
playback belong to the external service.

The desktop main process reads the saved address, validates the requesting main
renderer, permits HTTP/HTTPS without URL credentials or fragments, rejects
redirects, and uses a five-second delivery timeout. Public IP literals are refused,
but hostnames are allowed without checking their resolved addresses; this is not
a guarantee that speech stays on the local network. The app does not automatically
retry uncertain delivery. The IPC payload has text/session length limits and no
destination field, but the renderer can change the saved speech address.

Speech selects finished main assistant messages, excluding user, tool, child-agent,
still-streaming and notification messages. Already finished history is not replayed
on startup or when speech is enabled. Each message is attempted once; completion
and reconnection do not repeat it. Delivery acknowledgements are serialized so a
slow request does not reorder the speech queue. A queued follow-up does not discard
the current run's final answer. Hidden/archived threads and stopped runs remain quiet.
Settings and thread eligibility are checked again before delivery. This works
independently of visual notification preferences. Web/mobile speech transport is
not implemented.

Skipping belongs to the external queue and its controls. The existing queue
advances one item when RememberThisPlease's F9 or X1 action stops current playback.
Sending messages separately preserves those boundaries without changing either
RememberThisPlease or the speech service. Other services need their own skip controls.

Sources: [replySpeech.ts](apps/desktop/src/app/replySpeech.ts),
[speech IPC](apps/desktop/src/ipc/methods/replySpeech.ts),
[reply selection](apps/web/src/replySpeech.logic.ts),
[web coordination](apps/web/src/replySpeech.ts) and its [delivery tests](apps/web/src/replySpeech.test.ts),
[ThreadNotificationCoordinator.tsx](apps/web/src/components/ThreadNotificationCoordinator.tsx),
[ReplySpeechSettings.tsx](apps/web/src/components/settings/ReplySpeechSettings.tsx),
contracts IPC, desktop channels/preload/handlers.

### Existing speech hooks and portability

The native desktop backend sets `T3CODE_APP_SPEECH_MANAGED=1`. Two pre-existing
personal speech adapters were separately updated to honor this marker and avoid
duplicate audio from provider hooks, including generated titles. Their exact
locations are in the private record. Those adapters and the speech
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
opt-outs. Remote conversation images require consent by default. The same
External media preference and a Show page prompt cover MCP tool pages,
agent-made HTML pages and pull request videos; pull request avatars load only
when that preference is on. Provider-supplied connector logos and ACP registry
icons are treated as external icons and do not load.

Claude launches identify as `t3-code` by default, replacing an inherited host
entrypoint. Explicit provider-instance environment settings override that default;
a nonempty entrypoint in Claude's user or managed settings takes precedence.
Inherited Claude session identifiers and messaging credentials are removed before
instance overrides are applied. The parent environment and ordinary terminal
launches are unchanged, and the private optional-traffic restrictions still apply.
This corrects request identification; it does not establish allowance savings.

Initial provider discovery was restored after disabling it left model/status
information unchecked. It can contact providers and remains separate from
periodic checks, optional telemetry, and model-manifest update settings. This
change does not promise every provider request is local or that provider quotas
are governed by the app. Model use still requires provider connections.

The Claude subscription-usage fallback preserves explicitly named weekly model
limits, including Fable, from the provider's `limits` response. It uses the returned
percentage directly and retains general usage when optional entries are unsupported.

The star-request popup is suppressed as a personal preference. The change does
not remove upstream credit or claim authorship of T3 Code.

### Provider reliability

Claude Stop waits up to ten seconds for the SDK acknowledgement before closing
the query through the existing shutdown path. Stop and Force stop can also settle
a run left running after its provider turn ended, preserving an already completed
attempt. Promoting a queued message to Steer retains its chosen model; queued
helper completions follow the conversation's newer model selection.

Helper approvals appear in the parent conversation with separate approve/decline
controls, the correct destination environment, and retry feedback. Claude's
dangerous-removal warnings in bypass mode deny the command rather than opening an
approval; explicit ask rules and restricted modes still request approval. See
[permission modes](docs/user/permission-modes.md). Saved sensitive provider variables
require a replacement value before they can be renamed or made plain text.

Log rotation prunes only canonical numbered rotations. Files with similar names,
such as `debug.log.04` or `debug.log.notes`, remain intact.

ACP provider processes use hidden consoles without detached process groups on
Windows, where detachment can open a blank console during provider discovery.
POSIX process-group ownership and Windows PID-based teardown remain in place.
The Grok discovery and ACP teardown checks cover these launch and cleanup paths.

## 6. Verification approach

Validate future changes with checks appropriate to the affected behavior:

- Focused suites for the changed areas, run with `pnpm exec vp test run <files>`.
  The deletion, provider-session, Claude environment, usage fallback, speech, and
  private-policy suites are the ones most often affected.
- The affected packages' established typecheck scripts, including dependents when
  shared contracts change.
- `pnpm exec vp fmt --check` and `pnpm exec vp lint` on the changed files.
- For runtime changes, a Windows x64 package and a launch/health check of the
  artifact being accepted. Documentation-only corrections do not require rebuilding.

`pnpm exec vp run check:changed` runs upstream source checks, not packaging or
runtime acceptance. On Windows, its child checks use the installed Vite+ JavaScript
entry through Node, so a global `vp` shim is not required. Focused component checks
remain available when the aggregate check reports unrelated existing findings.

Two desktop settings tests create symlink fixtures and skip when Windows cannot
create links without Developer Mode. They use the repository's existing
capability probe; the skipped cases are not counted as verified on this host.

Acceptance distinguishes source regression tests, packaged startup, and checks
against the installed profile. The deletion repair was exercised by the installed
app against preserved deleted conversations and helper descendants; read-only
before/after checks verified removal and preservation of the kept conversation.
Fresh Claude/Codex interaction and deletion through the UI of a parent with two
helpers and a side chat were also verified, including supported native-history
cleanup and preservation of an unrelated conversation. That test used a non-Git
folder; checkpoint-ref evidence comes from separate disposable-Git tests and the
earlier installed cleanup.

The owner subsequently confirmed clickable Close and return to the neutral home
page after deleting the viewed test thread. A read-only backend check confirmed
complete purge and no saved conversations/messages remaining. Unrelated-thread
navigation and file/content-search Back have automated coverage; they were not
separately reported in that manual check. That latest check had no before snapshot
of native histories, so it adds no independent native-file deletion proof.
That deletion acceptance did not recheck speech. The later mouse-navigation and
per-message speech changes passed focused checks and were accepted on the
maintainer's installed desktop. Other-machine installation and broader live scenarios
remain unverified.

Exact build identities and the current build's results are kept in the private
build record under `docs/local`, which is ignored by Git. Records of earlier builds
were retired. Counts from overlapping runs are never added together. An independent
code review of the whole variant, with
its findings and the fixes applied, is in
[docs/custom-build/independent-review-2026-10-31.md](docs/custom-build/independent-review-2026-10-31.md).

### Synchronized local conversation deletion

Delete requires confirmation and recursively includes child conversations, including
provider helper agents, side chats, and forks. Provider shutdown precedes cleanup.
The conversation remains visible with deletion progress; failed cleanup can be
retried with Delete. New agent work is blocked after a partial deletion.

If the user also requests removal of the thread's separate working folder, the
client waits for confirmed history-cleanup completion before removing that folder.
A cleanup failure keeps the folder available for retry. Ordinary thread deletion
continues to report progress asynchronously.

Deletion failures now explain shared-provider activity, newly discovered helpers,
unfinished conversation work, or the cleanup step that failed. The banner and
sidebar hover card give retry guidance without exposing raw error details.
Successful local Delete actions also clear saved right-panel, diff-panel, and
mini-player state for that thread. This does not broaden client-state cleanup to
agent-initiated or other-client deletion paths.

Cleanup removes recorded local Codex/Claude histories, empty Claude session-env
folders (never the Claude project folder itself, which can hold its `memory`),
T3 provider logs and rotations (including logs written under the shorter shared
name that helper threads used before v0.1.8, unless a retained thread also wrote
there), attachments, thread-bound scheduled tasks,
terminal history, and owned Git checkpoint refs. Shared resources needed by retained
conversations are protected. Project files, normal Git branches/tags/commits, and
GitHub repositories are untouched. Archive, Unarchive, Settle, and project removal
retain their existing behavior.

External cleanup steps record completion durably. Once they succeed, the final
transaction purges thread-owned projection rows, message search entries, receipts,
and conversation events. Two sanitized replay anchors and a sanitized thread shell
remain so rebuilds and reconnecting clients recognize deletion. They contain a
placeholder title and routing/deletion metadata, not the conversation's original
title, messages, workspace paths, or provider history IDs. The active deletion
outbox lease is removed when its worker settles. Late events cannot restore content.

Startup queues this same cleanup for previously completed soft deletions and their
descendants. Development snapshots must use disposable provider homes and project
repositories before starting a server: changing T3 home alone does not isolate
provider histories or Git refs.

Usage accounting, shared server trace logs, other providers' native histories,
cloud accounts, backups, old provider homes, and comprehensive client-cache cleanup
are outside this server-side cleanup. Active clients retain their existing cache
removal behavior. Existing database maintenance incrementally returns free pages
to disk on databases with incremental auto-vacuum enabled; no full VACUUM is added
after each deletion. This is not secure erase, and removing Git refs does not
immediately erase Git objects.

Implementation and regression entry points:
[deletion planning/service](apps/server/src/orchestration-v2/HistoryDeletionService.ts)
and its [tests](apps/server/src/orchestration-v2/HistoryDeletionService.test.ts),
[content purge](apps/server/src/orchestration-v2/ThreadPurge.ts),
[Codex cleanup](apps/server/src/orchestration-v2/Adapters/codexHistoryDeletion.ts)
and its [tests](apps/server/src/orchestration-v2/Adapters/codexHistoryDeletion.test.ts),
[Claude cleanup](apps/server/src/claudeHistoryDeletion.ts)
and its [tests](apps/server/src/claudeHistoryDeletion.test.ts).
The [event logger](apps/server/src/provider/EventNdjsonLogger.ts) and its
[tests](apps/server/src/provider/EventNdjsonLogger.test.ts) cover late writes and
full thread IDs whose shortened log filenames collide. These are distinct from
the navigation preference in section 2.

Codex deletion probes ancestor filtering and falls back to tracing parent links
across active and archived histories. Claude deletion resolves redirected home
paths and refuses links inside its history and session-environment folders.

## 7. Possible independent upstream proposals

These are candidate topics, not claims that maintainers want the changes or that
every change is an upstream bug. Check the current contribution requirements
before any submission; the pinned [CONTRIBUTING.md](CONTRIBUTING.md) describes
limited review capacity, focused scope, and prior discussion for product changes.

| Candidate / entry point                                                                                                      | Problem and implemented behavior                                                                                                                             | Keep separate                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [Consistent font limits](#1-readability-and-appearance)                                                                      | Text controls expose inconsistent readable sizes; the four controls now allow up to 24px.                                                                    | Personal 24/22/18 preferences and other defaults.                                                                                       |
| [Configurable context-menu text](#1-readability-and-appearance)                                                              | Native action menus stay small despite larger app text; app-rendered menus use a saved size.                                                                 | Native-menu tradeoffs and cross-platform accessibility need their own review.                                                           |
| [Shared chat/code size](#1-readability-and-appearance)                                                                       | Replies mix unexpected sizes; one shared size controls ordinary replies and code when Separate fonts is off.                                                 | Optional product design, not a universal defect.                                                                                        |
| [Add-folder action in New Thread](#starting-a-thread)                                                                        | The chooser now offers Add project / choose folder alongside existing projects and No project.                                                               | Project-grouping defaults and global shortcut behavior.                                                                                 |
| [Neutral home after deletion](#home-after-deletion)                                                                          | Deleting the viewed thread returns home without starting a draft or choosing another conversation.                                                           | Intentional workflow preference; unrelated-thread preservation can be reviewed independently.                                           |
| [Preserve navigation during deletion](#home-after-deletion)                                                                  | Recheck the current route after deletion so a pending action does not pull the user away from a newer selection.                                             | The choice of home versus another destination.                                                                                          |
| [Clickable Close and Back](#clickable-menu-dismissal)                                                                        | Footer shortcut hints now also work with a mouse; search Back preserves the parent query.                                                                    | Broader command-menu redesign and unrelated navigation changes.                                                                         |
| [Explicit remote-image loading](docs/custom-build/privacy-review.md#findings-and-changes)                                    | Rendering a reply can contact an image host; consent gates loading.                                                                                          | Fixed removal of analytics/cloud features.                                                                                              |
| [Skip identity reads when reporting is disabled](docs/custom-build/privacy-review.md#findings-and-changes)                   | Turning off reporting should also avoid unnecessary identity collection.                                                                                     | Hard-coded private-build policy.                                                                                                        |
| [Optional speech queue](#4-optional-read-aloud-integration)                                                                  | Individual finished assistant messages can be sent to an existing speech service while work continues.                                                       | Personal adapters are not bundled; portability needs review.                                                                            |
| [Windows symlink test guards](#6-verification-approach)                                                                      | Hosts without symlink privileges fail during fixture setup; use the existing capability probe.                                                               | Retain real link validation on capable hosts.                                                                                           |
| [Less prominent placeholder](#1-readability-and-appearance)                                                                  | Hint text can resemble entered text at large sizes; lower its opacity.                                                                                       | Other typography choices.                                                                                                               |
| [Claude subscription usage fallback](docs/custom-build/privacy-review.md#later-claude-limits-diagnosis-private13-2026-10-31) | The CLI can omit usage under its optional-traffic restriction; a bounded first-party fallback restores limits and explains expired login/Keychain limits.    | Private telemetry policy; supported auth modes and provider schema need review.                                                         |
| [Complete local conversation deletion](#synchronized-local-conversation-deletion)                                            | Include descendants, owned server content/logs/checkpoints and unshared Codex/Claude histories, with durable progress, retry and shared-resource protection. | Always-confirm is a preference. Codex's undeclared ancestor filter needs schema work. Unsupported/cloud histories remain outside scope. |
| [Claude home behind a junction](apps/server/src/claudeHistoryDeletion.ts)                                                    | Resolve the real home first so redirected Windows profiles work while links inside history folders remain guarded.                                           | Small focused fix, with tests beside the source.                                                                                        |
| [Desktop profile override](#launch-folders-and-cleanup)                                                                      | `T3CODE_DESKTOP_APP_DATA` isolates the Electron profile without redirecting every child's APPDATA.                                                           | Local launcher scripts and directory layout.                                                                                            |

Automatic-settle defaults, cleanup retention, suppressed promotion, and fixed
privacy restrictions are local preferences. They need not accompany a useful
readability or reliability proposal. A PR is a request to merge a selected change;
a fork is a separately maintained copy. Neither is required to keep this record.

For a source review, take the current incorporated upstream ID from the
private build record (not published).
Replace the placeholder below with that ID. This comparison identifies our
remaining changes; comparing against the original v0.1.6 release also includes
upstream improvements already incorporated here.

```powershell
$upstreamBaseline = '<incorporated-upstream-id>'
git diff $upstreamBaseline -- apps/web/src/hooks/useThreadActions.ts
git status --short
```

Replace the example path with the implementation/test paths above. The diff includes
uncommitted changes; a published branch contains only commits. Existing local
commits group several behaviors, so an upstream proposal should extract a focused
change and its tests instead of assuming the entire branch belongs in one PR.
The README and this document are the introduction for a potential fork; no separate
letter to the maintainers is required to understand the changes.

## 8. Deferred work and publication boundary

Archive/restore, thread-age labels, idle-session policy, and cross-thread
communication were not redesigned. Grouping settled threads by their original
project is also deferred; the new deletion navigation does not change that grouping. Local deletion must not be presented as cloud
deletion. No personal projects directory is hard-coded.

For each public release, choose its identity and version, preserve
upstream notices, review the selected files, and document the support scope.
Other-machine installation, laptop/DPI testing, and network-hosted speech remain
unverified. The installed artifact's remaining acceptance limits are in
[section 6](#6-verification-approach). App auto-updates are disabled, so future upstream changes require
deliberate review and rebuilding. The private record, account details, raw
network traces, real conversation screenshots, speech adapters, and the test
profile are not part of this shareable document.

The [independent review](docs/custom-build/independent-review-2026-10-31.md#for-the-next-reviewer)
preserves historical findings and follow-up guidance. Read its current-reading
notice before treating any dated finding as an open defect; current validation
limits are described in section 6 and the private build record.
The sidebar's hover-only deletion indicator remains unchanged. Current typography
and menu customization are described in section 1. A failed partial deletion intentionally stays marked and
blocks new provider work until retry completes; removed history cannot be restored
by clearing that marker.

## 9. Maintaining and building this variant

### Launch, folders, and cleanup

For the installed app, use its Start Menu or desktop shortcut. The
[Start Private T3.cmd](Start%20Private%20T3.cmd) launcher in the repository opens
the separate development copy using `.local/profile`, creating it if absent. Read the profile
isolation requirements below before using it for requested development or tests;
it is not the normal installed-app shortcut.

All paths below are relative to the repository folder:

| Location                | Contents                                          | Cleanup guidance                                                                        |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `.local/builds/current` | Complete unpacked app and latest installer        | Close the app before replacing its build. Keep the app's companion files together.      |
| `.local/profile`        | Conversations, settings, and other saved app data | Irreplaceable. Never `git clean -x`. Back up with `scripts/backup-private-profile.ps1`. |
| `.local/records`        | Verification records and supporting backups       | Retain the evidence and backups you still need.                                         |
| `build/desktop-staging` | Temporary packaging files                         | Normally removed automatically after packaging; do not remove during a build.           |

On this development machine, disposable material blocked from automatic cleanup
is moved to `../temp/delete` (the parent GitHub folder's `temp/delete` directory).
The current app and saved profile do not belong there.

The profile, records, and generated builds are ignored by Git. Committing source
does not back them up. Your actual project folders remain wherever you chose them.
Before launching retained development data, isolate provider homes and referenced
project repositories as described below; a separate T3 profile alone is insufficient.
The launcher preserves disabled telemetry and updates, enables no debug port,
and records its process information in `.local/records/launch.json`. It relocates
only the Electron profile, through the `T3CODE_DESKTOP_APP_DATA` override added in
this variant, so `%APPDATA%` stays normal for the provider CLIs it starts.

### Installing on this or another Windows machine

Each Windows build produces `T3-Code-<version>-x64.exe` beside its `win-unpacked`
folder, by default under `.local/builds/current`. Copy only that EXE for installation; the blockmap
and build metadata are not needed. The installer is unsigned. It installs
supporting files, so the unpacked app EXE alone is not a portable single-file
application. Use the custom installer supplied for this variant; upstream package
managers and downloads install upstream T3 Code. The maintainer records exact
artifact hashes privately, because a reused version number cannot identify a rebuild.

Launch the installed shortcut for acceptance; `Start Private T3.cmd` opens the
separate development copy and its own profile instead. It does not import a profile
from a previous source folder. Pass
`-BuildDir builds\<name>` to `scripts/start-private.ps1` to open a build that is
not the current one with the same profile.

A normal installed launch uses the user's `.t3/userdata` backend data and
`%APPDATA%/t3code-v2` desktop profile unless environment overrides are present.
It does not import the repository's `.local/profile` automatically. Fresh font
preferences and speech defaults therefore differ from the saved test profile.
Each machine needs its own Codex/Claude installation and sign-in; existing working
installations/sign-ins can be reused. The installer does not transfer accounts,
conversations, settings, or this machine's custom speech-hook changes.

Before launching a development snapshot or retained test profile after this deletion
upgrade, isolate its provider homes and referenced project repositories. Startup
cleanup acts on those external paths; a different T3 home alone is insufficient.
Never use the installed profile as a development server's database.

#### Optional readability and speech preferences

The following preferences reproduce the reviewer's text sizes and speech setup.
They do not transfer conversations, project folders, accounts, or all settings.

| Setting                                           | Fresh install | Test profile                |
| ------------------------------------------------- | ------------- | --------------------------- |
| Settings → Appearance → Interface font size       | 16px          | 24px                        |
| Settings → Appearance → Code font size (chat too) | 13px          | 22px                        |
| Settings → Chat → Read replies aloud              | Off           | On                          |
| Settings → Chat → Speech service address          | blank         | `http://127.0.0.1:8011/say` |

The speech address only works on a machine where that speech queue is running.
Everything in section 3 (project-organized sidebar, auto-settle off, cleanup after
30 days, update checks off, 18px right-click menus) is already the default and
needs no change. Codex/Claude sign-in and project folders are per machine.

Set these values in Settings. Copying an entire settings file also carries other
preferences and the onboarding marker, so it is not part of normal installation.

### Reviewing newer upstream changes

The private upstream update procedure (not published) owns
comparison, overlap review, integration and verification steps. This document owns
the custom behavior those updates must preserve. Exact update results belong in
the private build record (not published).

### Building and maintaining the source

Keep the upstream Git history and v0.1.6 base intact. The custom changes live
on the `edge358-custom-build` branch. Publishing that branch to the fork and
proposing a pull request are separate decisions; each upstream suggestion is its
own branch from the fork's unchanged `main`.

The commit hook passes relative file paths to its staged formatter/linter. This
avoids the Windows command-length limit when committing this larger change set;
the formatter, linter and unused-code checks remain enabled. A release merge is the
exception: it stages every file the release changed, too many for one Windows
command, so the same checks are run by hand on the custom files.

Use this checkout's pinned Node/pnpm requirements and established Windows
TypeScript/Electron/Rust packaging workflow. General development setup remains
in [CONTRIBUTING.md](CONTRIBUTING.md). Check the diff, relevant tests, typechecks,
and `.gitattributes` line endings before packaging. Do not use .NET build tools
for this application.

From the repository root, choose an unused build version and a separate candidate
output folder. The app can remain open while building there. The default output
is `.local/builds/current`, so supply an explicit output folder to preserve it:

```powershell
pnpm.cmd run dist:desktop:win:x64 --build-version 0.1.8-private.<n> --output-dir .local/builds/candidate-<n>
```

The Git-ignored `.local` directory contains all persistent private build and
runtime material. Windows packaging copies the complete `win-unpacked` app along
with the installer. Its payload check allows 96 loose files instead of upstream's 80:
v0.1.8's built-in dictation libraries plus this build's extra server chunks produce 89. Staging runs under `build/desktop-staging` and is removed
automatically unless `--keep-stage` is explicitly requested. Mock output uses
`.local/builds/mock`; `--output-dir` still overrides the destination.

The verified builds were native Windows, unsigned, with WSL runtime packaging
unset. Their build environment explicitly set `T3CODE_DESKTOP_SIGNED=false`,
`T3CODE_DESKTOP_SKIP_BUILD=false`, `T3CODE_TELEMETRY_ENABLED=false`,
`T3CODE_OTEL_SDK_DISABLED=true`, `OTEL_SDK_DISABLED=true`, and
`T3CODE_DISABLE_AUTO_UPDATE=true`. Packaging uses the Rust toolchain on PATH.
These do not replace the fixed source privacy policy. An unpacked executable
requires its companion files; copying only that EXE is not an installation.

Close the app normally before an authorized installation. After successful
installation and startup verification, retain the accepted package as current
and its predecessor as the fallback. Move older packages into the designated
disposal folder and update their recorded locations.
Place the accepted complete package in `.local/builds/current` after installation
verification, moving the previous `current` package into the fallback location first.
This keeps `Start Private T3.cmd` valid without version-specific launcher edits.

On Windows PowerShell, native tools can write ordinary progress to stderr. When
capturing build logs, do not treat every stderr line as a terminating failure;
record the process exit code immediately and inspect it alongside the logs.
The verified workflow uses `$ErrorActionPreference = 'Continue'` for the native
build invocation and checks `$LASTEXITCODE` afterward.

When updating the upstream base, review conflicts in the private policy and cloud/
telemetry gates, provider environment/usage helpers, settings defaults, deletion
planner/purge/logger, web navigation and typography, and desktop packaging.
Rerun the affected focused checks and verify the actual installed artifact; the
older privacy capture is not evidence for new upstream dependencies or behavior.

For each future change, update the applicable behavior/default entry here and
the privacy ledger when data flows change. Record the build version, actual
checks, skips, artifact hash and runtime result in the private record. Keep
historical evidence dated; never combine overlapping test counts or describe
an old network capture as validation of a newer build. No fresh install,
cross-platform certification or full dependency audit is implied.
