# Submission checklist

These are the NEAR HACKATHON submission rules (from `https://nearhackathon.com/HACKATHON.md`), turned into checks for this repo. The deadline is **2026-11-14 23:59 UTC**, and the PLAN targets 18:00 UTC to leave a buffer. Only **one submission** is allowed per project. Corrections go through the request-changes page, never a second submission.

> **The submission POST is never sent by an agent on its own.** Print the full JSON payload (section 4), show it to the human, and send it only after they confirm. The same applies to making the repo public, pushing tags, and posting on X.

## 1. Before submitting

### Repository
- [ ] The repo is **public** on GitHub, stays public through judging, and the URL loads while logged out.
- [ ] `LICENSE` (MIT) is at the root.
- [ ] `README.md` follows PLAN §10 and is written for an AI judge. Every step is "do X → see Y" with the expected output. A fresh `claude -p "follow README.md"` on a clean clone gets to the expected results.
- [ ] `deploy/testnet.json` is committed with the real contract ids, demo accounts and seed tx hashes. `scripts/05-verify-demo.sh` → `all checks passed` on the day of submission.
- [ ] `docs/DISCLOSURE.md` is complete: the "Update before submission" library section is filled from the final lockfiles; prototype, AI use, templates and Unsplash credit are listed; "Other projects" is answered.
- [ ] CI is green on `main` (contracts, backend, frontend, scripts).
- [ ] The `hackathon-submission` tag is pushed. The judged window is the history from the first commit `58938a3`.

### No secrets in history
Run from the repo root. Each command should print nothing, apart from `.env.example` files that hold only empty placeholders.

```sh
# 1. gitleaks over the full history (brew install gitleaks); v8.19+ syntax, then the older one
gitleaks git --redact -v . || gitleaks detect --source . --log-opts="--all" --redact -v

# 2. NEAR private keys (ed25519 secret keys are ~88 base58 chars; public keys are ~44), seed phrases, PEM keys
SKIP=(-- . ':(exclude)**/.claude/skills/**' ':(exclude)**/.agents/skills/**')   # vendored skill docs contain example DSNs
git log -p --all "${SKIP[@]}" | grep -nE 'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}|"private_key"|secret_key|seed_phrase|BEGIN [A-Z ]*PRIVATE KEY' | grep -v 'from_secret_key('

# 3. Non-empty API keys / secrets in any committed env-style line
git log -p --all "${SKIP[@]}" | grep -nE '^\+.*(NEAR_AI_API_KEY|NEAR_INTENTS_API_KEY|JWT_SECRET|DATABASE_URL|S3_SECRET[A-Z_]*)=[^[:space:]]+' | grep -vE 'ci-only-not-a-secret|change-me|pratala:pratala@localhost'

# 4. Files that should never have been added
git log --all --diff-filter=A --name-only --format= | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|near-credentials|neardev/' | grep -v '\.env\.example$'
```

Known, deliberate placeholders are filtered out above: the CI values (`ci-only-not-a-secret…`, `pratala:pratala@localhost`), the dev default `JWT_SECRET=change-me-dev-only…`, `near_api::Signer::from_secret_key(` in sandbox tests (keys generated at test time), and example DSNs in the vendored skill docs. Review every remaining hit by hand. If anything real shows up, **rotate the key first**, then rewrite history.

### Demo post on X (the human posts it)
- [ ] Says it was **built at NEAR HACKATHON**, tags **@NEARProtocol** and **#NEARHackathon**, and attaches the **video** (≤ 3:00, see [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md)). @NearLegion and @NearBuilders are optional.
- [ ] Leads with the user problem, shows one action → result moment, says concretely what NEAR does, and ends with a link and a question.
- [ ] The post URL is copied for `demoUrl`.

### Payout account
- [ ] A **mainnet** NEAR account owned by the team, created in a wallet by the human: a named `*.near` account or a 64-hex implicit account. Prizes are paid there. A testnet account is not valid.

### Hosted demo (optional, a plus)
- [ ] The Vercel URL works with the API offline (banner) and online. If possible, keep it up through 2026-11-25.

## 2. Tracks

| Track id | Name | Why | Condition |
| --- | --- | --- | --- |
| `realworld` | 08 Real-World Money | stablecoin escrow, pay link, paid/pending/refunded statuses with tx links, bookkeeper CSV | always |
| `nfts` | 10 NFTs That Do Something | the lot NFT holds escrow and the refund right; control passes on transfer; `claim_lock` blocks transfers mid-payout; per-NFT history | always |
| `open` | 13 Open Innovation | agriculture finance for smallholders, without middlemen | always |
| `privacy` | 03 Privacy & Private AI | AI evidence check on a **TEE-attested** NEAR AI Cloud model; only hashes on-chain | **only if** the model actually used is verified TEE-tier (see `docs/AI-VERIFICATION.md`) |

