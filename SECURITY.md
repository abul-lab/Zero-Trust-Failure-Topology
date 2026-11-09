# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.x` | Yes |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for suspected security vulnerabilities. Instead, use GitHub's private vulnerability reporting feature on this repository so the issue can be triaged and patched before public disclosure.

## Deployment Hardening

1. **Bind Locally by Default**: `TOPOLOGY_HOST` defaults to `127.0.0.1` so the console and simulation API are not exposed to untrusted networks unless explicitly configured behind TLS and authentication.
2. **Enable `TOPOLOGY_API_KEY` in Shared Environments**: When running as a shared HTTP service, set a strong random `TOPOLOGY_API_KEY`. Header verification uses constant-time `crypto.timingSafeEqual` over SHA-256 digests.
3. **Never Commit `.env`**: Keep runtime secrets in environment variables or a secret manager; `.env` is excluded via `.gitignore`.

