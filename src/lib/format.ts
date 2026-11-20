const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const formatUsd = (dollars: number) => usd.format(dollars);
export const formatUsdWhole = (dollars: number) => usdWhole.format(dollars);

/** 0.184 -> "18%". Chances under 1% and over 99% are shown as such instead of rounding to 0 or 100. */
export function formatChance(p: number | null): string {
  if (p == null) return "n/a";
  if (p > 0 && p < 0.01) return "under 1%";
  if (p < 1 && p > 0.99) return "over 99%";
  return `${Math.round(p * 100)}%`;
}

/** A price level with as many decimals as its size needs: 62,500 / 89.50 / 0.967 */
export function formatLevel(value: number): string {
  const digits = value >= 1000 ? 0 : value >= 10 ? 2 : 3;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const time = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
export const formatWhen = (iso: string) => time.format(new Date(iso));
