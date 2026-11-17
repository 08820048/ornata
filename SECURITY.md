# Security policy

## Supported versions

Only the latest release gets security fixes. The app updates itself; if yours
doesn't, download the current version from [ornata.app](https://ornata.app).

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it
privately through GitHub instead:
[Report a vulnerability](https://github.com/08820048/ornata-new/security/advisories/new)
(the Security tab → "Report a vulnerability").

Include what you can of:

- what an attacker can do, and what they need first (a crafted note, a
  malicious vault, a web page, local access…);
- steps or a file that reproduces it, and the Ornata version and OS;
- anything you know about a fix.

You'll get an answer within a week. Once a fix is released we publish an
advisory and credit you, unless you'd rather not be named.

## What is in scope

Ornata reads untrusted input in several places, and these matter most:

- **Notes and vaults** — Markdown, HTML, images, Mermaid diagrams, math and
  links from a vault someone else made. Opening one must not run code, read
  files outside it, or reach the network beyond loading images it links to.
- **The MCP server and command line** (`ornata mcp`, the HTTP server on
  127.0.0.1) — agents must stay inside the vault and within the access level
  chosen in Settings → Agents. Escaping either is a vulnerability.
- **Updates** — the updater only installs packages signed with the release
  key.
- **Export** — PDF and HTML export must not embed files from outside the vault.

Out of scope: problems that need an attacker who can already change your files
or settings outside Ornata (an agent with shell access can edit `config.json`
like any other file), and issues in forks or unofficial builds.
