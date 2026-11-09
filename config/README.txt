This folder holds local configuration files for Pratala. Everything here except this
README is a SECRET and is listed in .gitignore (config/*). Never commit, push, zip
or share this folder. If anything leaks, revoke it:

- Google Cloud service-account JSON (pratala-near): Google Cloud Console >
  IAM & Admin > Service Accounts > pratala-near > Keys. The backend reads it
  through GCS_KEY_FILE in backend/.env.
- sponsor-key.json: full-access key of sponsor.pratala.testnet (pays for NEAR
  Auth email-SSO accounts). The backend reads it through SPONSOR_PRIVATE_KEY_FILE
  in backend/.env. Revoke by removing the key from the account.
- keys/<account>.json: one near-cli-rs credential file (account_id, public_key,
  private_key) per testnet account used by scripts/02-05 — including the contract
  owner pratala.testnet. scripts/ creates them automatically; on a fresh clone,
  copy this folder from your backup or the scripts will fail (no fallback source).
  The pre-migration copies in the macOS Keychain (service "near-testnet-<account>")
  are stale duplicates and can be deleted once the files exist.

After creating or migrating keys here, back this folder up somewhere private.
