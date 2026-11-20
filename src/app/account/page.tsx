"use client";

import { requestReceipt } from "@/domains/account/buy";
import type { Position } from "@/domains/account/ledger";
import { resetAccount, useAccount } from "@/domains/account/store";
import { Button, Card, CardTitle, Notice, PageHeader, Tag } from "@/components/kit";
import { formatUsd, formatWhen } from "@/lib/format";

const explorer = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

export default function AccountPage() {
  const { balance, positions } = useAccount();
  const open = positions.filter((p) => p.payout == null);
  const settled = positions.filter((p) => p.payout != null);
  const spent = positions.reduce((total, p) => total + p.cost, 0);
  const paid = settled.reduce((total, p) => total + (p.payout ?? 0), 0);

  return (
    <>
      <PageHeader title="Account" lead="Your play money and every cushion you have added. Nothing here is real money." />
      <div className="mb-6 grid grid-cols-3 gap-6">
        <Stat label="Play money" value={formatUsd(balance)} />
        <Stat label="Spent on cushions" value={formatUsd(spent)} />
        <Stat label="Paid back to you" value={formatUsd(paid)} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle hint={`${open.length} open`}>Open cushions</CardTitle>
          {open.length === 0 ? <Notice>No open cushions. Add one from any section.</Notice> : <Positions positions={open} />}
        </Card>
        <Card>
          <CardTitle hint={`${settled.length} settled`}>Settled</CardTitle>
          {settled.length === 0 ? (
            <Notice>Cushions settle here once Gemini resolves their contracts.</Notice>
          ) : (
            <Positions positions={settled} />
          )}
        </Card>
        <Button variant="quiet" onClick={resetAccount}>
          Reset Account
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[26px] font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

function Positions({ positions }: { positions: Position[] }) {
  return (
    <ul className="divide-y divide-border">
      {positions.map((p) => (
        <li key={p.id} className="arrive flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">{p.title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{p.detail}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground/70">
              {p.replay ? <Tag>Simulated game</Tag> : null}
              <span>
                {p.payout != null
                  ? `Settled ${formatWhen(p.settledAt ?? p.expiry)}`
                  : p.replay
                    ? "Settles when the game ends"
                    : `Settles ${formatWhen(p.expiry)}`}
              </span>
              {p.receipt ? (
                <a href={explorer(p.receipt)} target="_blank" rel="noreferrer" className="press text-primary underline-offset-2 hover:underline">
                  View receipt
                </a>
              ) : (
                <button type="button" onClick={() => void requestReceipt({ ...p })} className="press text-muted-foreground underline-offset-2 hover:underline">
                  Receipt pending. Try again
                </button>
              )}
            </p>
          </div>
          <div className="tabular shrink-0 text-right">
            <p className="text-[14px]">Cost {formatUsd(p.cost)}</p>
            {p.payout == null ? (
              <p className="text-[13px] text-muted-foreground">Pays up to {formatUsd(p.maxPayout)}</p>
            ) : p.payout > 0 ? (
              <Tag tone="cushion">Paid {formatUsd(p.payout)}</Tag>
            ) : (
              <Tag tone="plain">Not needed</Tag>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
