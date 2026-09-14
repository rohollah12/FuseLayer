# Studio-dev 61997 compatibility

This folder contains the additional contracts used to verify FuseLayer on GenLayer Studio-dev / Consensus v0.6 (**chain 61997**).

These contracts are **compatibility-only**. They do not replace the original Agent Tank submission in the parent `contracts/` directory, and the current Vercel frontend remains connected to the original stable Studionet deployment (**chain 61999**).

## Files

- `fuse_layer61997.py` — FuseLayer compatibility contract for Studio-dev 61997
- `demo_vault61997.py` — matching DemoVault compatibility contract

The application-level workflow is unchanged:

```text
register target
→ verify target authorization
→ report incident
→ GenLayer consensus
→ deterministic containment
→ protected-contract enforcement
→ staged recovery
```

## End-to-end validation

The compatibility deployment was tested through the complete lifecycle on chain 61997:

```text
NONE
→ HIGH / WITHDRAWALS / LOCAL
→ ISOLATE
→ withdrawals blocked
→ recovery to RESTRICT
→ recovery to NONE
→ normal operation restored
```

The registration flow also remains unchanged: registration is initiated through FuseLayer, which verifies the DemoVault authorization before creating the protocol record.

## Deployed contracts

### FuseLayer

`0xE580645d7A807168B4f2e9a1aFEe402d51059EDB`

https://explorer-studio-dev.genlayer.com/address/0xE580645d7A807168B4f2e9a1aFEe402d51059EDB

### DemoVault

`0x2664Ed101A2Db4b6862B27f5bdF96D064Fac4F7B`

https://explorer-studio-dev.genlayer.com/address/0x2664Ed101A2Db4b6862B27f5bdF96D064Fac4F7B

## Scope

The files in this folder contain the runtime/API compatibility changes required by the Studio-dev environment while preserving FuseLayer's original application-level workflow and containment policy.

The stable Agent Tank implementation remains:

- `../fuse_layer.py`
- `../demo_vault.py`

The web frontend is intentionally unchanged and continues to use the original stable Studionet deployment.
