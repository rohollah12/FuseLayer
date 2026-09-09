# DemoVault recovery verification

Synthetic verification fixture for the FuseLayer hackathon demo. It represents the post-fix checks for the withdrawal incident used by the sample flow.

## Fix applied

The withdrawal authorization path used by the reported exploit was replaced with the corrected authorization check. The change is limited to the WITHDRAWALS component; unrelated protocol functions were not changed.

## Post-fix checks

- Original unauthorized-withdrawal reproduction: **REJECTED**
- Repeated unauthorized withdrawal attempts (25 runs): **0 successful**
- Normal authorized withdrawal path: **PASSED**
- Unaffected protocol operations: **PASSED**
- Post-fix monitoring sample: **no recurrence of the reported withdrawal pattern**

The original incident was local to WITHDRAWALS. These checks support reducing containment by one step from ISOLATE to RESTRICT. They do not claim that all protection should be removed in a single recovery action.
