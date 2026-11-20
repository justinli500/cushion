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
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
        <Stat label="Play money" value={formatUsd(balance)} dark />
        <Stat label="Spent on cushions" value={formatUsd(spent)} />
        <Stat label="Paid back to you" value={formatUsd(paid)} />
      </div>

      <div className="space-y-5">
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

function Stat({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[28px] p-6 ${dark ? "bg-panel text-white" : "bg-card"}`}>
      <span className={`text-[13px] ${dark ? "text-panel-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className="display tabular text-[38px] font-bold leading-none tracking-[-0.03em]">{value}</span>
    </div>
  );
}

function Positions({ positions }: { positions: Position[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {positions.map((p) => (
        <li key={p.id} className="arrive flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-[18px] bg-muted p-4">
          <div className="min-w-0 flex-[1_1_320px]">
            <p className="text-[16px] font-semibold">{p.title}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-body">{p.detail}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {p.replay ? <Tag>Simulated game</Tag> : null}
              <span>
                {p.payout != null
                  ? `Settled ${formatWhen(p.settledAt ?? p.expiry)}`
                  : p.replay
                    ? "Settles when the game ends"
                    : `Settles ${formatWhen(p.expiry)}`}
              </span>
              {p.receipt ? (
                <a href={explorer(p.receipt)} target="_blank" rel="noreferrer" className="press font-semibold text-covered underline underline-offset-2">
                  View receipt
                </a>
              ) : (
                <button type="button" onClick={() => void requestReceipt({ ...p })} className="press text-muted-foreground underline underline-offset-2">
                  Receipt pending. Try again
                </button>
              )}
            </p>
          </div>
          <div className="tabular shrink-0 text-right">
            <p className="text-[15px] font-semibold">Cost {formatUsd(p.cost)}</p>
            {p.payout == null ? (
              <p className="text-[14px] font-semibold text-covered">Pays up to {formatUsd(p.maxPayout)}</p>
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
