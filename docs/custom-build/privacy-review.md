# Custom build: security and privacy review ledger

Source/status reconciliation: 2026-11-01. Historical runtime evidence is dated below.
Base: T3 Code `v0.1.6`, commit
`2359643cffa6ba9ee84d6f2694b935de54a8013e`. Current build and validation: [custom changes](../../CUSTOM_CHANGES.md).
See [the complete change summary](../../CUSTOM_CHANGES.md) for appearance,
navigation, defaults, speech, validation, and possible upstream proposals.

This ledger records a targeted source/privacy review and bounded runtime checks.
It is not a penetration test, a full dependency audit, or a security certification.
An unwanted default or optional network request is not automatically a security
vulnerability. Findings below distinguish source-supported paths, observed
connections, and matters not established by testing.

## Review method and evidence scope

The review inspected the pinned source, traced relevant configuration and request
paths, added focused regression tests, built the modified Windows app, inspected
packaged restrictions, and observed process/network/DNS activity during selected
operations. Original review notes, corrections to tracing methodology, build logs,
hash inventories, and raw captures are preserved privately. This document omits
personal paths, account data, and raw traces.

The app receives and stores conversations locally as part of providing its UI.
It launches provider processes that communicate with their services. Localhost
binding controls inbound exposure; it does not prevent outbound connections.
Provider use, authentication, tools, Git, MCP, browsing, and explicitly loaded
remote media can still involve external services.

## Findings and changes

Paths below are relative to the repository root. They identify implementations,
not immutable line numbers. The baseline is the pinned release, not a claim
about every current upstream version.

