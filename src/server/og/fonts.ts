import { readFile } from "fs/promises";
import path from "path";

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

let fontsPromise: Promise<OgFont[]> | undefined;

// Roboto Mono (regular + bold) read from disk and cached for the lifetime of the
// serverless function. The files are bundled via `outputFileTracingIncludes` in
// next.config.mjs.
export function loadOgFonts(): Promise<OgFont[]> {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), "src/server/og/fonts");
    fontsPromise = Promise.all([
      readFile(path.join(dir, "RobotoMono-Regular.ttf")),
      readFile(path.join(dir, "RobotoMono-Bold.ttf")),
    ]).then(([regular, bold]): OgFont[] => [
      { name: "Roboto Mono", data: regular, weight: 400, style: "normal" },
      { name: "Roboto Mono", data: bold, weight: 700, style: "normal" },
    ]);
  }
  return fontsPromise;
}
