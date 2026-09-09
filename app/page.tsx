'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

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

  const contractAddress = process.env.NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS ?? '';
  const evidence = useMemo(
    () => evidenceText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3),
    [evidenceText],
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
      const { client, account } = await liveClient();
      let beforeCounts: { protocols?: number | bigint | string };
      try {
        beforeCounts = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_counts',
          args: [],
        })) as { protocols?: number | bigint | string };
      } catch (error) {
        throw new Error(`Cannot read the configured FuseLayer contract on Studionet. Check the deployed address and network. ${errorMessage(error, '')}`.trim());
      }

      const before = countValue(beforeCounts.protocols);
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'register_protocol',
        args: [cleanName, cleanTarget, profile],
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
      })) as { protocols?: number | bigint | string };
      const after = countValue(afterCounts.protocols);

      let createdId = '';
      const scanEnd = after < before + 25n ? after : before + 25n;
      for (let id = before + 1n; id <= scanEnd; id += 1n) {
        const protocol = (await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_protocol',
          args: [id.toString()],
        })) as { owner?: string; name?: string; target_address?: string; profile?: string };

        if (
          protocol?.owner?.toLowerCase() === account.toLowerCase() &&
          protocol?.name === cleanName &&
          protocol?.target_address?.toLowerCase() === cleanTarget.toLowerCase() &&
          protocol?.profile === profile
        ) {
          createdId = id.toString();
          break;
        }
      }

      if (!createdId) {
        throw new Error(failedWriteMessage('Registration', tx, receipt));
      }

      setProtocolId(`Protocol ID ${createdId}`);
      setReportProtocolId(createdId);
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
      })) as { status?: string; action?: string; severity?: string; component?: string };

      if (!incident?.status || incident.status === 'PENDING') {
        throw new Error(failedWriteMessage('Incident evaluation', tx, receipt));
      }

      setReportMessage(
        `Incident ${latestIncidentId}: ${incident.status} · ${incident.severity ?? ''} · ${incident.component ?? ''} · action ${incident.action ?? ''}`
      );
    } catch (error) {
      setReportMessage(errorMessage(error, 'Incident evaluation failed'));
    } finally {
      setEvaluating(false);
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
            Submit evidence for a contract incident and choose how aggressively the protected contract should respond.
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
              <p>Register a target contract, then submit an incident against its protocol ID.</p>
            </div>
          </div>

          <div className="formsGrid">
            <form className="formCard" onSubmit={(e) => { e.preventDefault(); registerProtocol(); }}>
              <h3>Register contract</h3>

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
              <p className="help">
                The target must authorize this wallet first. For DemoVault, call authorize_registration(wallet) from the vault owner account in Studio.
              </p>

              <label htmlFor="live-profile">Response profile</label>
              <select id="live-profile" value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="BALANCED">Balanced</option>
                <option value="SAFETY_FIRST">Safety first</option>
                <option value="AVAILABILITY_FIRST">Availability first</option>
              </select>

              <button className="button buttonPrimary" type="submit" disabled={registering}>
                {registering ? 'Registering…' : 'Register'}
              </button>

              {protocolId && <div className="message success">{protocolId}</div>}
              {walletError && <div className="message error">{walletError}</div>}
            </form>

            <form className="formCard" onSubmit={(e) => { e.preventDefault(); reportIncident(); }}>
              <h3>Report incident</h3>

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

              {reportMessage && <div className="message info">{reportMessage}</div>}
            </form>
          </div>
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
