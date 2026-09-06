import type { MdslideApi } from "../../electron/preload";

declare global {
  interface Window { mdslide?: MdslideApi }
}
export {};
