# AI evidence check

Pratala can ask a vision model on **NEAR AI Cloud** to look at an evidence photo before a verifier signs an attestation. The result is **advisory**: it helps a field agent, cooperative or warehouse notice problems, but only their signed on-chain attestation changes a lot's status.

## What is checked

`POST /api/ai/check { evidenceId, kind, expectedCrop?, plotLat?, plotLng? }` sends the stored photo (as a base64 data URL) and a prompt for the evidence kind:

| kind | The model is asked to |
| --- | --- |
| `PLOT` | confirm a real outdoor farm field (not a screenshot, render or screen photo); identify the crop and growth stage |
| `FIELD_VISIT` | check the scene fits the expected crop; growth stage; damage, flooding, pests or a fallow field that contradict the projection |
| `COOP_REVIEW` | judge whether the photo is plausible support for the expected crop; flag edited or unrelated images |
| `WEIGH_IN` | read the net kg and grade from the scale or ticket, only if clearly legible; check it is a plausible warehouse scene |

The prompt also includes the photo's EXIF GPS and capture time (read on upload with `exifr`) and the registered plot location, and asks for a finding if they are more than 2 km apart. The model must answer with JSON `{ verdict: pass|review|fail, confidence, findings[], extracted{crop, stage, kg, grade}, summary_en }` (one plain-English summary; the UI is English-only). The API parses it defensively: an unknown verdict becomes `review`, and output it cannot parse becomes `review` with confidence 0 and a "human must review" summary. The stored and returned check carries that summary as `summaryEn`.

## Model and privacy tier

| Setting | Value |
| --- | --- |
| Endpoint | `https://cloud-api.near.ai/v1` (OpenAI-compatible; `openai` SDK with `baseURL`) |
| Default model | `Qwen/Qwen3-VL-30B-A3B-Instruct` (`NEAR_AI_VISION_MODEL`) |
| Fallback model | `z-ai/glm-5.3-flash` (`NEAR_AI_FALLBACK_MODEL`), used when the first call fails |
| Tier | **Private (TEE)** for both |

The tier was checked on 2026-11-07 against the public catalog `GET https://cloud-api.near.ai/v1/model/list`: both models list `verifiable: true`, `attestationSupported: true`, `providerType: "vllm"` and accept image input. On NEAR AI Cloud, "private" models run inside Intel TDX confidential VMs with NVIDIA TEE GPUs, and TLS terminates inside the TEE. Third-party models on the same gateway (OpenAI, Anthropic, Google; `providerType: "external"`) are only "anonymised" and are **not** used. Each check stores its tier (`private-tee`, `anonymised` or `unknown`) next to the model id, so the web app's badge can show it.

Requests are sent with `x-no-aliasing: true` and the canonical model id, so the signature comes from the model's TEE (`signature_kind: "provider_tee"`) rather than from the gateway.

## What is stored and put on-chain

Each check is an `AiCheck` row:

- `model`, `tier`, `chatId` (the completion `id`);
- `responseText`: the exact completion body as received, plus the parsed JSON;
- `responseHash = sha256(responseText)`: the same response hash NEAR AI signs;
- `requestHash = sha256(JSON request body)` (it includes the image, so it binds the result to that photo);
- `signature`: from `GET /v1/signature/{chatId}?model=<id>&signing_algo=ecdsa`, retried a few times because the signature is cached on the TEE node that served the request. `signatureAvailable` says whether it was found; `GET /api/ai/check/:id` retries if it was not.

A verifier can pass `responseHash` as `ai_check_hash` in `attest_field` / `weigh_in`. The attestation then commits on-chain to that exact AI response.

## How to verify a signed response

1. **In the browser.** `verifyUrl` opens NEAR AI's Verification Center: `https://cloud.near.ai/verify?model=<model>#receipt=<base64url JSON>`. The receipt (`completionId, model, signatureKind, signingAlgo, signingAddress, signedText, signature`) travels in the URL fragment, which the browser never sends to a server. The page checks the model's hardware attestation and the signature.
2. **By hand.**
   - `signature.text` is `<model>:<request_hash>:<response_hash>` (provider TEE) or `<request_hash>:<response_hash>` (gateway). Its last part must equal `responseHash`, and on-chain `ai_check_hash` must equal it too.
   - Recover the signer of `text` from `signature` with an Ethereum-style ECDSA check (for example `ethers.verifyMessage(text, signature)`) and compare it, case-insensitively, with `signing_address`.
   - Confirm `signing_address` belongs to a genuine TEE: fetch `GET https://cloud-api.near.ai/v1/attestation/report?model=<model>&signing_algo=ecdsa` (API key required, free) and verify its NVIDIA and Intel TDX evidence as described in the `near-ai-cloud` skill (`backend/.claude/skills/near-ai-cloud/references/model-verification.md`) or with `github.com/nearai/nearai-cloud-verifier`.

## Advisory, not authoritative

- A `pass` does not verify a lot. Only allowlisted human verifiers move a lot forward on-chain, and they can disagree with the model.
- Vision models misread scales, confuse crops at early stages and can be fooled by a well-made fake. Treat `confidence` as the model's own estimate, not a measured probability.
- The check never blocks a flow. If `NEAR_AI_API_KEY` is empty, `POST /api/ai/check` returns `503 {"error":"ai_unavailable"}` at once, `/api/health` shows `ai.configured: false`, and the web app can show "AI check unavailable".

## Privacy notes

- Photos go only to NEAR AI Cloud private-TEE models. NEAR states that prompts and images in those models are not visible to infrastructure providers, model providers or NEAR. Pratala does not send evidence to any other AI provider.
- The photo is stored in Pratala's own evidence store (local disk or S3/MinIO), addressed by its sha256. Anyone who knows the hash can download it from `GET /api/evidence/<sha256>`, because attestations link to it. Do not upload photos with faces or documents that are not needed.
- EXIF GPS from the photo is kept to compare it with the plot. Exact plot coordinates are returned only to the plot's owner; other viewers get them rounded to about 1 km.
- Only signed-in users can start a check (rate-limited to 10 per minute). A check on evidence that is not attached to a lot is allowed only for the person who uploaded it.
