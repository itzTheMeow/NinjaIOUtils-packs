import AdmZip from "adm-zip";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SOURCE_REPO = process.env.SOURCE_REPO || "itzTheMeow/NinjaIOUtils";
const UPSTREAM = "upstream";

function $(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: "inherit" });
}

function cleanup() {
  fs.rmSync(UPSTREAM, { recursive: true, force: true });
}

cleanup();
// clone upstream repo
$(`git clone --depth 1 https://github.com/${SOURCE_REPO} ${UPSTREAM}`);

const sourceDir = path.join(UPSTREAM, "texturepacks");
if (!fs.existsSync(sourceDir))
  throw new Error(`texturepacks/ not found in ${SOURCE_REPO}`);
// grab and sort all upstream packs
const entries = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

// create our local pack dir if it doesnt exist
fs.mkdirSync("packs", { recursive: true });

const packIds = [],
  manifest = [];
for (const id of entries) {
  const dir = path.join(sourceDir, id);
  const files = fs.readdirSync(dir);
  if (!files.includes("_meta.json")) {
    console.warn(`skipping ${id}: no _meta.json`);
    continue;
  }
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "_meta.json"), "utf8"));
  } catch {
    console.warn(`skipping ${id}: invalid _meta.json`);
    continue;
  }

  const special = files.find(
    (f) => f === "_usepixel.png" || f === "_useimg.png",
  );
  const hasCombined = !!special || files.some((f) => f.startsWith("c_"));
  const hasSeamless = !!special || files.some((f) => f.startsWith("s_"));
  if (!hasCombined && !hasSeamless) {
    console.warn(`skipping ${id}: no source png files`);
    continue;
  }

  // create a zip file for the pack
  const zip = new AdmZip();
  for (const file of files) zip.addLocalFile(path.join(dir, file), "", file);
  const buffer = zip.toBuffer();
  // also hash the zip for version control
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  fs.writeFileSync(path.join("packs", `${id}.zip`), buffer);
  packIds.push(id);
  manifest.push({
    id,
    name: meta.name || id,
    author: meta.author || "Unnamed",
    description: meta.description || "No Description.",
    hasCombined,
    hasSeamless,
    hash,
    zip: `packs/${id}.zip`,
  });
  console.log(`compiled ${id} (${(buffer.length / 1024) | 0}KB / ${hash})`);
}
cleanup();

// remove zips for packs that no longer exist
for (const file of fs.readdirSync("packs")) {
  const id = file.replace(/\.zip$/, "");
  if (!packIds.includes(id)) {
    fs.rmSync(path.join("packs", file));
    console.log(`removed deleted pack ${id}`);
  }
}

// sort/write manifest
manifest.sort((a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
);
fs.writeFileSync(
  "manifest.json",
  JSON.stringify(
    { updated: new Date().toISOString(), packs: manifest },
    null,
    2,
  ) + "\n",
);
console.log(`completed: ${manifest.length} packs`);
