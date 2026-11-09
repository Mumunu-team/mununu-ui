#!/usr/bin/env node
// Write the build's licence and third-party notices into dist/:
//   dist/LICENSE.txt              — this repository's LICENSE
//   dist/THIRD_PARTY_NOTICES.txt  — every production npm package in package-lock.json, with its
//                                   declared licence and the text of its licence/notice files
// Production = a lockfile entry not marked `dev` (a superset of what Vite compiles in, which is
// the safe direction for notices). A package that ships no licence file is listed with its
// declared licence and says so, rather than being left out; an optional package npm did not
// install (another platform's binary) is skipped and counted. No dependencies: reads the lockfile
// and node_modules only. Run by `npm run build`; mununu's scripts/bundle.sh refuses a UI build
// without both files.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const NOTICE_FILE = /^(licen[cs]e|copying|notice)(\.|$|-)/i;

const entries = Object.entries(lock.packages ?? {})
  .filter(
    ([path, meta]) =>
      path.startsWith("node_modules/") && !meta.dev && !meta.devOptional,
  )
  .map(([path, meta]) => {
    const name = path.slice(
      path.lastIndexOf("node_modules/") + "node_modules/".length,
    );
    return {
      path,
      name,
      version: meta.version ?? "?",
      license: meta.license,
      optional: !!meta.optional,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

const seen = new Set();
const out = [
  "Third-party notices for the Mununu web UI build",
  "================================================",
  "",
  "The Mununu web UI (LICENSE.txt) is built with the npm packages below. Each stays under its own",
  "licence. The declared licence comes from the package; the texts are the licence and notice",
  "files the package ships.",
  "",
];
let missing = 0;
let notInstalled = 0;
for (const e of entries) {
  // An optional package npm did not install on this host (another platform's native binary)
  // took no part in this build.
  if (e.optional && !existsSync(join(root, e.path))) {
    notInstalled += 1;
    continue;
  }
  const key = `${e.name}@${e.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const dir = join(root, e.path);
  let declared = e.license;
  if (!declared && existsSync(join(dir, "package.json"))) {
    declared = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ).license;
  }
  out.push(
    "-".repeat(78),
    `${key}`,
    `Declared licence: ${declared ?? "none declared"}`,
    "",
  );
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => NOTICE_FILE.test(f))
        .sort()
    : [];
  if (files.length === 0) {
    missing += 1;
    out.push(
      "(the package ships no licence or notice file; its declared licence is above)",
      "",
    );
  }
  for (const f of files) {
    out.push(`--- ${f}`, readFileSync(join(dir, f), "utf8").trimEnd(), "");
  }
}
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "THIRD_PARTY_NOTICES.txt"), out.join("\n") + "\n");
writeFileSync(
  join(dist, "LICENSE.txt"),
  readFileSync(join(root, "LICENSE"), "utf8"),
);
console.log(
  `third-party notices: ${seen.size} packages, ${missing} without a licence file, ${notInstalled} optional packages not installed here → dist/THIRD_PARTY_NOTICES.txt`,
);
