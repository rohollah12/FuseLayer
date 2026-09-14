# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl
from genlayer.types import *
import json


ACTION_NAMES = ["NONE", "RESTRICT", "ISOLATE", "HALT"]


class DemoVault(gl.contract.Contract):
    owner: Address
    guardian: Address
    authorized_registrant: Address
    safety_level: u256
    component: str
    last_reference: str

    def __init__(self, guardian_address: str):
        self.owner = gl.message.sender_address

        try:
            self.guardian = Address(guardian_address)
        except Exception:
            raise gl.vm.UserError("Guardian address is invalid")

        self.authorized_registrant = self.owner
        self.safety_level = u256(0)
        self.component = ""
        self.last_reference = ""

    @gl.public.write
    def authorize_registration(self, registrant_address: str) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(
                "Only the vault owner can authorize registration"
            )

        try:
            self.authorized_registrant = Address(registrant_address)
        except Exception:
            raise gl.vm.UserError("Registrant address is invalid")

    @gl.public.view
    def get_fuselayer_registration(self) -> str:
        return json.dumps(
            {
                "owner": self.owner.as_hex,
                "guardian": self.guardian.as_hex,
                "authorized_registrant": self.authorized_registrant.as_hex,
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.write
    def apply_containment(
        self,
        level: u256,
        component: str,
        incident_id: str,
    ) -> None:
        self._only_guardian()

        n = int(level)

        if n < 1 or n > 3:
            raise gl.vm.UserError(
                "Containment level must be between 1 and 3"
            )

        if n < int(self.safety_level):
            raise gl.vm.UserError(
                "Use recovery to lower the safety level"
            )

        self.safety_level = level
        self.component = component.strip().upper()[:40]
        self.last_reference = incident_id

    @gl.public.write
    def apply_recovery(
        self,
        level: u256,
        recovery_id: str,
    ) -> None:
        self._only_guardian()

        n = int(level)

        if n < 0 or n > 3:
            raise gl.vm.UserError("Recovery level is invalid")

        if n > int(self.safety_level):
            raise gl.vm.UserError(
                "Recovery cannot increase containment"
            )

        self.safety_level = level

        if n == 0:
            self.component = ""

        self.last_reference = recovery_id

    @gl.public.view
    def get_safety_state(self) -> str:
        return json.dumps(
            {
                "level": int(self.safety_level),
                "action": ACTION_NAMES[int(self.safety_level)],
                "component": self.component,
                "last_reference": self.last_reference,
                "guardian": self.guardian.as_hex,
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def can_withdraw(self, amount: u256) -> bool:
        level = int(self.safety_level)

        if level == 3:
            return False

        if level == 2 and self.component in [
            "WITHDRAWALS",
            "GENERAL",
        ]:
            return False

        if level == 1 and int(amount) > 100:
            return False

        return True

    def _only_guardian(self) -> None:
        if gl.message.sender_address != self.guardian:
            raise gl.vm.UserError(
                "Only FuseLayer guardian can change safety state"
            )
