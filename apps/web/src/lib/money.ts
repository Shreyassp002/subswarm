const RAO_PER_TAO = BigInt(1_000_000_000);
const MAX_RAO = BigInt("18446744073709551615");

export function parseTAO(value: string): bigint {
  const input = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(input)) {
    throw new Error("Enter a TAO amount with up to 9 decimal places.");
  }
  const [whole, fraction = ""] = input.split(".");
  const amount = BigInt(whole) * RAO_PER_TAO + BigInt(fraction.padEnd(9, "0"));
  if (amount <= BigInt(0) || amount > MAX_RAO) throw new Error("Enter a positive amount within the supported limit.");
  return amount;
}

export function formatTAO(value: string | bigint): string {
  const amount = BigInt(value);
  const negative = amount < BigInt(0);
  const absolute = negative ? -amount : amount;
  const fraction = (absolute % RAO_PER_TAO).toString().padStart(9, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / RAO_PER_TAO}${fraction ? `.${fraction}` : ""}`;
}