| ID / area                           | Finding and evidence type                                                                                                                                                                                                    | Implemented response                                                                                                                                                                                                                                                             | Limits / behavior retained                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 Product analytics               | Source enabled analytics by default and posted metadata to `ingest.t3.codes/batch/`. Inspected fields included hashed identity, platform/version, provider/model, usage/status/duration and feature/project/thread metadata. | Fixed reporting policy returns a no-op service before config/identity/queue/timer creation. Sources: `apps/server/src/telemetry/AnalyticsService.ts`, `packages/shared/src/privateBuildPolicy.ts`.                                                                               | Selected event fields were not prompt bodies, but review did not prove global payload sanitization or independently verify upstream server retention/forwarding.                                                                                                             |
| P02 Analytics identity              | Source could read local provider identity files before the transmission gate. Hashed identifiers still support correlation.                                                                                                  | `telemetry/Identify.ts` returns empty identity/owner results when reporting is disabled; no analytics-specific credential lookup is needed.                                                                                                                                      | Provider authentication still legitimately needs provider identity/credentials. This does not remove those files.                                                                                                                                                            |
| P03 Diagnostic export               | OpenTelemetry and relay tracing were separate from product analytics; browser configuration did not simply inherit server environment.                                                                                       | `packages/shared/src/otelEnvironment.ts` forces disabled/exportless resolution; server/web public configuration gates relay tracing; build public config strips diagnostic aliases.                                                                                              | Local logs remain. Environment flags cannot turn the fixed reporting policy back on.                                                                                                                                                                                         |
| P04 Cloud account and relay         | Source could initialize Clerk when cloud configuration existed, independently of analytics, and recover a stored Connect link. Source inspection alone did not establish exact signed-out SDK payloads.                      | Strip cloud build inputs/aliases, gate desktop/web account startup and server CloudLink recovery. Sources: `scripts/lib/public-config.ts`, desktop `DesktopClerk.ts`, server `cloud/config.ts`, `publicConfig.ts`, `CloudLink.ts`, web `cloud/publicConfig.ts`.                  | Keep legitimate agent-provider auth callbacks/deep links. Cloud/relay functionality is intentionally unavailable in this variant.                                                                                                                                            |
| P05 Inbound exposure                | Fresh upstream desktop was local-only, but saved settings could enable other exposure.                                                                                                                                       | Desktop settings and `DesktopServerExposure.ts` clamp exposure to loopback and suppress Tailscale Serve under fixed cloud policy.                                                                                                                                                | This is a desktop application restriction, not a universal host firewall or a guarantee for independently launched servers.                                                                                                                                                  |
| P06 External icons                  | Source could load Google favicons containing a link's hostname, or provider/site-supplied icons, without clicking the link.                                                                                                  | Gate `packages/shared/src/favicon.ts` and web `PreviewFaviconIcon.tsx`; retain generic, bundled, and local captured icons.                                                                                                                                                       | Clicking external links still works and contacts their destinations. No blanket prohibition on intentional browser requests.                                                                                                                                                 |
| P07 Remote conversation images      | Rendering a remote Markdown image could contact its host independently of telemetry.                                                                                                                                         | `RemoteMediaConsent.tsx` gates before mounting the renderer/asset loader; ChatMarkdown uses it. Default automatic loading is off; individual Load external media action available. Gate the selected light/dark picture source too. Strip secondary `srcSet`, use `no-referrer`. | Approved loading still contacts the host. Preference is local to the client. Focused browser tests cover consent behavior; comprehensive packaged media interaction coverage remains incomplete.                                                                             |
| P08 Automatic app updates           | Source already offered an update-disable setting, but disabling auto-download alone would not stop checks.                                                                                                                   | `DesktopConfig.ts` forces the supported disable-update path through fixed policy.                                                                                                                                                                                                | App upgrades become a manual maintenance responsibility. This does not patch every independent dependency updater.                                                                                                                                                           |
| P09 Model manifests                 | Source fetched model metadata independently of reporting; provider-update checking defaulted on.                                                                                                                             | Default `enableProviderUpdateChecks=false`; `ModelManifest.ts` also returns cached/bundled data when settings cannot be read.                                                                                                                                                    | This is a configurable default, not a fixed prohibition. Explicitly enabling the setting may allow fetches. Existing saved true values are not erased.                                                                                                                       |
| P10 Pricing downloads               | Source could fetch a fixed public LiteLLM price file while loading Usage. It was not an upload of local usage data.                                                                                                          | `UsageService.ts` keeps bundled/cached rates and blocks automatic downloads under fixed policy; explicit Refresh remains available.                                                                                                                                              | A manual refresh contacts GitHub. Estimates can be stale/unavailable and are not subscription invoices. Local usage scanning/display remains.                                                                                                                                |
| P11 Provider probes                 | Periodic health/capability checking was separate from update/catalog settings. Disabling all startup discovery later left unchecked status/model pickers.                                                                    | `managedProvider.ts` suppresses interval refresh under fixed policy, while current code intentionally performs initial discovery and retains explicit refresh/configuration paths.                                                                                               | Startup discovery may contact providers. Turning off periodic checks is not a promise that all provider or Limits requests stop. The Claude usage compatibility failure was corrected in private.14, with relative-path handling corrected in private.15; evidence is below. |
| P12 Provider-owned optional traffic | private.1 runtime observation attributed a connection to `http-intake.logs.us5.datadoghq.com` to a Claude child during provider checking.                                                                                    | `ClaudeHome.ts` adds optional-traffic opt-outs after inherited/provider environment; `ClaudeAdapterV2.ts` reapplies at SDK spawn.                                                                                                                                                | TLS payloads were not decrypted. Do not claim prompts were sent to that host or prove they were not. Provider-global configuration/binaries were not rewritten.                                                                                                              |
| P13 Explanatory UI                  | Onboarding text did not describe this variant accurately; mounting onboarding triggered checks.                                                                                                                              | `WelcomeWizard.tsx` explains disabled reporting and intended provider use; checking is an explicit onboarding action. GitHub-star prompt is separately disabled.                                                                                                                 | Initial backend discovery still runs in the current build. Promotion suppression is a preference, not a security fix.                                                                                                                                                        |
| P14 Development listeners           | Development/test listeners can expose local tooling beyond loopback depending on configuration.                                                                                                                              | Web Vite/browser-test listener configuration was restricted to loopback.                                                                                                                                                                                                         | Does not establish the security of every development service or a production remote-debugging setup.                                                                                                                                                                         |
| P15 Local sensitive storage         | Source stores conversation state, artifacts, logs, event records and secrets. The inspected secret-store layer writes supplied bytes and permissions; it does not itself encrypt them.                                       | Recorded as a limitation, not silently described as fixed. Added 30-day defaults only for old browser artifacts and rotated logs.                                                                                                                                                | Effective Windows ACLs, caller-specific encryption and all dependency behavior were not fully audited. Synchronized local provider-history deletion is documented below; secure erase and at-rest encryption were not added.                                                 |
| P16 Optional speech data flow       | New functionality deliberately sends completed assistant text and conversation/run identifiers to a configured queue.                                                                                                        | Off/blank defaults, explicit address, main-renderer IPC check, saved-address lookup, URL restrictions, no redirects, timeout, queue acknowledgement, and no automatic retry.                                                                                                     | Enabling it authorizes that destination to receive the text. HTTP is permitted; service authentication, encryption, retention and LAN setup are not supplied by this integration.                                                                                            |

