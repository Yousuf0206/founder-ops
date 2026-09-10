/**
 * CI guard (T0.11) for Constitution IX: secrets never ship to the browser.
 *
 * Next.js inlines any NEXT_PUBLIC_* variable into the client bundle. This fails
 * the build if a name that looks like a secret ever gains that prefix, in
 * env.example or in the process environment.
 *
 *   npm run check:public-env
 */
import { readFileSync, existsSync } from "node:fs";

const SECRET_MARKERS = [
  "SERVICE_ROLE",
  "SECRET",
  "PRIVATE",
  "PASSWORD",
  "_TOKEN",
  "API_KEY",
  "ACCESS_KEY",
  "CREDENTIAL",
];

// Names that legitimately carry a marker word but are safe to publish.
const ALLOWLIST = new Set([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY", // anon key is public by design; RLS is the guard
]);

function offendingNames(names) {
  return names.filter((name) => {
    if (!name.startsWith("NEXT_PUBLIC_")) return false;
    if (ALLOWLIST.has(name)) return false;
    const upper = name.toUpperCase();
    return SECRET_MARKERS.some((marker) => upper.includes(marker));
  });
}

const problems = [];

// 1. env.example — catches the mistake at review time.
if (existsSync("env.example")) {
  const declared = readFileSync("env.example", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0].trim());

  for (const name of offendingNames(declared)) {
    problems.push(`env.example declares ${name}`);
  }
}

// 2. The live environment — catches it at build time on Vercel.
for (const name of offendingNames(Object.keys(process.env))) {
  problems.push(`environment defines ${name}`);
}

if (problems.length > 0) {
  console.error("Secret exposed to the browser (Constitution IX):\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nNEXT_PUBLIC_* values are inlined into the client bundle. Remove the prefix,\n" +
      "or add the name to ALLOWLIST in scripts/check-public-env.mjs if it is genuinely public.",
  );
  process.exit(1);
}

console.log("check:public-env — no secrets carry a NEXT_PUBLIC_ prefix.");
