
def _address_hex(value):
    return "0x" + value.hex()


def _deploy(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    vault = direct_deploy("contracts/demo_vault.py", "0x" + direct_bob.hex())
    return vault


def test_only_owner_can_authorize_registration(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    vault = _deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    registration = vault.get_fuselayer_registration()
    assert registration["authorized_registrant"].lower() == _address_hex(direct_alice).lower()

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the vault owner can authorize registration"):
        vault.authorize_registration(_address_hex(direct_charlie))

    direct_vm.sender = direct_alice
    vault.authorize_registration(_address_hex(direct_charlie))
    registration = vault.get_fuselayer_registration()
    assert registration["authorized_registrant"].lower() == _address_hex(direct_charlie).lower()


def test_only_guardian_can_contain(direct_vm, direct_deploy, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    with direct_vm.expect_revert("Only FuseLayer guardian can change safety state"):
        vault.apply_containment(2, "WITHDRAWALS", "1")

    direct_vm.sender = direct_bob
    vault.apply_containment(2, "WITHDRAWALS", "1")
    state = vault.get_safety_state()
    assert state["level"] == 2
    assert state["action"] == "ISOLATE"
    assert state["component"] == "WITHDRAWALS"


def test_containment_cannot_be_lowered_without_recovery(direct_vm, direct_deploy, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    vault.apply_containment(2, "WITHDRAWALS", "1")
    with direct_vm.expect_revert("Use recovery to lower the safety level"):
        vault.apply_containment(1, "WITHDRAWALS", "2")


def test_recovery_lowers_level_and_restores_withdrawals(direct_vm, direct_deploy, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    vault.apply_containment(2, "WITHDRAWALS", "1")
    assert vault.can_withdraw(10) is False
    vault.apply_recovery(1, "r1")
    assert vault.get_safety_state()["level"] == 1
    assert vault.can_withdraw(10) is True
    assert vault.can_withdraw(500) is False
    vault.apply_recovery(0, "r2")
    assert vault.get_safety_state()["action"] == "NONE"
    assert vault.can_withdraw(500) is True


def test_full_halt_blocks_every_withdrawal(direct_vm, direct_deploy, direct_alice, direct_bob):
    vault = _deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    vault.apply_containment(3, "GENERAL", "1")
    assert vault.can_withdraw(1) is False