## Fixed policy versus settings

[privateBuildPolicy.ts](../../packages/shared/src/privateBuildPolicy.ts) contains
seven false flags: `reporting`, `cloudServices`, `remoteIcons`,
`automaticAppUpdates`, `automaticPricingDownloads`, `automaticProviderChecks`,
and `githubStarPrompt`. These gates are compiled into this variant; environment
settings cannot override them. Tests sometimes mock gates on to retain upstream
lifecycle coverage; separate private-policy tests exercise the shipped values.

Do not confuse these with user preferences. Model-manifest update checks default
off but remain configurable. Automatic external media is an opt-in local
preference. Speech is optional. Initial provider discovery is deliberately
allowed even though `automaticProviderChecks` is false: that flag now describes
repeated checks. Required provider connections remain possible.

Claude children receive `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
`DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, `DISABLE_AUTOUPDATER=1`, and
`CLAUDE_CODE_ENABLE_TELEMETRY=0`. Generic keys such as `DO_NOT_TRACK` and
`OTEL_SDK_DISABLED` are not added by the Claude helper: the agent's tool processes
inherit this environment, and those keys can change the user's dev servers and tests.
Inherited values are not removed; the development launcher itself sets
`OTEL_SDK_DISABLED=true`, so its child processes can still inherit that restriction.
These are child-process opt-outs, not an outbound network enforcement layer.

Speech URL validation refuses public IP literals, credentials and fragments, but
allows hostnames without resolving and classifying their addresses. A hostname
can therefore reach a public service. The saved address is editable through the
renderer; the IPC destination lookup is not a local-network security boundary.

## Runtime evidence and changes in conclusions

1. **Initial source review:** identified request paths. It did not prove that
   every path executed in the test profile or establish an installed binary's
   behavior.
2. **private.1:** packaging/read-back verified the initial restrictions. Runtime
   testing then exposed provider-owned optional traffic, requiring another fix.
   The first DNS mask was incorrect; that idle trace cannot prove DNS absence.
   A later calibrated trace and process creation-time filtering corrected the
   methodology, including a reused calibration PID.
3. **private.2:** Claude opt-outs and suppressed initial/periodic probes were
   packaged. Tracing began before app launch. Startup/idle sampling covered
   about 130 seconds, then explicit provider refresh and a synthetic Codex turn.
   Attributed startup IP endpoints were loopback; Windows proxy-discovery DNS
   also occurred. A recorded total of 347 DNS query/completion events confirmed
   recording activity. No events for the checked Claude Datadog intake hosts or
   `ingest.t3.codes` were found during that capture; zero trace buffers were lost.
   Expected provider hosts appeared during explicit actions.
4. **private.5 and later:** initial provider discovery was restored to make status
   and model selection usable. The earlier quiet-startup observation belongs to
   private.2's different startup behavior. It must not be presented as proof that
   private.13 startup has no external requests. Periodic-check gates and Claude
   opt-outs remain in source.
5. **private.13:** accumulated-change tests and UI checks passed as recorded
   privately. No equivalent new comprehensive network capture was made.
   A later user report showed Claude Limits failing to load; the targeted
   diagnosis below established a compatibility problem with the broad CLI opt-out.
6. **private.14:** a narrow first-party subscription usage fallback restored
   Claude weekly limits in the packaged app, including after manual Refresh.
   All child-process opt-outs remain. This was a targeted functional check,
   not another comprehensive traffic capture.
7. **private.15:** focused review corrected probe-relative login-folder selection.
   Regression and packaged Refresh checks passed. All previous privacy gates
   remain; this does not expand the original network-audit claims.

Process discovery was sampled and could miss short-lived children. DNS caching
and encrypted traffic also limit inference. Absence of a recorded hostname is
not proof of absence of all requests. Neither this ledger nor earlier reports
claim all encrypted payloads or all integrations were inspected.

### Later Claude Limits diagnosis (private.13, 2026-10-31)

The existing Limits page already calls refresh when opened, with cooldown and
deduplication. Manual refresh reproduced the warning. Direct SDK probes with all
privacy opt-outs retained initialized successfully, but returned
`rate_limits_available: true` with `rate_limits: null`. Waiting and requesting
again in the same probe did not supply the missing data. No model prompt was sent.

