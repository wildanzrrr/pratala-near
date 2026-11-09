This folder holds local configuration files for Pratala. Everything here except this
README is a SECRET and is listed in .gitignore (config/*). Never commit, push, zip
or share this folder. If anything leaks, revoke it:

- Google Cloud service-account JSON (pratala-near): Google Cloud Console >
  IAM & Admin > Service Accounts > pratala-near > Keys. The backend reads it
  through GCS_KEY_FILE in backend/.env.
- keys/<account>.json: one near-cli-rs credential file (account_id, public_key,
  private_key) per testnet account — the contract owner pratala.testnet, the demo
  actors, both contract accounts, and sponsor.pratala.testnet (the email-SSO gas
  sponsor; the backend reads it through SPONSOR_PRIVATE_KEY_FILE in backend/.env).
  scripts/ creates the script accounts automatically; on a fresh clone, copy this
  folder from your backup or the scripts will fail (no fallback source).
  The pre-migration copies in the macOS Keychain (service "near-testnet-<account>")
  are stale duplicates and can be deleted once the files exist.

After creating or migrating keys here, back this folder up somewhere private.
