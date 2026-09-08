# FuseLayer

FuseLayer is a GenLayer controller for incident containment. A protocol registers a target contract and picks a safety profile. If an incident is reported, GenLayer checks the public evidence and agrees on five things: whether the incident is confirmed, whether it is still active, its severity, the affected component, and whether the impact is local or protocol-wide.

FuseLayer does not let the model choose the action directly. The agreed result is passed through a fixed policy that returns one of these levels:

```text
0  NONE
1  RESTRICT
2  ISOLATE
3  HALT
```

The point is to avoid treating every incident as a reason to stop the whole protocol. A local withdrawal issue can isolate withdrawals, while a critical protocol-wide incident can still trigger a full halt.

Recovery is handled separately. Once a fix is submitted and verified, the contract lowers containment one level at a time instead of jumping straight back to normal operation.

## Repository

```text
app/                       Next.js frontend and preview API
contracts/fuse_layer.py    main controller
contracts/demo_vault.py    small contract used for the live demo
demo/evidence/             synthetic incident/recovery notes
tests/direct/              Direct Mode tests
.github/workflows/         lint, tests and frontend build
```

The hackathon version is free and has no payment code.

## Using it

There are two flows in the web app.

**Preview** does not need a wallet. It calls `preview_incident` through `simulateWriteContract` using the demo evidence in this repo.

**Live mode** needs a wallet. A protocol owner registers a target contract with:

- protocol name
- target contract address
- safety profile

An incident report only needs:

- protocol ID
- a short description
- one to three public evidence URLs

Anyone can report an incident. Only the protocol owner can request recovery.

## Safety profiles

`BALANCED` is the default. It isolates high-severity local incidents and uses a full halt for critical protocol-wide incidents.

`SAFETY_FIRST` escalates sooner when the evidence points to meaningful risk.

`AVAILABILITY_FIRST` keeps more of the protocol running unless stronger containment is justified.

The profile only changes the deterministic action mapping. It does not change the incident facts returned by consensus.

## Contracts

### FuseLayer

Main public methods:

```text
register_protocol(name, target_address, profile)
report_incident(protocol_id, claim, evidence_urls_json)
preview_incident(profile, claim, evidence_urls_json)
evaluate_incident(incident_id)
request_recovery(incident_id, fix_summary, evidence_urls_json)
evaluate_recovery(recovery_id)
get_protocol(protocol_id)
get_incident(incident_id)
get_recovery(recovery_id)
get_target_state(protocol_id)
get_counts()
```

Incident analysis returns:

```text
status      CONFIRMED / UNCONFIRMED / REJECTED
active      true / false
severity    LOW / MEDIUM / HIGH / CRITICAL
component   GENERAL / WITHDRAWALS / BORROWING / ORACLE / BRIDGE / OTHER
breadth     LOCAL / PROTOCOL_WIDE
summary     short explanation
```

Validators independently run the same analysis. The fields that affect containment must match.

After consensus, `_derive_action` maps the result and safety profile to `NONE`, `RESTRICT`, `ISOLATE`, or `HALT`. Messages to the protected contract are sent with `on="finalized"`.

If a new incident reaches the same safety level but affects another component, FuseLayer widens the protected surface instead of ignoring the second incident.

### DemoVault

`contracts/demo_vault.py` is only here to make the controller behavior visible in Studio and in tests. FuseLayer is set as its guardian. `apply_containment`, `apply_recovery`, and `can_withdraw` make the safety levels easy to verify.

## Storage

A pending incident keeps the submitted claim and evidence URLs because they are still needed for evaluation. Once evaluated, that input is cleared and the contract keeps a compact record with hashes and the final incident fields.

Recovery requests follow the same pattern.

## Input checks

- one to three evidence URLs
- `http` or `https` only
- localhost/private targets are rejected
- duplicate URLs are rejected
- expected contract failures use `gl.vm.UserError`
- unconfirmed incidents never trigger containment
- recovery can only lower the safety level one step
- stale recovery requests are rejected

## Checks

Python 3.12+ and Node.js 22+ are recommended.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

genvm-lint check contracts/fuse_layer.py
genvm-lint check contracts/demo_vault.py
pytest tests/direct/ -v
```

Frontend:

```bash
npm install
npm run build
```

GitHub Actions runs the same contract checks plus the frontend build on every push and pull request.

## Deployment

The full setup is in [`DEPLOYMENT.md`](DEPLOYMENT.md).

In short: deploy `fuse_layer.py`, deploy `demo_vault.py` with the FuseLayer address as guardian, register the DemoVault, then set the FuseLayer address in Vercel and deploy the Next.js app.

The preview uses the raw demo files from `rohollah12/FuseLayer`. If the repository name changes, update `REPO_RAW` in `app/page.tsx`.

## Commercial use

There is no payment flow in this build. For a production version, the intended model is a one-time activation fee when a contract is added for protection. A basic setup could be around $10 once; incident reporting can stay permissionless.

## License

MIT
