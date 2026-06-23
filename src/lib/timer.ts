// Đo thời gian (ms) của một async fn.
export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - t0 };
}

export const ms = (n: number) => (n < 10 ? `${n.toFixed(1)}ms` : `${n.toFixed(0)}ms`);
