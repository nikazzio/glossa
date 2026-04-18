# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in Glossa, please report it responsibly.

**Do NOT open a public issue.**

Instead, email **[nikazzio@users.noreply.github.com]** with:

1. A description of the vulnerability
2. Steps to reproduce (if applicable)
3. Affected version(s)

You can expect an initial response within **48 hours**. We will work with you to understand and address the issue before any public disclosure.

## Scope

Glossa is a local desktop application. Security concerns may include:

- **API key handling** — Keys are stored in the OS keychain (macOS Keychain, GNOME Keyring, Windows Credential Manager). If you find a way to extract them, please report it.
- **LLM data transmission** — All LLM calls go through the Rust backend. If you find unintended data leakage, please report it.
- **Ollama integration** — Ollama runs locally. If you find a way to exploit the localhost connection, please report it.
- **Supply chain** — If you notice a compromised or suspicious dependency, please report it.

## Out of Scope

- Vulnerabilities in upstream dependencies that are already publicly known (check their issue trackers first)
- Issues requiring physical access to the user's machine
- Social engineering attacks
