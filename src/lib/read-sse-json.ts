/**
 * Citește text/event-stream de la un fetch până la ultimul câmp `data:` (JSON).
 * Ignoră comentariile SSE (`: keepalive`) folosite ca heartbeat.
 */
export async function readSseFinalDataJson(
  body: ReadableStream<Uint8Array> | null,
): Promise<Record<string, unknown>> {
  const reader = body?.getReader();
  if (!reader) throw new Error("Lipsă răspuns de la server.");

  const dec = new TextDecoder();
  let buffer = "";
  let lastDataPayload: string | null = null;

  const consumeBlocks = (raw: string) => {
    const chunks = raw.split("\n\n");
    const rest = chunks.pop() ?? "";
    for (const block of chunks) {
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) {
          lastDataPayload = line.slice(5).trim();
        }
      }
    }
    return rest;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    buffer = consumeBlocks(buffer);
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data:")) {
        lastDataPayload = line.slice(5).trim();
      }
    }
  }

  if (!lastDataPayload) {
    throw new Error("Răspuns raport incomplet (fără date finale).");
  }
  try {
    return JSON.parse(lastDataPayload) as Record<string, unknown>;
  } catch {
    throw new Error(`Răspuns invalid: ${lastDataPayload.slice(0, 160)}`);
  }
}