Inspection of the installed Claude CLI (2.1.316) located the usage request and
its shared request gate: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` selects
essential-traffic-only mode, and the usage request does not bypass that gate.
The CLI reports unavailable data instead of exposing the gate reason in its
structured usage response. T3 consequently shows the generic probe-failed notice.

A single authenticated diagnostic GET to
`https://api.anthropic.com/api/oauth/usage` returned HTTP 200 with weekly limits.
The token was read locally for that intended provider request and was not printed
or saved in the diagnostic summary. No reporting setting, TLS verification,
account configuration, quota-reset action, or model prompt was changed/sent.
This confirms the endpoint could answer at that time; it does not guarantee
future availability or establish all failure modes.

The private.14 fix adds `apps/server/src/provider/claudePlanUsage.ts`, reusing
credential/header helpers from `claudeResetCredits.ts`, and wires it through
`ClaudeProvider.ts` and `Drivers/ClaudeDriver.ts`. When SDK usage is missing for
an eligible first-party subscription, it makes a GET to that fixed provider
endpoint using the selected configuration directory's access token. It sends
no prompt or transcript. Redirects are rejected, the timeout is five seconds,
and there is no automatic retry. Normal SDK data takes precedence. Existing
startup/manual/periodic refresh gates remain unchanged.

API-key accounts, custom endpoints, third-party providers and explicit auth-token
environment overrides are excluded to avoid reading a different account's
subscription. HTTP/login/timeout failures produce bounded messages without raw
provider bodies or secrets; a usage failure does not mark an authenticated
provider unavailable. Reporting stays disabled and all Claude child-process
opt-outs remain applied.
This is an explicitly permitted provider usage request, not telemetry.

The existing credential reader uses `.credentials.json`; it does not read the
macOS Keychain, and macOS fallback support is not claimed. It does not refresh an
expired token automatically. Mapping covers known session/weekly, extra-usage
and spend fields. Named weekly model limits in the endpoint's `limits` array
are mapped to the same rows as SDK usage, including Fable. Only model-wide rows
with a valid percentage and explicit display name are used; malformed or
surface-specific entries do not suppress general usage. No model names are guessed. Future
provider schema changes can still require maintenance. The packaged Windows
app displayed fresh Claude weekly data on opening Usage and after Refresh.

A follow-up code review corrected relative configuration-path resolution for
the fallback: `ClaudeDriver.ts` now calls the existing
`resolveClaudeConfigDirPath` from `Drivers/ClaudeSkills.ts` with the probe cwd.
This prevents reading credentials from a different folder when an inherited
`CLAUDE_CONFIG_DIR` is relative. The regression uses a temporary probe directory
and verifies its token is selected; an explicit configured home still overrides
the inherited value. Other pre-existing credential-reader paths were not changed.
The review also traced redirect and cancellation behavior through the actual
Fetch HTTP client implementation. No other blocking issue was found in scope.
Private.15 packages this correction. In the same isolated Windows profile,
Claude weekly limits loaded on opening Usage and remained available after a
completed Refresh, with no warning.

## Test coverage and artifacts

Relevant regression coverage includes:

- Reporting no-op/identity suppression and attempted enabling configuration:
  server `PrivateBuildReporting.test.ts`, `Identify.test.ts`, analytics tests,
  shared `privateBuildPolicy.test.ts` and `otelEnvironment.test.ts`.
- Disabled cloud/account/public config and desktop exposure: desktop
  `PrivateBuildConfig.test.ts`, `DesktopClerk.test.ts`, `DesktopServerExposure.test.ts`,
  server `PrivateBuildCloud.test.ts`, web `privatePublicConfig.test.ts`, scripts
  `private-public-config.test.ts`, and existing lifecycle suites.
- Icons/media: shared favicon tests, `RemoteMediaConsent.browser.test.tsx`,
  `ChatMarkdown.browser.test.tsx`.
- Automatic/manual request boundaries: managed-provider, ModelManifest,
  UsageService, and ClaudeHome suites.
- Speech transport, IPC, and completed-message selection: desktop
  `app/replySpeech.test.ts`, `ipc/methods/replySpeech.test.ts`, web
  `replySpeech.logic.test.ts`; live queue/playback checks for both providers.

