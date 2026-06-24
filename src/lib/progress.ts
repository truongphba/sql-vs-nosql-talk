import pc from "picocolors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export type Spinner = {
  update: (detail?: string) => void;
  stop: (suffix?: string) => void;
  fail: (message?: string) => void;
};

function padLine(line: string, width = 88): string {
  return line.length >= width ? line : line + " ".repeat(width - line.length);
}

export function isInteractive(): boolean {
  return Boolean(process.stderr.isTTY);
}

/** Spinner trên stderr — không đè bảng kết quả stdout. */
export function startSpinner(label: string): Spinner {
  if (!isInteractive()) {
    process.stderr.write(pc.dim(`… ${label}\n`));
    return {
      update: () => {},
      stop: (suffix) => {
        if (suffix) process.stderr.write(pc.dim(`  ✓ ${label} · ${suffix}\n`));
      },
      fail: (message) => {
        process.stderr.write(pc.red(`  ✗ ${label}${message ? ` · ${message}` : ""}\n`));
      },
    };
  }

  let frame = 0;
  let detail = "";
  const render = () => {
    const icon = pc.cyan(FRAMES[frame % FRAMES.length]);
    const tail = detail ? pc.dim(` ${detail}`) : "";
    process.stderr.write(`\r${padLine(`${icon} ${label}${tail}`)}`);
    frame++;
  };
  render();
  const timer = setInterval(render, 80);

  const clear = () => {
    clearInterval(timer);
  };

  return {
    update: (d) => {
      detail = d ?? "";
    },
    stop: (suffix) => {
      clear();
      const tail = suffix ? pc.dim(` · ${suffix}`) : "";
      process.stderr.write(`\r${padLine(`${pc.green("✓")} ${label}${tail}`)}\n`);
    },
    fail: (message) => {
      clear();
      const tail = message ? pc.dim(` · ${message}`) : "";
      process.stderr.write(`\r${padLine(`${pc.red("✗")} ${label}${tail}`)}\n`);
    },
  };
}

export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  formatDone?: (result: T) => string,
): Promise<T> {
  const sp = startSpinner(label);
  try {
    const result = await fn();
    sp.stop(formatDone?.(result));
    return result;
  } catch (e) {
    sp.fail(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function runPool(
  total: number,
  conc: number,
  task: (i: number) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (i < total) {
      const k = i++;
      await task(k);
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
}

export async function runPoolWithSpinner(
  total: number,
  conc: number,
  task: (i: number) => Promise<unknown>,
  label: string,
): Promise<void> {
  const sp = startSpinner(label);
  let lastTick = 0;
  try {
    await runPool(total, conc, task, (done, tot) => {
      const now = Date.now();
      if (done === tot || now - lastTick >= 120) {
        lastTick = now;
        const pct = ((done / tot) * 100).toFixed(0);
        sp.update(`${done.toLocaleString()}/${tot.toLocaleString()} (${pct}%)`);
      }
    });
    sp.stop("done");
  } catch (e) {
    sp.fail(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function runConcurrentWithSpinner(
  total: number,
  concurrency: number,
  fn: (i: number) => Promise<unknown>,
  label: string,
): Promise<void> {
  let next = 0;
  let done = 0;
  const sp = startSpinner(label);
  let lastTick = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= total) break;
      await fn(i);
      done++;
      const now = Date.now();
      if (done === total || now - lastTick >= 120) {
        lastTick = now;
        const pct = ((done / total) * 100).toFixed(0);
        sp.update(`${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    sp.stop("done");
  } catch (e) {
    sp.fail(e instanceof Error ? e.message : String(e));
    throw e;
  }
}
