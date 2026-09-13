import sampleDataUrl from "../../examples/sample-master.pptx?inline";

/**
 * The bundled example master (examples/sample-master.pptx, built by scripts/make_sample_master.py): the five
 * convention layouts (Cover / Agenda / Section / Body-Text / Body-2col) on a 16:9 master. Inlined as a data URL so it works from file:// in Electron
 * and from the browser build alike; the settings sheet copies it into the masters folder so it can be opened in
 * PowerPoint, adjusted, and saved over.
 */
export const SAMPLE_MASTER_NAME = "sample-master.pptx";

export async function sampleMasterBlob(): Promise<Blob> {
  return (await fetch(sampleDataUrl)).blob();
}
