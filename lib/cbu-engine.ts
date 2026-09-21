// lib/cbu-engine.ts
// Thin re-export kept so existing imports (`@/lib/cbu-engine`, `../../../lib/cbu-engine`) keep working.
// The engine now lives in src/lib/cbu/ (SPEC §11.8). This file goes away when lib/ and src/lib/ are merged
// (PROGRESS.md Sprint 2). New code: import { calculateCbu } from "@/lib/cbu".
//
// Relative path on purpose: the webpack alias '@/lib' points at this root folder, so an '@/…' import from
// here could resolve back to itself.
export * from "../src/lib/cbu/legacy";
