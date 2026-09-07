import sampleDataUrl from "../../examples/sample-master.pptx?inline";

/**
 * The bundled example master (examples/sample-master.pptx): Office's default layouts renamed by the convention
 * (Cover / Agenda / Section / Body-Text / Body-2col), 16:9. Inlined as a data URL so it works from file:// in Electron
 * and from the browser build alike; the settings sheet copies it into the masters folder so it can be opened in
 * PowerPoint, adjusted, and saved over.
 */
export const SAMPLE_MASTER_NAME = "sample-master.pptx";

export async function sampleMasterBlob(): Promise<Blob> {
  return (await fetch(sampleDataUrl)).blob();
}