The private.13 targeted run had 445 passing tests and four skips across 37 files.
Two skips reflect unsupported symlink fixture creation; two were existing
platform exclusions. Six package typechecks and changed-code lint/format checks
passed. These totals include functional UI tests, not 445 independent security
tests. Earlier overlapping runs are not additive.

Private.14 added usage transport and integration regressions for account
selection, no redirects/body, mapping, malformed replies, HTTP failures,
transport failures, timeout and fallback exclusions. Six focused suites passed
99 tests with no skips/failures; server typechecking and changed-code lint passed.
These counts overlap earlier coverage and must not be added together.

The follow-up review added the relative-path regression and ran the skills
suite because its configuration resolver is now shared with the fallback:
118 tests passed across seven files, two unsupported symlink fixtures skipped.
Those two fixtures gained the existing capability guard; no operating-system
permissions changed. Server typechecking and changed-code lint passed.

Windows packaging and unpacked launch were validated. The private.15 installer
was unsigned and not executed. Private evidence preserves artifact hashes,
build-time source hashes, and later source inventories. The private.13 inventory
includes post-build test guards. Later synchronized-deletion and review changes
are recorded separately in the current change summary; these historical privacy
checks do not certify newer builds.
Hash inventories identify files; they are not source backups or commits.

## Machine-specific actions outside the repository

The private history records an explicitly authorized restriction of two Node
inbound Allow rules to the Private network profile, removing Public permission
through those rules. Existing T3 executable Block decisions were preserved.
After repository-local consolidation, 12 obsolete rules for six deleted build
executables were removed. The current executable's two inbound Block rules and
the shared Node Private-only Allow rules were preserved. These actions are not
installer behavior and are not
delivered to another user by copying this repository.

Two personal speech adapters were backed up and given a T3-only opt-out marker.
No speech-server address/listener configuration or hook registration was changed.
The private record contains recovery paths. Independent speech hooks require
their own duplicate-audio handling; they are not bundled here.

The recurring symlink test failure was handled in tests with an existing
capability probe, not by changing Windows privileges. Development used an
isolated app profile. Those earlier privacy checks did not purge provider
histories. Later synchronized-deletion acceptance intentionally removed only
authorized disposable histories; retained histories were checked independently.

## Open findings and unverified areas

- The Claude Limits correction is verified on this Windows subscription setup.
  macOS Keychain support, undocumented model-specific usage windows and all
  provider/account combinations are not covered by that live verification.
- Windows data-directory ACLs, comprehensive transitive dependencies, and all
  local credential/encryption paths have not been fully assessed.
- The historical source review recorded an atomic-replacement permission/
  durability concern affecting Linux. Windows impact and exploitability were
  not established; no fix is claimed here. The historical advisory search is a
  dated observation, not an up-to-date vulnerability clearance.
- Comprehensive packaged external-media/link tests, all provider/tool/network
  combinations, other-machine installation, laptop behavior and remote/WSL speech
  remain unverified. The rebuilt desktop installer and startup were checked, and
  the owner accepted its appearance/setup. The installed deletion sweep was checked
  against preserved old histories and a kept conversation. Later fresh Claude/Codex
  interaction and UI deletion of a parent, two helpers and a side chat passed;
  before/after checks verified owned content/native-history cleanup and preservation
  of the unrelated conversation. The latest navigation-only follow-up also passed
  the owner's Close/delete-to-home checks and a read-only backend content audit.
  Speech playback was not repeated in these later checks, and none adds a new
  comprehensive network capture.
- Local conversation deletion now includes descendants, server database content,
  message search entries, provider logs, owned checkpoints, and existing attachment,
  terminal, and scheduled-task cleanup. Sanitized replay/deletion records remain;
  shared resources are protected. Usage accounting, shared trace logs, comprehensive
  client-cache cleanup, other provider histories, backups, and cloud data are outside
  this scope. Existing incremental database maintenance reclaims free disk space;
  it is not a secure-erasure guarantee for SQLite or unreachable Git objects.
  Historical manual checks do not certify the new build; current validation is recorded
  in the private build record. See
  [deletion behavior](../../CUSTOM_CHANGES.md#synchronized-local-conversation-deletion).
- Future upstream/provider upgrades can change behavior; the restrictions need
  review and regression checks when rebased. This build disables auto-updating.

The possible upstream contributions are individual behaviors such as avoiding
identity reads when reporting is off, explicit remote-media consent, and clearer
provider-check controls. The fixed private policy is not presumed suitable for
the upstream product. Keep proposed fixes distinct from unproven vulnerabilities.
