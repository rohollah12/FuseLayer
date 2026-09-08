'use client';

import { useMemo, useState } from 'react';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

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

function requireSuccessfulExecution(receipt: unknown, label: string) {
  if (!receipt || typeof receipt !== 'object') {
    throw new Error(`${label} did not return a transaction receipt`);
  }
  const tx = receipt as { txExecutionResultName?: string };
  if (tx.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
    const detail = tx.txExecutionResultName ? ` (${tx.txExecutionResultName})` : '';
    throw new Error(`${label} did not succeed${detail}`);
  }
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
      setPreviewError(error instanceof Error ? error.message : 'Demo failed');
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
      setWalletError(error instanceof Error ? error.message : 'Wallet connection failed');
      return '';
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
    return client;
  }

  async function registerProtocol() {
    if (!contractAddress) {
      setWalletError('NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS is not configured.');
      return;
    }
    setRegistering(true);
    setWalletError('');
    try {
      const client = await liveClient();
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'register_protocol',
        args: [protocolName.trim(), targetAddress.trim(), profile],
      });
      const receipt = await client.waitForFinalization({ hash: tx });
      requireSuccessfulExecution(receipt, 'Registration transaction');
      const counts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { protocols?: number | bigint };
      const id = String(counts?.protocols ?? '');
      setProtocolId(id ? `Protocol ID ${id}` : 'Registered successfully');
      if (id) setReportProtocolId(id);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Registration failed');
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
      const client = await liveClient();
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'report_incident',
        args: [reportProtocolId.trim(), claim.trim(), JSON.stringify(evidence)],
      });
      const receipt = await client.waitForFinalization({ hash: tx });
      requireSuccessfulExecution(receipt, 'Incident report transaction');
      const counts = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_counts',
        args: [],
      })) as { incidents?: number | bigint };
      const id = String(counts?.incidents ?? '');
      setLatestIncidentId(id);
      setReportMessage(id ? `Incident ${id} submitted. It is ready for consensus evaluation.` : `Incident submitted. Transaction: ${tx}`);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Incident report failed');
    } finally {
      setReporting(false);
    }
  }

  async function evaluateLatestIncident() {
    if (!contractAddress || !latestIncidentId) return;
    setEvaluating(true);
    setReportMessage('');
    try {
      const client = await liveClient();
      const tx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'evaluate_incident',
        args: [latestIncidentId],
      });
      const receipt = await client.waitForFinalization({ hash: tx });
      requireSuccessfulExecution(receipt, 'Incident evaluation');
      const incident = (await client.readContract({
        address: contractAddress as `0x${string}`,
        functionName: 'get_incident',
        args: [latestIncidentId],
      })) as { status?: string; action?: string; severity?: string; component?: string };
      setReportMessage(
        `Incident ${latestIncidentId}: ${incident?.status ?? 'evaluated'} · ${incident?.severity ?? ''} · ${incident?.component ?? ''} · action ${incident?.action ?? ''}`
      );
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Incident evaluation failed');
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <main>
      <nav className="nav shell">
        <div className="brand"><span className="brandMark">F</span>FuseLayer</div>
        <div className="navRight">
          <span className="freeBadge">Free demo</span>
          <button className="ghost small" onClick={connectWallet}>
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Connect wallet'}
          </button>
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow">FuseLayer</div>
        <h1>Selective incident containment for smart contracts.</h1>
        <p className="lead">
          GenLayer checks the incident evidence. FuseLayer uses the agreed severity, affected component and scope to decide how much of the protocol actually needs to be restricted.
        </p>
        <div className="heroActions">
          <button className="primary" onClick={runDemo} disabled={previewing}>
            {previewing ? 'Checking evidence…' : 'Try demo'}
          </button>
          <a className="textLink" href="#protect">Protect a contract ↓</a>
        </div>
      </section>

      <section className="shell grid2 demoSection">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <div className="label">Safety profile</div>
              <h2>Response profile</h2>
            </div>
          </div>
          <div className="profileRow">
            {['BALANCED', 'SAFETY_FIRST', 'AVAILABILITY_FIRST'].map((item) => (
              <button
                key={item}
                className={`profile ${profile === item ? 'active' : ''}`}
                onClick={() => setProfile(item)}
              >
                {item.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <p className="muted">{profileCopy[profile]}</p>
          <div className="demoEvidence">
            <div className="label">Demo incident</div>
            <p>{DEMO_CLAIM}</p>
            <span>2 public demo notes · no wallet required</span>
          </div>
        </div>

        <div className="panel resultPanel">
          {!preview && !previewError && (
            <div className="emptyResult">
              <div className="pulseDot" />
              <strong>No result yet</strong>
              <span>Run the sample incident to see the result.</span>
            </div>
          )}
          {previewError && <div className="errorBox">{previewError}</div>}
          {preview && (
            <>
              <div className="resultTop">
                <div>
                  <div className="label">Containment plan</div>
                  <div className="statusLine"><span className="liveDot" />{preview.status}</div>
                </div>
                <div className={`actionBadge level${preview.action_level ?? 0}`}>{preview.action}</div>
              </div>
              <div className="metrics">
                <Metric title="Severity" value={preview.severity ?? '—'} />
                <Metric title="Component" value={preview.component ?? '—'} />
                <Metric title="Blast radius" value={preview.breadth?.replaceAll('_', ' ') ?? '—'} />
              </div>
              <p className="summary">{preview.summary}</p>
              <div className="flow">
                <FlowStep n="1" title="Check" body="Validators review the submitted evidence." />
                <FlowStep n="2" title="Scope" body="The result identifies the affected component and whether the issue is local or protocol-wide." />
                <FlowStep n="3" title="Apply" body={`The ${profile.replaceAll('_', ' ').toLowerCase()} profile maps that result to ${preview.action ?? 'NONE'}.`} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="shell protectSection" id="protect">
        <div className="sectionIntro">
          <div className="eyebrow">Register a contract</div>
          <h2>Protect a contract</h2>
          <p>Add the target contract and choose a safety profile. That is all the setup needed for this demo.</p>
        </div>

        <div className="grid2">
          <div className="panel formPanel">
            <div className="stepLabel">01 · Register</div>
            <label>Protocol name</label>
            <input value={protocolName} onChange={(e) => setProtocolName(e.target.value)} placeholder="My protocol" />
            <label>Protected Intelligent Contract</label>
            <input value={targetAddress} onChange={(e) => setTargetAddress(e.target.value)} placeholder="0x…" />
            <label>Safety profile</label>
            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
              <option value="BALANCED">Balanced</option>
              <option value="SAFETY_FIRST">Safety first</option>
              <option value="AVAILABILITY_FIRST">Availability first</option>
            </select>
            <button className="primary full" onClick={registerProtocol} disabled={registering}>
              {registering ? 'Registering…' : 'Protect contract'}
            </button>
            {protocolId && <div className="successBox">{protocolId}</div>}
            {walletError && <div className="errorBox">{walletError}</div>}
          </div>

          <div className="panel formPanel">
            <div className="stepLabel">02 · Report an incident</div>
            <label>Protocol ID</label>
            <input value={reportProtocolId} onChange={(e) => setReportProtocolId(e.target.value)} placeholder="1" />
            <label>What is happening?</label>
            <textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={3} />
            <label>Evidence URLs <span className="optional">1–3, one per line</span></label>
            <textarea value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} rows={3} />
            <button className="secondary full" onClick={reportIncident} disabled={reporting}>
              {reporting ? 'Submitting…' : 'Submit incident'}
            </button>
            {latestIncidentId && (
              <button className="primary full" onClick={evaluateLatestIncident} disabled={evaluating}>
                {evaluating ? 'Running consensus…' : `Evaluate incident ${latestIncidentId}`}
              </button>
            )}
            {reportMessage && <div className="infoBox">{reportMessage}</div>}
          </div>
        </div>
      </section>

      <section className="shell thesis">
        <div>
          <div className="eyebrow">Containment levels</div>
          <h2>Safety levels</h2>
        </div>
        <div className="thesisGrid">
          <div><strong>RESTRICT</strong><span>Limit exposure without taking the service offline.</span></div>
          <div><strong>ISOLATE</strong><span>Disable the affected part of the protocol.</span></div>
          <div><strong>HALT</strong><span>Stop the protocol when the incident is broad enough to require it.</span></div>
          <div><strong>RECOVER</strong><span>Lower the safety level after the fix is verified.</span></div>
        </div>
      </section>

      <footer className="shell footer">
        <span>FuseLayer · GenLayer</span>
        <span>Hackathon demo is free. A production deployment could use a one-time setup fee per protected contract, for example around $10 for a basic setup.</span>
      </footer>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="metric"><span>{title}</span><strong>{value}</strong></div>;
}

function FlowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return <div className="flowStep"><span>{n}</span><div><strong>{title}</strong><p>{body}</p></div></div>;
}
