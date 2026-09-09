'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

type VaultSafetyState = {
  level: number;
  action: string;
  component: string;
  lastReference: string;
  guardian: string;
  canWithdraw10: boolean;
};

type IncidentResult = {
  profile?: string;
  status?: string;
  active?: boolean;
  severity?: string;
  component?: string;
  breadth?: string;
  accessible_sources?: number;
  summary?: string;
  action_level?: number;
  action?: string;
};

const REPO_RAW = 'https://raw.githubusercontent.com/rohollah12/FuseLayer/main/demo/evidence';
const DEMO_CLAIM =
  'The FuseLayer DemoVault withdrawal module is currently exploitable and unauthorized withdrawals can still be triggered.';
const DEMO_EVIDENCE = [
  `${REPO_RAW}/active-incident.md`,
  `${REPO_RAW}/monitoring-snapshot.md`,
];
const RECOVERY_EVIDENCE = `${REPO_RAW}/recovery-evidence.md`;
const DEFAULT_FIX_SUMMARY =
  'The withdrawal authorization issue has been patched. The original unauthorized withdrawal reproduction now fails, authorized withdrawals still work, and unrelated functionality remains available.';

const profileCopy: Record<string, string> = {
  BALANCED: 'Use a narrow response when possible. Reserve a full halt for critical protocol-wide incidents.',
  SAFETY_FIRST: 'Escalate sooner when the evidence points to meaningful risk.',
  AVAILABILITY_FIRST: 'Keep unaffected functions running unless stronger containment is needed.',
};

function countValue(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function failedWriteMessage(label: string, hash: string, receipt: unknown) {
  const tx = (receipt && typeof receipt === 'object' ? receipt : {}) as {
    statusName?: string;
    txExecutionResultName?: string;
  };
  const detail = [tx.statusName, tx.txExecutionResultName].filter(Boolean).join(' / ');
  return `${label} reached consensus without the expected contract state change${detail ? ` (${detail})` : ''}. Transaction: ${hash}`;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const STUDIONET_CHAIN_ID = '0xf22f';

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const value = error as {
      message?: unknown;
      shortMessage?: unknown;
      details?: unknown;
      code?: unknown;
    };
    for (const candidate of [value.shortMessage, value.message, value.details]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        const code = value.code !== undefined ? ` [code ${String(value.code)}]` : '';
        return `${candidate}${code}`;
      }
    }
    try {
      return JSON.stringify(error, (_, item) => typeof item === 'bigint' ? item.toString() : item);
    } catch {
      // fall through
    }
  }
  return fallback;
}

