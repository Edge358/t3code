# Independent review of the private Windows build (2026-10-31)

This is a second-opinion review of the two local commits on `edge358-custom-build`
(91a91457 and 0e88eb39, on top of upstream v0.1.6, tag `private-base-v0.1.6`), written
as a brief for a fresh agent. The three Status sections below record what was then
fixed; those fixes are the commit that follows 0e88eb39. If you are reviewing that
commit, start at [For the next reviewer](#for-the-next-reviewer). To understand the
original findings, read [Findings](#findings).

## Status after the first fix pass (same day)

Applied in the working tree, each with a regression test where one fits:

- **A1** `codexHistoryDeletion.ts` probes the ancestor filter with an impossible id
  per archived state and skips the descendant walk when Codex ignores it. New test
  case covers the ignored-filter path; the existing case counts the two probes.
- **A2** `Orchestrator.ts` refuses commands only while `historyDeletion.status` is
  `pending`. The `partial` deletion scenario now asserts that archive succeeds after
  a failed attempt. User doc sentence updated in `docs/user/thread-sidebar.md`.
- **A3** `ProviderSessionManager.ts` drops the closure entry on failure as well as
  success, and `awaitClosed` logs a settled-but-failed close instead of failing.
  New test: `history deletion proceeds after a provider shutdown whose finalizer failed`.
- **C1** `ClaudeHome.ts` no longer sets `DO_NOT_TRACK` or `OTEL_SDK_DISABLED`; the
  test and the privacy ledger paragraph were updated.
- **C2** `ClaudeDriver.ts` grants the probe TTL when reporting is disabled.
- **E1** arrow fixed. **E4** tag `private-base-v0.1.6` created; remote renamed to
  `upstream`.

Focused suites run after the changes: Codex deletion, Claude environment, history
deletion, provider session manager. All pass. Server `tsc --noEmit` passes, and
`vp fmt --check` and `vp lint` pass on every file touched in this pass.

`vp run check:changed private-base-v0.1.6` cannot run on this machine: the script
spawns a global `vp` binary, which is not installed (the repo is driven through
`pnpm exec vp`). Its log in `.local/records/check-changed.log` shows every step
failing with `NotFound: ChildProcess.spawn (vp ...)`, not real check failures. Either
install `vp` globally per the README or keep running the component checks by hand.

## Status after the overnight passes (same night)

Phases 2 to 4 were applied in the same working tree, still without a commit.

- **A4** `Orchestrator.ts` checks the in-flight condition once per deletion group and
  plans only side chats that are not already in flight. New scenario
  `side-chat-double-delete` in the deletion suite.
- **A5** `ThreadManagementService.dispatch` returns the receipt immediately; clients
  follow `historyDeletion` on the thread shell.
- **A6** The web sidebar row and the mobile thread list show "Deleting conversation
  history…" or "Deletion incomplete. Delete again to retry."
- **A7** `ORCHESTRATION_V2_INTERNAL_COMMAND_TYPES` is derived from the internal
  command union in contracts; the orchestrator checks `command.type` against it.
- **A8** Left as is on purpose: the planner must consult the outbox because a dead
  worker leaves `status: pending` behind, and the `worker-failed` scenario depends
  on replanning in that state.
- **A9** `claudeHistoryDeletion.ts` works on the real path of the Claude home and only
  refuses when the `projects` folder itself is a link. New `junction-home` scenario.
- **A10** `state!` assertions removed; `prepareDeletion` carries a span; the Codex
  helper's span is named after its own module.
- **B1** `validateSpeechServiceAddress` in the desktop main process rejects
  credentials, fragments, non-HTTP schemes, and public IP literals; the settings
  write handler refuses an address that fails it. Hostnames are allowed.
- **B2** The client-clock speech guard is gone; the completion gate already prevents
  replay.
- **B3** `speakCompletedReply` reuses the loaded projection when the thread is open
  and fetches only otherwise.
- **B4** Test sentence tagged `t3code`; the acknowledgement body is capped at 4 KB
  (new test); the test button waits on the last save instead of rewriting settings.
- **C3** macOS gets a Keychain explanation instead of a login prompt (new test).
- **C4** Expired logins skip the request with a clear message (new test); one
  config-dir resolution serves every credential read; the maintenance probe gets
  the Claude privacy environment too.
- **D3** `CUSTOM_CHANGES.md` section 3 states that new models need the update-check
  setting enabled.
- **D4** The dead delete-confirmation setting row, search entry, and hard-coded
  constants are removed; confirmation is simply always asked. The schema field
  stays so saved profiles still decode.
- **D5** `T3CODE_DESKTOP_APP_DATA` overrides the desktop profile location; the
  launcher sets it instead of `APPDATA`, and accepts `-BuildDir`.
- **E2** `.local/README.txt` warns about `git clean -x`;
  `scripts/backup-private-profile.ps1` copies the profile to
  `%USERPROFILE%\T3PrivateBackups`.
- **E3** `CUSTOM_CHANGES.md` sections 6, 8, and the install section now describe
  current behavior; the build-by-build narrative moved verbatim to the private
  build record. The README checkpoint paragraph is a pointer.

Deliberately untouched, taste calls for the owner: **D1** chat heading sizes,
**D2** DOM context menus on desktop, **D6** build output folder naming.

Verification for the overnight passes: deletion, provider session manager, Codex
deletion, Claude environment, Claude plan usage, reset credits, desktop speech,
desktop config, notification coordinator, speech selection, thread action hooks,
settings panels, settings search, and command palette suites all pass.
`tsc --noEmit` passes for contracts, server, web, desktop, and mobile. `vp fmt`
and `vp lint` pass on every modified file. A `0.1.6-private.19` Windows build was
packaged to `.local/builds/private.19` and smoke-launched with the retained profile:
the backend reported the new version, `GET /health` returned HTTP 200, the profile
override worked, and the app closed cleanly. Details are in the private build record.

## Second verification pass (same night)

Two fresh reviewers read the working-tree diff without the author's conclusions. What
they found, and what was done:

- **A1 was under-cautious.** Skipping the descendant walk when Codex ignores the filter
  could cascade-delete a protected descendant on an older Codex. Fixed: the fallback
  now lists the history unfiltered and computes descendants from `parentThreadId`,
  which the vendored schema does declare. Tests cover a protected neighbor (deleted)
  and a protected grandchild (retained).
- **A3 is deliberately half of what the first review asked.** A close that fails is
  treated as finished; a close that hangs still blocks deletion until it completes,
  because a provider process that never exits may still be writing the files. The
  existing test `history deletion waits for a late provider shutdown` encodes that.
- **A4 was not a bug.** Every group member shares the root's request id, so the old
  per-member check already found the same pending effect. The refactor stays because
  it is simpler and excludes a side chat with its own in-flight deletion from the
  group, and the `side-chat-double-delete` scenario stays as plain coverage, not as
  proof of a fix.
- **A2 leaves an open reverse state.** Nothing clears a `failed` deletion label except
  a successful retry, so a kept thread shows "Deletion incomplete" until then. Still
  open; a "keep thread" command would close it.
- **B1 was wired wrong.** Rejecting the write in the main process would have broken
  every later settings save, because the renderer applies patches optimistically and
  swallows persistence errors. Fixed: the validator moved to
  `packages/shared/src/speechServiceAddress.ts`; the renderer validates before saving
  and shows the reason; the main process only blanks a bad address instead of
  rejecting. Tailscale's 100.64/10 range is accepted.
- **B3 was a net loss for closed threads.** Reading an unmounted thread atom starts a
  throwaway subscription. Fixed: the loaded projection is consulted only for the
  thread on screen.
- **B4** the acknowledgement is now read through a bounded stream reader, so a chunked
  body cannot be buffered past the cap (new test row).
- **C2** caches the CLI probe only; the usage GET still runs per provider check. Left
  as is, since periodic checks are off in this build.
- Knip flagged `readAccessToken` as an exported-but-local helper after the refactor;
  it is module-private now. The launcher's already-open check now matches any private
  build, and the backup script matches the recorded start time before refusing.
- Known leftover: the web sidebar's deletion indicator lives in the hover card like the
  existing error indicator, so keyboard and touch users see it only in the chat view.

## For the next reviewer

The fixes described in the three Status sections were committed as one commit on
`edge358-custom-build`, directly after 0e88eb39. To see exactly what changed:

```
git log --oneline private-base-v0.1.6..edge358-custom-build
git diff 0e88eb39 HEAD --stat
git diff 0e88eb39 HEAD
```

Where the risk is, in order:

1. `apps/server/src/orchestration-v2/Adapters/codexHistoryDeletion.ts` and its test:
   the ancestor-filter probe and the `parentThreadId` fallback (section A).
2. `apps/server/src/orchestration-v2/Orchestrator.ts`, the `thread.delete` case:
   in-flight root handling and `activeSideChatIds` (section A).
3. `apps/server/src/orchestration-v2/ProviderSessionManager.ts`: a failed finalizer no
   longer blocks deletion; a hung close still does (section A).
4. `packages/shared/src/speechServiceAddress.ts`, `apps/desktop/src/app/replySpeech.ts`,
   `apps/desktop/src/ipc/methods/clientSettings.ts`, and
   `apps/web/src/components/settings/ReplySpeechSettings.tsx`: address validation in
   the renderer with a blanking backstop in the main process (section B).
5. `apps/web/src/replySpeech.ts` and `ThreadNotificationCoordinator.tsx`: projection
   reuse only for the thread on screen (section B).
6. `apps/server/src/provider/claudePlanUsage.ts`, `claudeResetCredits.ts`,
   `ClaudeDriver.ts`, and `ClaudeHome.ts`: expired-login and macOS messages, child
   environment opt-outs (section C).

Everything else in the commit is UI indicators, settings cleanup, launcher scripts, and
documentation. Open on purpose: the sticky "Deletion incomplete" label (A2), the
hover-only web sidebar indicator, and the taste calls in section D.

How it was verified before the commit: the focused test files beside each change,
typecheck per package (`pnpm run typecheck` in `apps/server`, `apps/mobile`,
`packages/contracts`, `packages/shared`; `pnpm exec tsc --noEmit -p` for `apps/web`
and `apps/desktop`), `vp fmt --check` and `vp lint` on the changed files, knip filtered
to the changed files, a rebuild as `0.1.6-private.19`, and a smoke launch of that
build. `vp run check:changed` does not run on this machine because it spawns a global
`vp`; run the pieces above instead.

## Scope and how this review was done

- Repository: `E:\Projects\GitHub\t3code_v0_1_6`. Upstream base is T3 Code v0.1.6,
  commit `2359643c`. Local commits: `91a91457` (privacy, readability, speech,
  Claude usage fallback) and `0e88eb39` (synchronized history deletion, build
  consolidation). Together: 147 files, about 4,650 insertions.
- Method: read `README.md`, `CUSTOM_CHANGES.md`, `docs/custom-build/privacy-review.md`,
  the private `docs/local` index and install handoff, and the full code diff against
  `2359643c`. Two sub-reviews went deep on the deletion subsystem and on the
  speech/Claude-usage code. Three focused test files were run (33 tests, all pass).
  Claims that mattered were spot-checked against the vendored Codex protocol schema
  and the installed `codex.exe`.
- Not done: no full test suite, no typecheck, no packaging, no installer run, no
  network capture. The existing documents already say those are open.

Severity scale: **Blocker** (fix before relying on the feature), **Should fix**
(real defect or risk, not urgent), **Consider** (design choice worth revisiting),
**Tidy** (style, docs, hygiene).

## Summary verdict

The work is unusually well documented and the overall architecture choices are
sound. The fixed `privateBuildPolicy` module is a clean way to compile the privacy
restrictions in, the orchestrator stays free of I/O, and the deletion feature uses
the outbox/effect pattern correctly. Nothing found suggests data loss outside the
intended thread.

However, the synchronized deletion feature has three defects that make it unsafe to
depend on yet, the Claude child-process environment leaks generic opt-out variables
into the user's own tooling, and the documentation has grown a history layer that
the repository's own rules say does not belong in tracked files. Details follow.

## Findings

### A. Synchronized local conversation deletion (commit 0e88eb39)

**A1. Blocker. Codex descendant protection depends on an undeclared protocol field.**
`apps/server/src/orchestration-v2/Adapters/codexHistoryDeletion.ts:29-30` sends
`ancestorThreadId` to `thread/list` via `client.raw.request`, bypassing the typed
client. The vendored schema
(`packages/effect-codex-app-server/src/_generated/schema.gen.ts`, `V2ThreadListParams`
at line 55081) has no such field. The installed `codex.exe` 0.166.0 does contain the
string `ancestorThreadId`, so the manual test in the change log was genuine. The risk
is version drift: a Codex build that ignores the field will page the user's entire
history and return `retained` whenever any other T3 Codex thread exists, so deletion
silently never happens; a build that rejects unknown fields fails every Codex target.
Fix: regenerate the protocol schema from the installed Codex so the field is typed,
then use the typed request instead of `raw`. Add a capability check or version floor
in the Codex driver so an older Codex reports `unsupported` rather than `retained`.

**A2. Blocker. A failed history deletion is a one-way door.**
`Orchestrator.ts:13461-13487` rejects almost every client command while
`thread.historyDeletion` is set, including when its status is `failed`. The only
exit is a successful retry. Several failure modes can persist: no resolvable cwd
(`HistoryDeletionService.ts:195-202`, even though neither Codex nor Claude deletion
needs one), usage cache that cannot persist (`UsageService.ts:935-950`), and the
closure bookkeeping bug in A3. The repo's "reverse states" rule applies.
Fix: gate only `pending`, not `failed`; add a server command that clears
`historyDeletion` so the user can keep the thread; drop the cwd precondition.

**A3. Blocker. Failed provider closes poison every later deletion of that session.**
`ProviderSessionManager.ts:995-1013` removes a `pendingClosures` entry only on
success. On failure the deferred is failed but the entry stays, and a timed-out
close never resolves at all. `awaitClosed` (lines 2397-2408) awaits every entry for
the session id, which is stable per provider instance, so one bad close makes every
later deletion for that instance fail until the server restarts.
Fix: remove the entry in both branches; treat a finished-but-failed close as "process
gone" and continue.

**A4. Should fix. A second Delete during an in-flight deletion strands side chats.**
`Orchestrator.ts:12998-13032`: the main thread re-plan emits only metadata, but side
chats are re-planned with the new command id. The in-flight effect skips them and
then marks the parent failed with "A side chat could not be fully deleted". A third
Delete recovers. Fix: evaluate the in-flight condition once for the whole group.

**A5. Should fix. The `thread.delete` RPC now blocks until native deletion completes.**
`ThreadManagementService.ts:749-766` awaits completion inside dispatch, which includes
provider shutdown (up to the close timeout), a 92-day usage rescan with refresh
(`UsageService.ts:936-944`), and one fresh provider session per target. Remote or
tunnel clients can time out and show a failure for a deletion that then succeeds.
Fix: return the receipt immediately. Clients already receive `historyDeletion` on
the thread shell and can render progress.

**A6. Should fix. Mobile and the web sidebar show no deletion state.**
`packages/client-runtime/src/state/models.ts:138,330` carries `historyDeletion`, but
only `apps/web/src/components/ChatView.tsx:939` reads the message. The sidebar row
and the mobile list show nothing, so a frozen thread looks broken. Fix: show
status/message on the sidebar row and in the mobile thread list and header.

**A7. Consider. Hot-path schema walk.**
`Orchestrator.ts:307,13462` runs `Schema.is(OrchestrationV2Command)` on every dispatch
just to exclude internal commands. Replace with a `Set` of internal command types.

**A8. Consider. Orchestrator reads outbox effect status.**
`Orchestrator.ts:12998-13006` consults `effectOutbox.get` from the planner. The pure
signal `historyDeletion.status === "pending"` already exists; use it and plan the
group once so the `index === 0` merge at 13075-13092 disappears.

**A9. Consider. Claude deletion refuses when `~/.claude` is reached through a link.**
`apps/server/src/claudeHistoryDeletion.ts:27-34` compares `realpath` of the projects
folder to itself. Redirected profiles and junctions are common on Windows and would
turn into a permanent `failed` (see A2). Only reject when the session file itself is
a link. The UUID check at line 18 already removes traversal risk.

**A10. Tidy.** `HistoryDeletionService.ts:124-267` uses `state!` eleven times; the
span name in `codexHistoryDeletion.ts:85` names a different module;
`HistoryDeletionService.test.ts:104` casts through `unknown` instead of building a
real runtime; `UsageService.ts:935` is an `Effect.gen` where the repo wants a named
`Effect.fn`; the pricing-policy change in `UsageService.ts:261-262` is unrelated to
deletion and landed in the deletion commit.

Tests for this subsystem follow the repo rules (effect clock, worker drain, no
sleeps). Missing cases: the double-Delete race (A4), a failed or timed-out close
followed by retry (A3), and anything that exercises the real Codex `thread/list`
contract (A1).

### B. Optional "read replies aloud"

**B1. Should fix. The destination is renderer-controlled in practice.**
The main process reads `speechServiceAddress` from client settings
(`apps/desktop/src/ipc/methods/replySpeech.ts:27-28`), but the renderer writes that
file over the settings channel and the schema is a bare string
(`packages/contracts/src/settings.ts:360`). A compromised renderer can therefore point
the main process at any reachable host and POST up to 1 MB of JSON. The documented
claim that "the renderer cannot pass an arbitrary destination" is overstated.
Fix: validate the address in the main process at write time, and restrict to
loopback and private ranges since the feature is described as LAN-only.

**B2. Should fix. Server and client clocks are mixed in the speech guard.**
`ThreadNotificationCoordinator.tsx:86-89` compares a server-stamped `completedAt` to
a client `Date.now()`. The existing completion gate already prevents startup replay
and dedupes by `completedAt`, so the extra timestamp only adds skew risk. Remove it.

**B3. Should fix. Full projection refetch per completion.**
`apps/web/src/replySpeech.ts:15-44` fetches the thread projection with refresh on
every completion in every watched environment, even when the thread is already
loaded. Reuse the loaded projection when present.

**B4. Tidy.** `ReplySpeechSettings.tsx:66` saves the whole settings file as a queue
barrier; the test sentence is tagged `source: "codex"` and should be `"t3code"`;
`apps/desktop/src/app/replySpeech.ts:19` reads an unbounded response body;
`T3CODE_APP_SPEECH_MANAGED=1` is set whether or not speech is enabled. Speech has
no palette or keybinding entry point, which is acceptable for an opt-in device
feature.

The main-renderer check, URL validation, redirect rejection and timeout are sound.
Client settings do not sync across devices today, so the LAN address does not leak.

### C. Claude usage fallback and child-process opt-outs

**C1. Should fix. Generic environment variables leak into the agent's subprocesses.**
`apps/server/src/provider/Drivers/ClaudeHome.ts:12-24` sets `DO_NOT_TRACK=1`,
`DISABLE_TELEMETRY=1` and `OTEL_SDK_DISABLED=true` on the Claude child. Every Bash
tool call the agent runs inherits them, so the user's own dev servers, tests and
tools run with OpenTelemetry disabled and generic tracking flags set.
`CLAUDE_CODE_ENABLE_TELEMETRY=0` already stops Claude's own exporter. Keep only the
Claude-specific keys.

**C2. Should fix. The capabilities cache never earns its TTL.**
`ClaudeDriver.ts:251-258` grants the five-minute cache only when SDK usage is
defined. The nonessential-traffic flag makes it always undefined, so every provider
check re-spawns the CLI probe and performs the HTTPS fallback. Move the fallback
inside the cached probe so recovered usage counts as fresh.

**C3. Should fix. macOS always reports a misleading error.**
`claudeResetCredits.ts:140` returns no token on darwin, so `claudePlanUsage.ts:35-39`
tells every Mac user they need a readable local login. Irrelevant for this Windows
build today, but it will matter the moment the build is tried elsewhere. Return a
neutral "unavailable while optional traffic is disabled" on darwin.

**C4. Consider.** `readAccessToken` ignores `expiresAt`, so an expired token produces
"Sign in again" when the CLI would refresh silently on the next turn. Two different
config-dir resolutions are used in one probe (`ClaudeDriver.ts:157` vs `159-166`);
use one. The maintenance/update probe at `ClaudeDriver.ts:146-150` is the one spawn
path that does not receive the privacy environment. Forcing `DISABLE_AUTOUPDATER`
over a user's explicit value is documented as intended; say so in the provider UI.

Credential handling is otherwise good: fixed error strings, status checked before
body parse, token never logged, API-key and custom-endpoint accounts excluded.

### D. Privacy policy, UI, settings, build

**D1. Consider. Chat headings lose their size hierarchy.**
`apps/web/src/index.css:2234-2241` sets every heading, table and code block inside
replies to `font-size: inherit`. Headings now differ from body text only by weight.
If the goal was "no surprising size jumps", a mild scale (for example h1 at 1.25em)
keeps structure legible. This is a taste call; the current state is deliberate.

**D2. Consider. All desktop context menus are now the DOM fallback.**
`apps/web/src/localApi.ts:44-55` removes the native menu path on desktop so the new
menu-size setting can apply. Trade-off: menus can no longer extend outside the
window and lose native look. Acceptable for this build; the two added comments
restate the code and the repo's comment rule would drop them.

**D3. Consider. New Claude models now require a manual refresh.**
`enableProviderUpdateChecks` defaults to off and `ModelManifest.ts:233` also skips the
fetch when settings cannot be read. Combined with disabled app auto-update, model
lists go stale until someone acts. Fine if understood; worth a line in the user docs.

**D4. Tidy. Hard-coded confirmation.** `apps/web/src/components/Sidebar.tsx:903` has
`const confirmThreadDelete = true;` while the setting still exists in the schema and
Settings shows a disabled switch. Either remove the setting from the client schema
and the Settings row, or honor it. The current mix is the worst of both.

**D5. Tidy. The launcher redirects APPDATA for the whole process tree.**
`scripts/start-private.ps1:21` sets `$env:APPDATA` so Electron picks a private
profile. Every child process (Codex, Claude, their tools, npm) inherits that value,
which can change where they read config and caches. The desktop app resolves its
user-data folder in `apps/desktop/src/app/DesktopUserData.ts` with no env override.
A one-line `T3CODE_DESKTOP_USER_DATA` override there would let the launcher stop
touching `APPDATA`.

**D6. Tidy.** `build-desktop-artifact.ts` now writes to `.local/builds/current` and
copies `win-unpacked` for every Windows build; upstream CI expects `release`. Keep,
but note it in the rebase checklist (section F).

The privacy gates themselves read correctly: analytics returns a no-op service
before any identity read, OTEL cannot be re-enabled by environment, cloud/relay is
refused at config, link, exposure and settings layers, favicons and remote images
are gated, and the build script strips Clerk and relay aliases. Tests mock the policy
back on where upstream lifecycle coverage is needed and separate tests pin the
shipped values. That pattern is reasonable and should stay.

### E. Documentation and repository hygiene

**E1. Should fix. Mangled arrow in user docs.** `docs/user/project-settings.md:51`
reads `Settings ? Projects`. Upstream convention is `Settings → Projects`. Likely a
PowerShell encoding slip; scan any future doc edits for the same.

**E2. Should fix. `.local/profile` lives inside the repository folder.**
The retained conversations and settings are ignored by Git, which means
`git clean -fdx`, a fresh clone, or an over-eager cleanup deletes them with no
recovery. Either move the profile outside the checkout (the launcher already sets
`T3CODE_HOME`, so this is a path change) or add a scheduled copy to a location that
is backed up. At minimum put a `DO_NOT_DELETE.txt` beside it.

**E3. Should fix. Tracked docs carry build-by-build history.**
`CUSTOM_CHANGES.md` sections 6 and 9 narrate private.13 through private.18, test
counts, and installer status. `README.md` has a "Current checkpoint" paragraph that
is already stale once anything changes. `AGENTS.md` says tracked docs describe
current behavior and reasons, not history. Keep `CUSTOM_CHANGES.md` to: what differs
from upstream, why, where implemented, how to build. Move the validation narrative
and checkpoints to `docs/local/T3Code_Private_Build_Record.md`, which already holds
that material. Replace the README checkpoint paragraph with a pointer.

**E4. Tidy. Git setup.**

- `origin` points at the upstream repository. Rename it to `upstream` and only add an
  `origin` when a private remote exists, so an accidental `git push` cannot target
  upstream.
- Tag the base: `git tag private-base-v0.1.6 2359643c`. Every rebase and every
  "what did we change" diff then has a stable anchor.
- Commits are authored as `Edge358 <58263644+Edge358@users.noreply.github.com>`. Confirm that is the intended
  identity for this machine.
- Two commits hold 147 files. Do not rewrite them now, but future work should land
  as one change per commit (the pricing-policy change in the deletion commit is the
  example).

### F. Rebase and maintenance notes for a future upstream update

The policy module is imported in roughly 25 upstream files and about a dozen
upstream test files were edited to mock it. Expect conflicts in: the cloud layer
(`CloudLink.ts`, `config.ts`, `publicConfig.ts`), telemetry (`AnalyticsService.ts`,
`Identify.ts`), desktop exposure and settings, `favicon.ts`, `otelEnvironment.ts`,
`managedProvider.ts`, `settings.ts` defaults, `Sidebar.tsx`, `chatRouteCommands.ts`,
`CommandPalette.tsx`, `index.css`, and `scripts/build-desktop-artifact.ts`. Keep a
short checklist in `CUSTOM_CHANGES.md` section 9 naming these, and after each rebase
run the private-policy tests plus `vp run check:changed`.

## What should not change

- The `privateBuildPolicy` constant approach. It is the simplest model that makes
  "environment cannot re-enable this" true.
- The decision to allow initial provider discovery while disabling periodic checks.
- Remote media consent as a client-local preference.
- Keeping deletion T3-only for project removal, as the user chose.
- The outbox/effect design of deletion. Fix it; do not rewrite it.

## Work order

Suggested order for a fresh agent. Each item names its finding.

1. A3, then A2, then A1 (deletion safety). Add the three missing tests named in
   section A. Run `vp test run apps/server/src/orchestration-v2/HistoryDeletionService.test.ts`
   and the Codex deletion test after each.
2. C1 (strip generic env vars from the Claude child) and C2 (cache TTL). Run the
   `ClaudeHome`, `ClaudeDriver` and `claudePlanUsage` tests.
3. B1, B2, B3 (speech hardening and performance).
4. A4, A5, A6 (deletion UX and remote clients).
5. E1, E2, E4 (docs fix, profile safety, git setup). These are small and safe to do
   first if the deletion work is not scheduled yet.
6. E3 (slim the tracked docs), then D4, D5, A7 to A10, C3, C4, D1 to D3 as time allows.

Before packaging a new private build: `vp run check:changed`, then the focused
suites named above, then bump the build version in the `dist:desktop:win:x64`
command exactly as `CUSTOM_CHANGES.md` section 9 describes. Record results in the
private build record, not in tracked docs.

## Verification performed for this review

| Check                                                                             | Result                                                     |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `privateBuildPolicy.test.ts`, `settings.test.ts`, `private-public-config.test.ts` | 3 files, 33 tests, all pass                                |
| `ancestorThreadId` in vendored Codex schema                                       | absent                                                     |
| `ancestorThreadId` in installed `codex.exe` 0.166.0                               | present                                                    |
| Line endings of new tracked files                                                 | LF (the `.cmd` launcher is CRLF by attribute, as intended) |
| `build/desktop-staging`, `.local/`, `docs/local/` ignored                         | yes                                                        |
| Encoding damage in changed files                                                  | one hit, `docs/user/project-settings.md:51`                |
