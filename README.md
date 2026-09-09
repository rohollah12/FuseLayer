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

Recovery is owner-initiated. The protocol owner calls `request_recovery()` with the current incident, a short fix summary, and evidence URLs. Anyone can then call `evaluate_recovery()`: GenLayer checks whether the original issue was actually addressed and whether it is safe to restore service. If verified, FuseLayer calls the target contract and lowers containment by exactly one level: `HALT -> ISOLATE -> RESTRICT -> NONE`. A new verified recovery request is required for each further step.

## Reviewer quick start

You do not need to deploy anything just to see what FuseLayer does.

**Wallet note:** the live write flow is currently tested with MetaMask. Rabby is not supported in this build; in our testing it fails on a MetaMask-specific wallet RPC call (`wallet_getSnaps`). The **Try demo** preview does not require a wallet.

**Fastest check:** open the live site and click **Try demo**. It runs the incident preview without a wallet and without changing on-chain state.

**Live on-chain check:** use the deployed FuseLayer/DemoVault addresses and protocol ID included with the submission. Incident reporting and incident evaluation are public, so a reviewer can inspect or exercise that flow without registering a new target.

**Full reproduction:** if you want to verify the registration and guardian security from scratch, deploy the included `demo_vault.py` with FuseLayer as its guardian, call `authorize_registration(<your wallet>)` from the DemoVault owner account, then register that vault from the web app. This extra authorization step is intentional: FuseLayer must not be able to attach itself to an arbitrary contract without the target opting in.

```text
Quick preview
site -> Try demo

Live demo
use supplied FuseLayer + DemoVault + protocol ID
-> report / evaluate incident
-> inspect containment

Full reproduction
deploy FuseLayer
-> deploy DemoVault with FuseLayer as guardian
-> authorize registration wallet
-> register target
-> report / evaluate
```

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

**Live mode** needs a wallet. For this build, use MetaMask for live transactions. Registration is opt-in from the target contract: the target must expose FuseLayer registration authorization and authorize the wallet before `register_protocol` will accept it. A target can only be registered once.

The registration form uses:

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

`contracts/demo_vault.py` is only here to make the controller behavior visible in Studio and in tests. FuseLayer is set as its guardian. The vault owner can call `authorize_registration(address)` to choose the wallet that may register the vault with FuseLayer. `get_fuselayer_registration()` exposes that authorization for FuseLayer to verify.

This closes the duplicate/unauthorized registration path: another wallet cannot point a second FuseLayer protocol record at the vault, and a target that does not recognize the deployed FuseLayer as its guardian is rejected.

`apply_containment`, `apply_recovery`, and `can_withdraw` make the safety levels easy to verify.

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
- target registration must be authorized by the target contract
- a target contract can only be registered once
- the target must identify this FuseLayer deployment as its guardian
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

In short: deploy `fuse_layer.py`, deploy `demo_vault.py` with the FuseLayer address as guardian, authorize the wallet that will register the vault, register it once, then set the FuseLayer address in Vercel and deploy the Next.js app.

The preview uses the raw demo files from `rohollah12/FuseLayer`. If the repository name changes, update `REPO_RAW` in `app/page.tsx`.

## Commercial use

There is no payment flow in this build. For a production version, the intended model is a one-time activation fee when a contract is added for protection. A basic setup could be around $10 once; incident reporting can stay permissionless.

## License

MIT
