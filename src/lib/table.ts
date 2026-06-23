import Table from "cli-table3";
import pc from "picocolors";

export function printTable(head: string[], rows: string[][]): void {
  const t = new Table({
    head: head.map((h) => pc.bold(pc.yellow(h))),
    style: { head: [], border: [] },
  });
  for (const r of rows) t.push(r);
  console.log(t.toString());
}

export const ok = (s: string) => pc.green(s);
export const bad = (s: string) => pc.red(s);
export const dim = (s: string) => pc.gray(s);
export const acc = (s: string) => pc.yellow(s);

export function title(s: string): void {
  console.log("\n" + pc.bold(pc.cyan(s)));
}
