export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

type PreviewBody = {
  profile?: string;
  claim?: string;
  evidence?: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PreviewBody;
    const profile = normalizeProfile(body.profile);
    const claim = normalizeClaim(body.claim);
    const evidence = normalizeEvidence(body.evidence);
    const address = contractAddress();

    const client = createClient({ chain: studionet });
    const raw = await client.simulateWriteContract({
      address: address as `0x${string}`,
      functionName: 'preview_incident',
      args: [profile, claim, JSON.stringify(evidence)],
    });

    return NextResponse.json({ result: normalizeResult(raw), contract_address: address });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed' },
      { status: 500 },
    );
  }
}

function normalizeProfile(value: unknown) {
  const profile = typeof value === 'string' ? value.trim().toUpperCase() : 'BALANCED';
  if (!['BALANCED', 'SAFETY_FIRST', 'AVAILABILITY_FIRST'].includes(profile)) {
    throw new Error('Unknown safety profile');
  }
  return profile;
}

function normalizeClaim(value: unknown) {
  if (typeof value !== 'string') throw new Error('Incident claim is required');
  const claim = value.trim();
  if (claim.length < 20) throw new Error('Incident claim is too short');
  if (claim.length > 700) throw new Error('Incident claim is too long');
  return claim;
}

function normalizeEvidence(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error('Provide between 1 and 3 evidence URLs');
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new Error(`Evidence URL ${index + 1} is invalid`);
    const clean = item.trim();
    const parsed = new URL(clean);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Evidence URL ${index + 1} must use http or https`);
    }
    return clean;
  });
}

function contractAddress() {
  const value =
    process.env.FUSELAYER_CONTRACT_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_FUSELAYER_CONTRACT_ADDRESS?.trim();
  if (!value) throw new Error('FuseLayer contract address is not configured');
  return value;
}

function normalizeResult(raw: unknown) {
  const value =
    raw && typeof raw === 'object' && 'result' in raw
      ? (raw as { result?: unknown }).result
      : raw;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  return value;
}