One submission covers all chosen tracks.

## 3. Draft for "What did you build?" (`idea`, 20–2000 characters)

The draft below is about 1,650 characters. The human edits and approves it, and it must not include numbers we cannot show on-chain.

```text
Pratala is a marketplace for Indonesian smallholder farmers, built on NEAR. A verified harvest projection becomes an NFT that holds stablecoin escrow. Today, a rice farmer often sells to a middleman at harvest, at the middleman's price, and borrows from the same person before harvest. Pratala lets a buyer pre-fund the harvest directly and pays the farmer as soon as it is weighed.

How it works: the farmer registers a projection from a phone (crop, region, kilos, harvest month), which mints a NEP-171 NFT. A field agent attests the plot visit, the cooperative reviews it, and the farmer lists it with a price per kilo and gets a pay link. A buyer funds it with one pUSDC ft_transfer_call. The NEP-141 transfer lands in the lot contract's escrow, and the NFT moves to the buyer in the same transaction. At the warehouse, the weigh-in sets the delivered weight. The contract computes the farmer's payout, a 2% platform fee, and a refund for any shortfall, which belongs to whoever holds the NFT when it is claimed. Example on testnet: 1,000 kg at 0.45 pUSDC = 450 escrow; 900 kg delivered gives the farmer 396.90, the fee 8.10 and the NFT holder 45.00.

NEAR pieces: NEP-171/177/181 NFT + NEP-141 escrow in Rust (near-sdk 5.30.1), NEP-297 events indexed into a payments ledger with CSV export, NEAR Connect wallets (HOT, Meteor), function-call keys so verifiers sign without popups, NEP-413 login, an advisory AI photo check on NEAR AI Cloud with its response hash stored on-chain, and NEAR Intents 1Click quotes for cross-chain checkout (mainnet dry quotes; Intents has no testnet).

Testnet only; pUSDC is a test token and verifiers are allowlisted.
```

Run the length check before pasting:

```sh
awk '/^```text$/{f=1;next} /^```$/{if(f){exit}} f' docs/SUBMISSION.md | wc -c   # must be 20–2000
```

## 4. Submission payload (printed, confirmed, then sent once)

`POST https://nearhackathon.com/api/applications` with a JSON body of at most 12,000 bytes. Send **only** these fields, never `website`: it is a spam trap that rejects the submission. Every `<…>` value must come from the human. Agents do not invent names, emails, sizes, wallets or consent.

```json
{
  "requestId": "<uuid generated once (uuidgen | tr A-Z a-z) and reused on every retry>",
  "projectName": "Pratala",
  "leadName": "<human: 2–80 chars>",
  "email": "<human: ≤160 chars; max 2 submissions per email>",
  "size": "<human: one of \"1\", \"2 - 4\", \"4 - 6\", \"6 - 8\", \"8+\">",
  "tracks": ["realworld", "nfts", "open"],
  "nearAddress": "<human: mainnet account, lowercase, 2–64 chars>",
  "projectUrl": "<public GitHub repo URL, ≤300 chars>",
  "demoUrl": "<X post URL, ≤300 chars>",
  "idea": "<section 3 text after the human's edits, 20–2000 chars>",
  "consent": "<true — only after the human has read the contact notice and agreed>"
}
```

Procedure:

1. Write the final JSON to a local file outside the repo (it contains an email), e.g. `/tmp/pratala-submission.json`. Validate it with `jq -e '.consent == true and (.idea | length) >= 20 and (.idea | length) <= 2000' /tmp/pratala-submission.json`.
2. Print it with `jq . /tmp/pratala-submission.json` and **show the whole payload to the human**. Read the contact/consent notice to them verbatim. Get an explicit "send it".
3. Send it once with `curl -sS -X POST https://nearhackathon.com/api/applications -H 'Content-Type: application/json' --data @/tmp/pratala-submission.json -w '\nHTTP %{http_code}\n'`.
4. Handle the response:
   - `201`: saved. Record the date in the README, then tag `hackathon-submission`.
   - `400`: fix the listed fields, resend with the **same** `requestId`.
   - `403`: closed or cross-site. Do not retry.
   - `409`: the repo was already submitted or the email is at its limit. Ask the human. Do not change the link or the email to get around it.
   - `413`: shorten `idea`.
   - `503`: wait a minute, resend with the same `requestId`.

## 5. After submitting

- Never submit again. To change anything, the human uses **https://nearhackathon.com/request-changes**: original email, NEAR account and repo link, tick the fields to change, give the new values, add a Discord or Telegram handle. Organisers review these by hand.
- Keep the repo public and the testnet contracts untouched through judging (2026-11-16 to 2026-11-18). Re-run `scripts/05-verify-demo.sh` on 2026-11-16.
