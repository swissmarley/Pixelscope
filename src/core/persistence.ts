import type { SavedRun, PipelineEvent } from "./types";
interface Asset {
  id: string;
  blob: Blob;
}
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("pixelscope", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("runs", { keyPath: "id" });
    request.result.createObjectStore("assets", { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function assetURL(
  value: string,
  id: string,
  assets: Asset[],
): Promise<string> {
  if (!value.startsWith("data:") && !value.startsWith("/demo/")) return value;
  const blob = await (await fetch(value)).blob();
  assets.push({ id, blob });
  return `asset:${id}`;
}
async function transformEvent(
  event: PipelineEvent,
  transform: (value: string, key: string) => Promise<string>,
): Promise<PipelineEvent> {
  const copy = { ...event };
  if ("image" in copy) copy.image = await transform(copy.image, "image");
  if ("preview" in copy && copy.preview)
    copy.preview = await transform(copy.preview, "preview");
  if (copy.type === "denoise_step") {
    if (copy.noisePrediction)
      copy.noisePrediction = await transform(
        copy.noisePrediction,
        "noisePrediction",
      );
    copy.guidance = { ...copy.guidance };
    for (const key of ["unconditional", "conditional", "difference"] as const) {
      const v = copy.guidance[key];
      if (v) copy.guidance[key] = await transform(v, key);
    }
  }
  return copy;
}
export async function saveRun(run: SavedRun) {
  const db = await dbPromise;
  const assets: Asset[] = [];
  const storedEvents = await Promise.all(
    run.events.map((e, i) =>
      transformEvent(e, (v, key) =>
        assetURL(v, `${run.id}-${i}-${key}`, assets),
      ),
    ),
  );
  const thumbnail = await assetURL(run.thumbnail, `${run.id}-thumb`, assets);
  const config = { ...run.config };
  if (config.reference)
    config.reference = await assetURL(
      config.reference,
      `${run.id}-reference`,
      assets,
    );
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["runs", "assets"], "readwrite");
    for (const asset of assets) tx.objectStore("assets").put(asset);
    tx.objectStore("runs").put({
      ...run,
      config,
      events: storedEvents,
      thumbnail,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function getRuns(): Promise<SavedRun[]> {
  const db = await dbPromise;
  const runs = (await requestResult(
    db.transaction("runs").objectStore("runs").getAll(),
  )) as SavedRun[];
  const urls = new Map<string, string>();
  const restore = async (value: string) => {
    if (!value.startsWith("asset:")) return value;
    const id = value.slice(6);
    const cached = urls.get(id);
    if (cached) return cached;
    const asset = (await requestResult(
      db.transaction("assets").objectStore("assets").get(id),
    )) as Asset | undefined;
    if (!asset) return "";
    const url = URL.createObjectURL(asset.blob);
    urls.set(id, url);
    return url;
  };
  const restoreReference = async (value: string): Promise<string> => {
    if (!value.startsWith("asset:")) return value;
    const asset = (await requestResult(
      db.transaction("assets").objectStore("assets").get(value.slice(6)),
    )) as Asset | undefined;
    if (!asset) return "";
    // References must remain portable to Lab and Live request bodies after replay.
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(asset.blob);
    });
  };
  return Promise.all(
    runs
      .sort((a, b) => b.created - a.created)
      .map(async (run) => ({
        ...run,
        thumbnail: await restore(run.thumbnail),
        config: {
          ...run.config,
          reference: run.config.reference
            ? await restoreReference(run.config.reference)
            : undefined,
        },
        events: await Promise.all(
          run.events.map((e) => transformEvent(e, (v) => restore(v))),
        ),
      })),
  );
}
export function releaseRuns(runs: SavedRun[]) {
  const values = new Set<string>();
  for (const run of runs) {
    values.add(run.thumbnail);
    if (run.config.reference) values.add(run.config.reference);
    for (const e of run.events) {
      if ("image" in e) values.add(e.image);
      if ("preview" in e && e.preview) values.add(e.preview);
      if (e.type === "denoise_step" && e.noisePrediction)
        values.add(e.noisePrediction);
      if (e.type === "denoise_step")
        for (const v of Object.values(e.guidance))
          if (typeof v === "string") values.add(v);
    }
  }
  for (const url of values)
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
