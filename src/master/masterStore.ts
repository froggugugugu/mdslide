import { del, get, keys, set } from "idb-keyval";
import type { MasterProfile } from "./importMaster";

const PREFIX = "master:";
const FILE_PREFIX = "masterfile:";

/** Masters are kept in IndexedDB together with the original pptx so export can use it as the base package. */
export async function saveMaster(profile: MasterProfile, file: Blob): Promise<void> {
  await set(PREFIX + profile.id, profile);
  await set(FILE_PREFIX + profile.id, file);
}

export async function listMasters(): Promise<MasterProfile[]> {
  const ks = (await keys()).filter((k) => typeof k === "string" && k.startsWith(PREFIX));
  const all = await Promise.all(ks.map((k) => get<MasterProfile>(k)));
  return all.filter((m): m is MasterProfile => !!m).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function getMasterFile(id: string): Promise<Blob | undefined> {
  return get<Blob>(FILE_PREFIX + id);
}

export async function removeMaster(id: string): Promise<void> {
  await del(PREFIX + id);
  await del(FILE_PREFIX + id);
}
