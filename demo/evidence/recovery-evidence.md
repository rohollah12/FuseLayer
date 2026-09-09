# DemoVault recovery evidence

This is synthetic evidence for the FuseLayer hackathon demo.

The withdrawal authorization issue described in incident 1 has been fixed.

Changes made:
- The affected withdrawal authorization branch was replaced.
- Withdrawals now require the expected authorization check before execution.
- The original unauthorized-withdrawal reproduction no longer succeeds.

Verification:
- Test: unauthorized withdrawal attempt
  Result: REJECTED

- Test: authorized withdrawal of 10 units
  Result: ALLOWED

- Test: original exploit reproduction
  Result: REJECTED

- Test: unrelated protocol functionality
  Result: AVAILABLE

The affected component was WITHDRAWALS and the incident was LOCAL. No other component required changes.

Based on these checks, the original withdrawal exploit condition is no longer reproducible and the protocol can safely move from ISOLATE to RESTRICT.
