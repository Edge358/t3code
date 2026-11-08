# T3 Code: Edge358's Windows build

My personal build of [T3 Code](https://github.com/pingdotgg/t3code), the open-source
app for running coding agents like Codex and Claude. It adds my own changes for
privacy, cleanup, readability and the way I work.

This is not an official release. For the regular app, use
[Theo's project](https://github.com/pingdotgg/t3code). This fork's `main` branch
is an unchanged copy of it.

Thank you to Theo and the T3 Code team for building it in the open, which let me
shape it to my own workflow.

## What's different

- **Privacy:** reporting, cloud and remote features, and automatic updates are off.
  Outside images need your consent.
- **Full delete:** deleting a conversation also deletes it from Codex and Claude Code,
  so it disappears from their apps too.
- **After deleting** the thread you're viewing, you land on a neutral welcome page.
- **Sidebar:** drag projects to reorder them, project colors, a folder chooser for new threads.
- **Readability:** larger text sizes, adjustable menu sizes, quieter headings.
- **Optional spoken replies** through a speech service you already run.

Details and reasons: [Custom changes](CUSTOM_CHANGES.md) ·
[Privacy review](docs/custom-build/privacy-review.md)

## Status

- Based on T3 Code v0.1.6 plus Theo's changes through November 2, 2026. It catches up
  with Theo's releases from time to time.
- Windows only, tested on one machine.
- No download is offered. If I gave you an installer,
  [Start Here](START_HERE.md) walks you through setup.

## Suggestions for T3 Code

Changes that might help everyone are offered to Theo one at a time, each on its
own branch in this fork.

## Credit and license

T3 Code is made by T3 Tools Inc. Their [LICENSE](LICENSE) applies to this build.
This build is not endorsed by them.
