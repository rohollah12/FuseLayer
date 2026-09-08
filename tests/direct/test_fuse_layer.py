import json


TARGET = "0x1111111111111111111111111111111111111111"
URLS = json.dumps(["https://example.com/incident"])
CLAIM = "Unauthorized withdrawals are currently possible through the vault withdrawal authorization path."


def _analysis(status="CONFIRMED", active=True, severity="HIGH", component="WITHDRAWALS", breadth="LOCAL", summary="Evidence supports an active withdrawal incident."):
    return json.dumps(
        {
            "status": status,
            "active": active,
            "severity": severity,
            "component": component,
            "breadth": breadth,
            "summary": summary,
        }
    )


def _mock_incident(vm, response):
    vm.clear_mocks()
    vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Active exploit evidence"})
    vm.mock_llm(r".*FuseLayer.*", response)


def _deploy(direct_vm, direct_deploy, direct_alice, profile="BALANCED"):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    protocol_id = contract.register_protocol("Demo lending vault", TARGET, profile)
    return contract, protocol_id


def test_register_protocol_is_minimal(direct_vm, direct_deploy, direct_alice):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    protocol = contract.get_protocol(protocol_id)
    assert protocol["name"] == "Demo lending vault"
    assert protocol["profile"] == "BALANCED"
    assert protocol["safety_level"] == 0
    assert protocol["safety_action"] == "NONE"


def test_invalid_profile_and_address_revert(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Unknown safety profile"):
        contract.register_protocol("Demo vault", TARGET, "UNKNOWN")
    with direct_vm.expect_revert("Target address is invalid"):
        contract.register_protocol("Demo vault", "not-an-address", "BALANCED")


def test_anyone_can_report_incident(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    incident_id = contract.report_incident(protocol_id, CLAIM, URLS)
    incident = contract.get_incident(incident_id)
    assert incident["status"] == "PENDING"
    assert incident["input_retained"] is True
    assert len(incident["claim_hash"]) == 64
    assert len(incident["evidence_hash"]) == 64


def test_private_and_duplicate_evidence_urls_are_rejected(direct_vm, direct_deploy, direct_alice):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    with direct_vm.expect_revert("Local/private evidence URLs are not allowed"):
        contract.report_incident(protocol_id, CLAIM, json.dumps(["http://127.0.0.1/report"]))
    with direct_vm.expect_revert("Duplicate evidence URLs are not allowed"):
        contract.report_incident(
            protocol_id,
            CLAIM,
            json.dumps(["https://example.com/a", "https://example.com/a"]),
        )


def test_balanced_profile_isolates_high_local_incident(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(direct_vm, _analysis())
    result = json.loads(contract.preview_incident("BALANCED", CLAIM, URLS))
    assert result["status"] == "CONFIRMED"
    assert result["action_level"] == 2
    assert result["action"] == "ISOLATE"
    assert result["component"] == "WITHDRAWALS"


def test_protocol_wide_critical_incident_halts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(
        direct_vm,
        _analysis(severity="CRITICAL", component="GENERAL", breadth="PROTOCOL_WIDE"),
    )
    result = json.loads(contract.preview_incident("BALANCED", CLAIM, URLS))
    assert result["action_level"] == 3
    assert result["action"] == "HALT"


def test_availability_first_avoids_medium_interruption(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(direct_vm, _analysis(severity="MEDIUM"))
    result = json.loads(contract.preview_incident("AVAILABILITY_FIRST", CLAIM, URLS))
    assert result["action_level"] == 0
    assert result["action"] == "NONE"


def test_unconfirmed_incident_never_triggers_action(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(
        direct_vm,
        _analysis(status="UNCONFIRMED", active=False, severity="HIGH"),
    )
    result = json.loads(contract.preview_incident("SAFETY_FIRST", CLAIM, URLS))
    assert result["action_level"] == 0
    assert result["active"] is False


def test_incident_input_is_compacted_after_no_action_evaluation(direct_vm, direct_deploy, direct_alice):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    incident_id = contract.report_incident(protocol_id, CLAIM, URLS)
    _mock_incident(
        direct_vm,
        _analysis(status="UNCONFIRMED", active=False, severity="LOW"),
    )
    result = json.loads(contract.evaluate_incident(incident_id))
    incident = contract.get_incident(incident_id)
    assert result["stored_status"] == "NO_ACTION"
    assert incident["input_retained"] is False
    assert incident["status"] == "NO_ACTION"


def test_incident_cannot_be_evaluated_twice(direct_vm, direct_deploy, direct_alice):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    incident_id = contract.report_incident(protocol_id, CLAIM, URLS)
    _mock_incident(
        direct_vm,
        _analysis(status="UNCONFIRMED", active=False, severity="LOW"),
    )
    contract.evaluate_incident(incident_id)
    with direct_vm.expect_revert("Incident has already been evaluated"):
        contract.evaluate_incident(incident_id)


def test_invalid_llm_status_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(direct_vm, _analysis(status="MAYBE"))
    with direct_vm.expect_revert("Incident analyzer returned an invalid status"):
        contract.preview_incident("BALANCED", CLAIM, URLS)


def test_validator_accepts_same_incident_semantics(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(direct_vm, _analysis())
    contract.preview_incident("BALANCED", CLAIM, URLS)
    assert direct_vm.run_validator() is True


def test_validator_rejects_different_severity(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    _mock_incident(direct_vm, _analysis(severity="HIGH"))
    contract.preview_incident("BALANCED", CLAIM, URLS)

    _mock_incident(direct_vm, _analysis(severity="CRITICAL"))
    assert direct_vm.run_validator() is False


def test_missing_ids_are_rejected(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/fuse_layer.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Protocol not found"):
        contract.get_protocol("999")
    with direct_vm.expect_revert("Incident not found"):
        contract.get_incident("999")
    with direct_vm.expect_revert("Recovery not found"):
        contract.get_recovery("999")


def test_recovery_is_owner_only_and_tied_to_current_incident(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    incident_id = contract.report_incident(protocol_id, CLAIM, URLS)

    protocol = contract.protocols[protocol_id]
    protocol.safety_level = 2
    protocol.last_incident_id = incident_id
    contract.protocols[protocol_id] = protocol

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the protocol owner can request recovery"):
        contract.request_recovery(
            incident_id,
            "The vulnerable authorization branch has been replaced and regression-tested.",
            URLS,
        )

    direct_vm.sender = direct_alice
    recovery_id = contract.request_recovery(
        incident_id,
        "The vulnerable authorization branch has been replaced and regression-tested.",
        URLS,
    )
    assert contract.get_recovery(recovery_id)["status"] == "PENDING"


def test_recovery_cannot_use_an_older_incident(direct_vm, direct_deploy, direct_alice):
    contract, protocol_id = _deploy(direct_vm, direct_deploy, direct_alice)
    first = contract.report_incident(protocol_id, CLAIM, URLS)
    second = contract.report_incident(
        protocol_id,
        "A second active exploit report affects a different protocol surface and supersedes the earlier response.",
        URLS,
    )

    protocol = contract.protocols[protocol_id]
    protocol.safety_level = 2
    protocol.last_incident_id = second
    contract.protocols[protocol_id] = protocol

    with direct_vm.expect_revert("Recovery must reference the current containment incident"):
        contract.request_recovery(
            first,
            "The earlier withdrawal issue has been patched and tested against its original exploit path.",
            URLS,
        )
