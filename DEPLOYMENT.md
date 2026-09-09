# Deployment

This is the full reproduction path. A reader does not need to go through all of it just to understand the project.

## Reviewer paths

There are three useful ways to check FuseLayer. For live wallet transactions, use MetaMask in this build. Rabby currently fails on a MetaMask-specific wallet RPC call (`wallet_getSnaps`). The preview path below does not require any wallet.

**1. Preview only**

Open the deployed web app and click **Run sample**. No wallet, registration, or deployment is required. This shows the incident classification and containment decision without writing state.

**2. Check the deployed demo**

Use the FuseLayer address, DemoVault address, and protocol ID supplied with the submission. The reviewer can inspect the registered protocol and target state directly. Incident reporting and evaluation are public, so a fresh incident can also be submitted if the demo state is suitable for it.

**3. Reproduce everything from scratch**

Follow the steps below. The included `demo_vault.py` is the test target; there is no need to write a new contract. The only extra security step is authorizing the wallet that will register the vault.

---

## 1. Push the repo

Create a public GitHub repository named `FuseLayer` and push the contents of this folder to it.

```bash
git init
git add -A
git commit -m "Initial FuseLayer implementation"
git branch -M main
git remote add origin https://github.com/rohollah12/FuseLayer.git
git push -u origin main
```

Open **Actions** in GitHub and make sure these three jobs are green:

```text
lint-contracts
direct-tests
frontend-build
```

If one of them fails, fix that before deploying.

## 2. Optional local checks

The Intelligent Contracts are Python contracts, so there is no separate Solidity-style compile step. Run the linter and Direct Mode tests instead.

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Then:

```bash
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

## 3. Deploy FuseLayer in Studio

Open `https://studio.genlayer.com`.

Add `contracts/fuse_layer.py` from file and deploy it. The constructor has no arguments.

Copy the deployed address and keep it as:

```text
FUSELAYER_ADDRESS
```

## 4. Deploy DemoVault

Add `contracts/demo_vault.py` in Studio.

Its constructor asks for `guardian_address`. Use the FuseLayer address from the previous step.

After deployment, keep this address as:

```text
DEMOVAULT_ADDRESS
```

## 5. Authorize the registering wallet

Do this before registration. Open the deployed DemoVault in Studio and use the account that deployed the vault.

Call:

```text
authorize_registration
```

Set `registrant_address` to the MetaMask address you will use on the FuseLayer site. The current live flow is tested with MetaMask; use the wallet-free **Run sample** path if you do not want to connect a wallet.

Then check:

```text
get_fuselayer_registration()
```

It should show:

```text
guardian: <FUSELAYER_ADDRESS>
authorized_registrant: <YOUR_BROWSER_WALLET_ADDRESS>
```

Only the vault owner can change this authorization.

## 6. Register DemoVault

You can register from the web app with the authorized wallet, or from Studio if the active Studio account is the authorized address. Use:

```text
name: FuseLayer DemoVault
target_address: <DEMOVAULT_ADDRESS>
profile: BALANCED
```

On a fresh FuseLayer deployment this will normally return protocol ID `1`.

Check it with:

```text
get_protocol("1")
```

The initial safety state should be level `0` / `NONE`.

A second registration of the same DemoVault should fail with `Target contract is already registered`. A wallet that was not authorized by DemoVault should fail with `Wallet is not authorized by the target contract`.

## 7. Test an incident in Studio

First make sure these two files are publicly reachable from GitHub:

```text
https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence/active-incident.md
https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence/monitoring-snapshot.md
```

Call `report_incident`:

```text
protocol_id: 1
claim: The FuseLayer DemoVault withdrawal module is currently exploitable and unauthorized withdrawals can still be triggered.
```

Evidence JSON:

```json
["https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence/active-incident.md","https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence/monitoring-snapshot.md"]
```

Use the returned incident ID with `evaluate_incident`.

For the supplied demo evidence, the expected result is a confirmed, active, high-severity local withdrawal incident. With the `BALANCED` profile that maps to `ISOLATE`.

The exact summary text can vary because it is generated through consensus. The structured fields are what matter.

## 8. Check that DemoVault changed

Wait for the FuseLayer transaction and finalized child message to complete.

On DemoVault call:

```text
get_safety_state()
```

The demo case should show approximately:

```text
level: 2
action: ISOLATE
component: WITHDRAWALS
```

Then call:

```text
can_withdraw(10)
```

It should return `false` while withdrawals are isolated.

## 9. Deploy the frontend on Vercel

Import the GitHub repository into Vercel.

Use:

```text
Framework: Next.js
Root Directory: ./
```

Add these environment variables:

```text
NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS=<FUSELAYER_ADDRESS>
FUSELAYER_CONTRACT_ADDRESS=<FUSELAYER_ADDRESS>
```

Both variables point to FuseLayer, not DemoVault.

Deploy the project.

## 10. Check the preview

Open the Vercel site and click **Run sample**.

This path does not need a wallet and does not write state. The expected action for the included demo is `ISOLATE`.

If the preview cannot load evidence, check that the GitHub repo is public and that `REPO_RAW` in `app/page.tsx` points to the correct repository.

## 11. Check the live wallet flow

Connect the same browser wallet that DemoVault authorized in step 5.

If you already registered DemoVault in step 6, **do not register it again**. Enter the existing protocol ID in the incident form, submit an incident, and evaluate it from the same page.

If you intentionally skipped registration in step 6, register DemoVault once from the web app with:

```text
Protocol name: My protocol
Protected contract: <DEMOVAULT_ADDRESS>
Safety profile: Balanced
```

Then use the returned protocol ID for the incident flow.

## 12. Recovery test (optional)

After an incident is contained, call `request_recovery` on FuseLayer with the current incident ID, a short fix description, and:

```text
https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence/recovery-evidence.md
```

Then call `evaluate_recovery` with the returned recovery ID.

A verified recovery only drops the safety level by one step. For example:

```text
ISOLATE -> RESTRICT
```

A second verified recovery can continue toward `NONE`.


The hackathon build is free. There is no checkout or payment setup to configure.
