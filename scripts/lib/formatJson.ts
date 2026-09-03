import fs from "fs";
import * as prettier from "prettier";

/** Write JSON using the repo's Prettier config so generators stay format:check-clean. */
export async function writeFormattedJson(
  outPath: string,
  data: unknown,
): Promise<void> {
  const formatted = await prettier.format(JSON.stringify(data, null, 2), {
    ...(await prettier.resolveConfig(outPath)),
    parser: "json",
  });
  fs.writeFileSync(outPath, formatted);
}