export default function Page() {
  const [profile, setProfile] = useState('BALANCED');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<IncidentResult | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [wallet, setWallet] = useState('');
  const [walletError, setWalletError] = useState('');
  const [protocolName, setProtocolName] = useState('My protocol');
  const [targetAddress, setTargetAddress] = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [registering, setRegistering] = useState(false);

  const [reportProtocolId, setReportProtocolId] = useState('');
  const [claim, setClaim] = useState(DEMO_CLAIM);
  const [evidenceText, setEvidenceText] = useState(DEMO_EVIDENCE.join('\n'));
  const [reporting, setReporting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [latestIncidentId, setLatestIncidentId] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  const [recoveryIncidentId, setRecoveryIncidentId] = useState('');
  const [fixSummary, setFixSummary] = useState(DEFAULT_FIX_SUMMARY);
  const [recoveryEvidenceText, setRecoveryEvidenceText] = useState(RECOVERY_EVIDENCE);
  const [requestingRecovery, setRequestingRecovery] = useState(false);
  const [evaluatingRecovery, setEvaluatingRecovery] = useState(false);
  const [latestRecoveryId, setLatestRecoveryId] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryResult, setRecoveryResult] = useState<{ status: string; targetLevel: number; targetAction: string; summary: string } | null>(null);

  const [vaultState, setVaultState] = useState<VaultSafetyState | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultStatusMessage, setVaultStatusMessage] = useState('');
  const [vaultPendingNote, setVaultPendingNote] = useState('');

  const contractAddress = process.env.NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS ?? '';
  const evidence = useMemo(
    () => evidenceText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3),
    [evidenceText],
  );
  const recoveryEvidence = useMemo(
    () => recoveryEvidenceText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3),
    [recoveryEvidenceText],
  );

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      if (!Array.isArray(accounts)) return;
      setWallet(typeof accounts[0] === 'string' ? accounts[0] : '');
    };

    provider.on('accountsChanged', handleAccountsChanged);
    return () => provider.removeListener?.('accountsChanged', handleAccountsChanged);
  }, []);

  async function runDemo() {
    setPreviewing(true);
    setPreviewError('');
    setPreview(null);
    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, claim: DEMO_CLAIM, evidence: DEMO_EVIDENCE }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Demo failed');
      setPreview(data.result ?? null);
    } catch (error) {
      setPreviewError(errorMessage(error, 'Demo failed'));
    } finally {
      setPreviewing(false);
    }
  }

  async function connectWallet() {
    setWalletError('');
    if (!window.ethereum) {
      setWalletError('A browser wallet such as MetaMask is required for live writes.');
      return '';
    }
    try {
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts?.[0] ?? '';
      if (!address) throw new Error('No wallet account returned');
      setWallet(address);
      return address;
    } catch (error) {
      setWalletError(errorMessage(error, 'Wallet connection failed'));
      return '';
    }
  }

  async function disconnectWallet() {
    setWallet('');
    setWalletError('');
    try {
      await window.ethereum?.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Some injected wallets do not implement permission revocation.
    }
  }

  async function liveClient(address?: string) {
    const account = address || wallet || (await connectWallet());
    if (!account) throw new Error('Connect a wallet first');
    if (!window.ethereum) throw new Error('Browser wallet is unavailable');
    const client = createClient({
      chain: studionet,
      account: account as `0x${string}`,
      provider: window.ethereum as never,
    });
    await client.connect('studionet');
    const chainId = String(await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase();
    if (chainId !== STUDIONET_CHAIN_ID) {
      throw new Error(`Wallet is on chain ${chainId}; FuseLayer is using Studionet (${STUDIONET_CHAIN_ID}).`);
    }
    return { client, account };
  }

  function publicClient() {
    return createClient({ chain: studionet });
  }

  async function findProtocolByTarget(client: ReturnType<typeof createClient>, target: string, total: bigint) {
    for (let id = 1n; id <= total; id += 1n) {
      try {
        const protocol = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_protocol',
          args: [id.toString()],
        })) as { id?: string; target_address?: string; owner?: string; name?: string; profile?: string };
        if (protocol?.target_address?.toLowerCase() === target.toLowerCase()) return protocol;
      } catch {
        // Protocol ids are sequential, but ignore a stale read and keep scanning.
      }
    }
    return null;
  }

  async function refreshVaultState(addressOverride?: string) {
    setVaultLoading(true);
    setVaultStatusMessage('');
    try {
      const client = publicClient();
      let address = (addressOverride ?? targetAddress).trim();

      if (!ADDRESS_RE.test(address) && contractAddress && reportProtocolId.trim()) {
        const protocol = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_protocol',
          args: [reportProtocolId.trim()],
        })) as { target_address?: string };
        if (typeof protocol?.target_address === 'string' && ADDRESS_RE.test(protocol.target_address)) {
          address = protocol.target_address;
          setTargetAddress(address);
        }
      }

      if (!ADDRESS_RE.test(address)) {
        throw new Error('Enter a DemoVault address in step 1, or enter a valid Protocol ID in step 2 so the target can be resolved.');
      }

      const rawState = (await client.readContract({
        address: address as `0x${string}`,
        functionName: 'get_safety_state',
        args: [],
      })) as {
        level?: number | string | bigint;
        action?: string;
        component?: string;
        last_reference?: string;
        guardian?: string;
      };
      const canWithdraw10 = (await client.readContract({
        address: address as `0x${string}`,
        functionName: 'can_withdraw',
        args: [BigInt(10)],
      })) as boolean;

      setVaultState({
        level: Number(rawState.level ?? 0),
        action: rawState.action ?? 'NONE',
        component: rawState.component || '—',
        lastReference: rawState.last_reference || '—',
        guardian: rawState.guardian ?? '—',
        canWithdraw10: Boolean(canWithdraw10),
      });
      setVaultStatusMessage(`Live state read from ${address.slice(0, 6)}…${address.slice(-4)}.`);
    } catch (error) {
      setVaultStatusMessage(errorMessage(error, 'Could not read DemoVault state'));
    } finally {
      setVaultLoading(false);
    }
  }

  async function registerProtocol() {
    const cleanName = protocolName.trim();
    const cleanTarget = targetAddress.trim();
    if (!contractAddress) {
      setWalletError('NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS is not configured.');
      return;
    }
    if (!ADDRESS_RE.test(contractAddress)) {
      setWalletError('The configured FuseLayer address is not a valid 0x address. Check the Vercel environment variable.');
      return;
    }
    if (cleanName.length < 3) {
      setWalletError('Protocol name must be at least 3 characters.');
      return;
    }
    if (!ADDRESS_RE.test(cleanTarget)) {
      setWalletError('Protected contract address must be a 0x address with 40 hexadecimal characters.');
      return;
    }

    setRegistering(true);
    setWalletError('');
    setProtocolId('');
    try {
      const { client: writeClient, account } = await liveClient();
      const readClient = publicClient();
      let beforeCounts: { protocols?: number | bigint | string };
      try {
        beforeCounts = (await readClient.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_counts',
          args: [],
        })) as { protocols?: number | bigint | string };
      } catch (error) {
        throw new Error(`Cannot read the configured FuseLayer contract on Studionet. Check the deployed address and network. ${errorMessage(error, '')}`.trim());
      }

      const before = countValue(beforeCounts.protocols);
      const existing = await findProtocolByTarget(readClient, cleanTarget, before);
      if (existing?.id) {
        setProtocolId(`Protocol ID ${existing.id} (already registered)`);
        setReportProtocolId(existing.id);
        setWalletError('This target is already registered. FuseLayer allows each protected contract to be registered only once. Reusing the existing Protocol ID instead.');
        setVaultPendingNote('');
        await refreshVaultState(cleanTarget);
        return;
      }

      const tx = await writeClient.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'register_protocol',
        args: [cleanName, cleanTarget, profile],
        value: BigInt(0),
      });
      const receipt = await writeClient.waitForTransactionReceipt({
        hash: tx,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });

      const receiptInfo = receipt as { txExecutionResultName?: string };
      if (receiptInfo.txExecutionResultName && receiptInfo.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
        throw new Error(`Registration was rejected by the contract (${receiptInfo.txExecutionResultName}). Check that this wallet is authorized by DemoVault, the DemoVault guardian is this FuseLayer address, and the target is not already registered. Transaction: ${tx}`);
      }

      let createdId = '';
      for (let attempt = 0; attempt < 12 && !createdId; attempt += 1) {
        const afterCounts = (await readClient.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_counts',
          args: [],
        })) as { protocols?: number | bigint | string };
        const after = countValue(afterCounts.protocols);
        const protocol = await findProtocolByTarget(readClient, cleanTarget, after);
        if (protocol?.id && protocol.owner?.toLowerCase() === account.toLowerCase()) {
          createdId = protocol.id;
          break;
        }
        if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      if (!createdId) {
        throw new Error(failedWriteMessage('Registration', tx, receipt));
      }

      setProtocolId(`Protocol ID ${createdId}`);
      setReportProtocolId(createdId);
      setVaultPendingNote('');
      await refreshVaultState(cleanTarget);
    } catch (error) {
      setWalletError(errorMessage(error, 'Registration failed'));
    } finally {
      setRegistering(false);
    }
  }

  async function reportIncident() {
    if (!contractAddress) {
      setReportMessage('Contract address is not configured.');
      return;
    }
    setReporting(true);
    setReportMessage('');
    try {
      const { client, account } = await liveClient();
      const beforeCounts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { incidents?: number | bigint | string };
      const before = countValue(beforeCounts.incidents);

      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'report_incident',
        args: [reportProtocolId.trim(), claim.trim(), JSON.stringify(evidence)],
        value: BigInt(0),
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: tx,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });

      const afterCounts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { incidents?: number | bigint | string };
      const after = countValue(afterCounts.incidents);

      let createdId = '';
      const scanEnd = after < before + 25n ? after : before + 25n;
      for (let id = before + 1n; id <= scanEnd; id += 1n) {
        const incident = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_incident',
          args: [id.toString()],
        })) as { protocol_id?: string; reporter?: string };
        if (
          incident?.protocol_id === reportProtocolId.trim() &&
          incident?.reporter?.toLowerCase() === account.toLowerCase()
        ) {
          createdId = id.toString();
          break;
        }
      }

      if (!createdId) {
        throw new Error(failedWriteMessage('Incident report', tx, receipt));
      }

      setLatestIncidentId(createdId);
      setReportMessage(`Incident ${createdId} submitted. It is ready for consensus evaluation.`);
    } catch (error) {
      setReportMessage(errorMessage(error, 'Incident report failed'));
    } finally {
      setReporting(false);
    }
  }

  async function evaluateLatestIncident() {
    if (!contractAddress || !latestIncidentId) return;
    setEvaluating(true);
    setReportMessage('');
    try {
      const { client } = await liveClient();
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'evaluate_incident',
        args: [latestIncidentId],
        value: BigInt(0),
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: tx,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });
      const incident = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_incident',
        args: [latestIncidentId],
      })) as { status?: string; action?: string; action_level?: number | string; severity?: string; component?: string };

      if (!incident?.status || incident.status === 'PENDING') {
        throw new Error(failedWriteMessage('Incident evaluation', tx, receipt));
      }

      setReportMessage(
        `Incident ${latestIncidentId}: ${incident.status} · ${incident.severity ?? ''} · ${incident.component ?? ''} · action ${incident.action ?? ''}`
      );
      const actionLevel = Number((incident as { action_level?: number | string }).action_level ?? 0);
      if (actionLevel > 0) {
        setRecoveryIncidentId(latestIncidentId);
        setVaultPendingNote(
          `FuseLayer scheduled ${incident.action ?? 'containment'} for DemoVault. The target message is applied after finalization, so the live state can lag behind the incident result for a short time.`
        );
      } else {
        setVaultPendingNote('No containment change was scheduled for this incident.');
      }
      await refreshVaultState();
    } catch (error) {
      setReportMessage(errorMessage(error, 'Incident evaluation failed'));
    } finally {
      setEvaluating(false);
    }
  }

  async function requestRecovery() {
    const cleanIncidentId = recoveryIncidentId.trim();
    const cleanFix = fixSummary.trim();
    if (!contractAddress) {
      setRecoveryMessage('Contract address is not configured.');
      return;
    }
    if (!cleanIncidentId) {
      setRecoveryMessage('Enter the incident ID that currently caused containment.');
      return;
    }
    if (cleanFix.length < 20) {
      setRecoveryMessage('Fix summary must be at least 20 characters.');
      return;
    }
    if (recoveryEvidence.length < 1) {
      setRecoveryMessage('Add at least one recovery evidence URL.');
      return;
    }

    setRequestingRecovery(true);
    setRecoveryMessage('');
    setLatestRecoveryId('');
    setRecoveryResult(null);
    try {
      const { client, account } = await liveClient();
      const beforeCounts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { recoveries?: number | bigint | string };
      const before = countValue(beforeCounts.recoveries);

      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'request_recovery',
        args: [cleanIncidentId, cleanFix, JSON.stringify(recoveryEvidence)],
        value: BigInt(0),
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: tx,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });

      const afterCounts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { recoveries?: number | bigint | string };
      const after = countValue(afterCounts.recoveries);

      let createdId = '';
      let createdRecovery: { status?: string; target_level?: number | string; target_action?: string } | null = null;
      const scanEnd = after < before + 25n ? after : before + 25n;
      for (let id = before + 1n; id <= scanEnd; id += 1n) {
        const recovery = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_recovery',
          args: [id.toString()],
        })) as {
          incident_id?: string;
          requester?: string;
          status?: string;
          target_level?: number | string;
          target_action?: string;
        };
        if (
          recovery?.incident_id === cleanIncidentId &&
          recovery?.requester?.toLowerCase() === account.toLowerCase()
        ) {
          createdId = id.toString();
          createdRecovery = recovery;
          break;
        }
      }

      if (!createdId) {
        throw new Error(failedWriteMessage('Recovery request', tx, receipt));
      }

      setLatestRecoveryId(createdId);
      setRecoveryMessage(
        `Recovery ${createdId} created with status ${createdRecovery?.status ?? 'PENDING'}. Anyone can now evaluate it.`
      );
    } catch (error) {
      setRecoveryMessage(errorMessage(error, 'Recovery request failed'));
    } finally {
      setRequestingRecovery(false);
    }
  }

  async function evaluateLatestRecovery() {
    if (!contractAddress || !latestRecoveryId) return;
    setEvaluatingRecovery(true);
    setRecoveryMessage('');
    setRecoveryResult(null);
    try {
      const { client } = await liveClient();
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'evaluate_recovery',
        args: [latestRecoveryId],
        value: BigInt(0),
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: tx,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });
      const recovery = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_recovery',
        args: [latestRecoveryId],
      })) as {
        status?: string;
        target_level?: number | string;
        target_action?: string;
        summary?: string;
      };

      if (!recovery?.status || recovery.status === 'PENDING') {
        throw new Error(failedWriteMessage('Recovery evaluation', tx, receipt));
      }

      const targetLevel = Number(recovery.target_level ?? 0);
      const targetAction = recovery.target_action ?? 'NONE';
      setRecoveryResult({
        status: recovery.status,
        targetLevel,
        targetAction,
        summary: recovery.summary ?? '',
      });
      setRecoveryMessage(
        `Recovery ${latestRecoveryId}: ${recovery.status} · target level ${targetLevel} (${targetAction})`
      );
      if (recovery.status === 'RESTORE_SCHEDULED') {
        setVaultPendingNote(
          `FuseLayer scheduled recovery to ${targetAction}. DemoVault applies that change after finalization; refresh the live state to confirm when it lands.`
        );
      } else {
        setVaultPendingNote(`Recovery ${latestRecoveryId} did not schedule a DemoVault state change.`);
      }
      await refreshVaultState();
    } catch (error) {
      setRecoveryMessage(errorMessage(error, 'Recovery evaluation failed'));
    } finally {
      setEvaluatingRecovery(false);
    }
  }

  return (
    <main className="site">
      <header className="topbar">
        <div>
          <strong>FuseLayer</strong>
          <span className="headerNote">incident containment for GenLayer contracts</span>
        </div>
        <div className="walletArea">
          {wallet ? (
            <>
              <span className="walletAddress">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
              <button className="button buttonSmall" type="button" onClick={disconnectWallet}>Disconnect</button>
            </>
          ) : (
            <button className="button buttonSmall" type="button" onClick={connectWallet}>Connect wallet</button>
          )}
        </div>
      </header>

      <div className="content">
        <section className="intro">
          <h1>FuseLayer</h1>
          <p>
            Register a contract with a response profile, then submit incident evidence.
            FuseLayer can restrict one area, isolate a component, or halt the whole target when necessary.
          </p>
        </section>

        <section className="section">
          <div className="sectionHeading">
            <div>
              <h2>Sample incident</h2>
              <p>Runs a preview only. No wallet transaction is sent.</p>
            </div>
            <button className="button" onClick={runDemo} disabled={previewing}>
              {previewing ? 'Running…' : 'Run sample'}
            </button>
          </div>

          <div className="demoGrid">
            <div className="plainBox">
              <label htmlFor="demo-profile">Response profile</label>
              <select id="demo-profile" value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="BALANCED">Balanced</option>
                <option value="SAFETY_FIRST">Safety first</option>
                <option value="AVAILABILITY_FIRST">Availability first</option>
              </select>
              <p className="help">{profileCopy[profile]}</p>

              <div className="sampleText">
                <span>Claim</span>
                <p>{DEMO_CLAIM}</p>
                <small>Evidence: 2 public demo files</small>
              </div>
            </div>

            <div className="plainBox resultBox">
              <h3>Preview result</h3>
              {!preview && !previewError && <p className="quiet">Run the sample to see the result here.</p>}
              {previewError && <div className="message error">{previewError}</div>}
              {preview && (
                <>
                  <dl className="resultList">
                    <ResultRow label="Status" value={preview.status ?? '—'} />
                    <ResultRow label="Severity" value={preview.severity ?? '—'} />
                    <ResultRow label="Component" value={preview.component ?? '—'} />
                    <ResultRow label="Scope" value={preview.breadth?.replaceAll('_', ' ') ?? '—'} />
                    <ResultRow label="Action" value={preview.action ?? 'NONE'} strong />
                  </dl>
                  {preview.summary && <p className="resultSummary">{preview.summary}</p>}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="section" id="protect">
          <div className="sectionHeading simple">
            <div>
              <h2>Live contract</h2>
              <p>Three on-chain steps: register protection, report/evaluate an incident, then request recovery when a fix is ready. Live writes are currently tested with MetaMask.</p>
            </div>
          </div>

          <div className="formsGrid">
            <form className="formCard" onSubmit={(e) => { e.preventDefault(); registerProtocol(); }}>
              <div className="stepTitle"><span>1</span><h3>Register contract</h3></div>
              <div className="stepInfo">
                <p><strong>Who:</strong> only a wallet explicitly authorized by the target contract. In DemoVault, the vault owner calls <code>authorize_registration(wallet)</code> first.</p>
                <p><strong>What happens:</strong> FuseLayer verifies the target recognizes this FuseLayer as guardian, verifies the wallet authorization, and rejects duplicate target registrations.</p>
                <p><strong>Output:</strong> a Protocol ID. The registering wallet becomes the FuseLayer protocol owner and is the only wallet allowed to request recovery later.</p>
              </div>

              <label htmlFor="protocol-name">Protocol name</label>
              <input
                id="protocol-name"
                value={protocolName}
                onChange={(e) => setProtocolName(e.target.value)}
                placeholder="My protocol"
              />

              <label htmlFor="target-address">Protected contract address</label>
              <input
                id="target-address"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />

              <label htmlFor="live-profile">Response profile</label>
              <select id="live-profile" value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="BALANCED">Balanced</option>
                <option value="SAFETY_FIRST">Safety first</option>
                <option value="AVAILABILITY_FIRST">Availability first</option>
              </select>
              <p className="help">{profileCopy[profile]}</p>

              <button className="button buttonPrimary" type="submit" disabled={registering}>
                {registering ? 'Registering…' : 'Register'}
              </button>

              {protocolId && <div className="message success"><strong>Registration output:</strong> {protocolId}</div>}
              {walletError && <div className="message error">{walletError}</div>}
            </form>

            <form className="formCard" onSubmit={(e) => { e.preventDefault(); reportIncident(); }}>
              <div className="stepTitle"><span>2</span><h3>Report and evaluate incident</h3></div>
              <div className="stepInfo">
                <p><strong>Who can report:</strong> anyone. A researcher, user, monitor, or protocol team can submit evidence.</p>
                <p><strong>Who can evaluate:</strong> anyone. Evaluation asks GenLayer validators to classify the incident, then FuseLayer deterministically maps that result to NONE, RESTRICT, ISOLATE, or HALT.</p>
                <p><strong>Output:</strong> reporting returns an Incident ID. Evaluation returns the stored status, severity, affected component, scope, and containment action. Target containment is sent after finalization.</p>
              </div>

              <label htmlFor="protocol-id">Protocol ID</label>
              <input
                id="protocol-id"
                value={reportProtocolId}
                onChange={(e) => setReportProtocolId(e.target.value)}
                placeholder="1"
              />

              <label htmlFor="incident-claim">What happened?</label>
              <textarea
                id="incident-claim"
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                rows={4}
              />

              <label htmlFor="evidence-urls">Evidence URLs <span className="optional">(1–3, one per line)</span></label>
              <textarea
                id="evidence-urls"
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={4}
                spellCheck={false}
              />

              <button className="button buttonPrimary" type="submit" disabled={reporting}>
                {reporting ? 'Submitting…' : 'Submit incident'}
              </button>

              {latestIncidentId && (
                <button
                  className="button"
                  type="button"
                  onClick={evaluateLatestIncident}
                  disabled={evaluating}
                >
                  {evaluating ? 'Evaluating…' : `Evaluate incident ${latestIncidentId}`}
                </button>
              )}

              {reportMessage && <div className="message info"><strong>Incident output:</strong> {reportMessage}</div>}
            </form>
          </div>

          <div className="vaultStateCard">
            <div className="vaultStateHeader">
              <div>
                <h3>DemoVault live state</h3>
                <p>This reads the protected contract itself, not FuseLayer's stored incident result.</p>
              </div>
              <button className="button buttonSmall" type="button" onClick={() => refreshVaultState()} disabled={vaultLoading}>
                {vaultLoading ? 'Refreshing…' : 'Refresh status'}
              </button>
            </div>

            {vaultPendingNote && <div className="message info vaultPending">{vaultPendingNote}</div>}
            {!vaultState && !vaultStatusMessage && (
              <p className="quiet">Register a DemoVault, or enter an existing Protocol ID, then refresh to read its current safety state.</p>
            )}
            {vaultStatusMessage && <p className="vaultReadNote">{vaultStatusMessage}</p>}
            {vaultState && (
              <dl className="vaultStateGrid">
                <ResultRow label="Level" value={String(vaultState.level)} />
                <ResultRow label="Action" value={vaultState.action} strong />
                <ResultRow label="Component" value={vaultState.component} />
                <ResultRow label="Last reference" value={vaultState.lastReference} />
                <ResultRow label="Withdraw 10" value={vaultState.canWithdraw10 ? 'ALLOWED' : 'BLOCKED'} strong={!vaultState.canWithdraw10} />
                <ResultRow label="Guardian" value={vaultState.guardian} />
              </dl>
            )}
          </div>

          <form className="formCard recoveryCard" onSubmit={(e) => { e.preventDefault(); requestRecovery(); }}>
            <div className="stepTitle"><span>3</span><h3>Request and evaluate recovery</h3></div>
            <div className="stepInfo stepInfoWide">
              <p><strong>Who can request:</strong> only the protocol owner from step 1. The protocol must currently be contained, and the request must reference the incident that caused the current containment.</p>
              <p><strong>Who can evaluate:</strong> anyone. GenLayer checks whether the original issue was actually addressed and whether it is safe to restore service.</p>
              <p><strong>Output:</strong> the request returns a Recovery ID. If verification succeeds, containment drops by exactly one level — HALT → ISOLATE → RESTRICT → NONE. Weak evidence can return NO_CHANGE instead.</p>
            </div>

            <div className="recoveryFields">
              <div>
                <label htmlFor="recovery-incident-id">Current containment incident ID</label>
                <input
                  id="recovery-incident-id"
                  value={recoveryIncidentId}
                  onChange={(e) => setRecoveryIncidentId(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div>
                <label htmlFor="fix-summary">What was fixed?</label>
                <textarea
                  id="fix-summary"
                  value={fixSummary}
                  onChange={(e) => setFixSummary(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <label htmlFor="recovery-evidence">Recovery evidence URLs <span className="optional">(1–3, one per line)</span></label>
                <textarea
                  id="recovery-evidence"
                  value={recoveryEvidenceText}
                  onChange={(e) => setRecoveryEvidenceText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                />
                <p className="help">Use concrete evidence where possible: test output, change/commit details, or independent proof that the original exploit no longer reproduces.</p>
              </div>
            </div>

            <div className="buttonRow">
              <button className="button buttonPrimary" type="submit" disabled={requestingRecovery}>
                {requestingRecovery ? 'Requesting…' : 'Request recovery'}
              </button>
              {latestRecoveryId && (
                <button
                  className="button"
                  type="button"
                  onClick={evaluateLatestRecovery}
                  disabled={evaluatingRecovery}
                >
                  {evaluatingRecovery ? 'Evaluating…' : `Evaluate recovery ${latestRecoveryId}`}
                </button>
              )}
            </div>

            {recoveryMessage && <div className="message info"><strong>Recovery output:</strong> {recoveryMessage}</div>}
            {recoveryResult && (
              <dl className="recoveryResult">
                <ResultRow label="Status" value={recoveryResult.status} />
                <ResultRow label="Target level" value={String(recoveryResult.targetLevel)} />
                <ResultRow label="Target action" value={recoveryResult.targetAction} strong />
                {recoveryResult.summary && <ResultRow label="Reason" value={recoveryResult.summary} />}
              </dl>
            )}
          </form>
        </section>

        <section className="section compactSection">
          <h2>Containment levels</h2>
          <table className="levelsTable">
            <tbody>
              <tr><th>RESTRICT</th><td>Limit risky operations while keeping the target online.</td></tr>
              <tr><th>ISOLATE</th><td>Disable the affected component.</td></tr>
              <tr><th>HALT</th><td>Stop the target when the incident affects the protocol broadly.</td></tr>
              <tr><th>RECOVER</th><td>Reduce containment after remediation evidence is accepted.</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <footer className="footer">FuseLayer · GenLayer hackathon build</footer>
    </main>
  );
}

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={strong ? 'resultStrong' : ''}>{value}</dd>
    </div>
  );
}
