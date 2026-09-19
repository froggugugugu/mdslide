import reportDataUrl from "../../examples/report-master.pptx?inline";
import sampleDataUrl from "../../examples/sample-master.pptx?inline";

/**
 * The example masters the app carries (built by scripts/make_sample_master.py): the five convention layouts
 * (Cover / Agenda / Section / Body-Text / Body-2col) on a 16:9 master, in two densities — 発表用 for a room and
 * 報告用 for a desk (ADR-0032). Inlined as data URLs so they work from file:// in Electron and from the browser
 * build alike; the settings sheet copies one into the masters folder so it can be opened in PowerPoint, adjusted,
 * and saved over.
 */
export interface BundledMaster {
  name: string;
  /** What it is for, shown on the button in the settings sheet. */
  label: string;
  /** One line about the density, shown under the buttons. */
  note: string;
  blob: () => Promise<Blob>;
}

const load = (url: string) => async () => (await fetch(url)).blob();

export const SAMPLE_MASTER_NAME = "sample-master.pptx";
export const REPORT_MASTER_NAME = "report-master.pptx";

export const BUNDLED_MASTERS: BundledMaster[] = [
  { name: SAMPLE_MASTER_NAME, label: "発表用", note: "本文 18pt。離れて読むスライド向け", blob: load(sampleDataUrl) },
  { name: REPORT_MASTER_NAME, label: "報告用", note: "本文 11pt。手元で読む報告資料向け", blob: load(reportDataUrl) },
];

export async function sampleMasterBlob(): Promise<Blob> {
  return (await fetch(sampleDataUrl)).blob();
}
