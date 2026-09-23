/**
 * lib/ai/duplicate.ts — Duplicate-report detection engine.
 *
 * Signals (each scored 0–1, then combined):
 *   photo     — identical content hash (exact re-upload) or hash overlap
 *   text      — token Jaccard similarity of title+description (+ shared
 *               phrases), with a lexical stem so "flooded"/"flooding" match
 *   location  — GPS proximity: 1.0 at 0 m, fading to 0 at 300 m
 *   category  — same category
 *
 * Design goals:
 *   - NEVER blocks submission. It flags reports (is_possible_duplicate) and
 *     writes evidence rows for admins to dismiss or merge.
 *   - Modular: each signal is a pure function; swapping in embedding-based
 *     text similarity or perceptual image hashing later touches one file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateSignal = "photo" | "text" | "location" | "category" | "ai_image";

export type DuplicateEvidence = {
  signal: DuplicateSignal;
  score: number;
  details: Record<string, unknown>;
};

export type DuplicateCandidate = {
  reportId: string;
  title: string;
  description: string;
  categoryId: string | null;
  latitude: number | null;
  longitude: number | null;
  barangayId: string | null;
  status: string;
  photoHashes: string[];
  score: number;
  evidence: DuplicateEvidence[];
};

export type NewReportFacts = {
  title: string;
  description: string;
  categoryId: string | null;
  latitude: number | null;
  longitude: number | null;
  barangayId: string | null;
  photoHashes: string[];
};

/* ----------------------------- tuning ----------------------------- */

/** Overall score at/above which a report is flagged for admin review. */
export const DUPLICATE_FLAG_THRESHOLD = 0.55;
/** Look this many days back for potential originals. */
const LOOKBACK_DAYS = 14;
/** Candidates within this radius (meters) count for the location signal. */
const LOCATION_RADIUS_M = 300;
/** Max candidates evaluated (bounded query keeps this cheap). */
const MAX_CANDIDATES = 40;

/* ----------------------------- signals ----------------------------- */

export function photoSignal(newHashes: string[], oldHashes: string[]): DuplicateEvidence | null {
  if (!newHashes.length || !oldHashes.length) return null;
  const old = new Set(oldHashes);
  const shared = newHashes.filter((h) => old.has(h)).length;
  if (!shared) return null;
  const score = shared / Math.min(newHashes.length, oldHashes.length);
  return {
    signal: "photo",
    score,
    details: { shared_hashes: shared, new_photos: newHashes.length, old_photos: oldHashes.length },
  };
}

/** Tiny normalizer + stemmer — good enough for overlap scoring. */
function tokens(text: string): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "at", "in", "on", "to", "is", "are",
    "was", "near", "this", "that", "it", "sa", "ng", "na", "po", "mga",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stop.has(t))
    .map(stem);
}

/** Crude suffix stem — collapses plural/progressive variants. */
function stem(w: string): string {
  return w
    .replace(/(ing|ed|es|s)$/, "")
    .replace(/(.)\1$/, "$1");
}

export function textSignal(newReport: NewReportFacts, old: { title: string; description: string }): DuplicateEvidence | null {
  const a = tokens(`${newReport.title} ${newReport.description}`);
  const b = new Set(tokens(`${old.title} ${old.description}`));
  if (!a.length || !b.size) return null;
  const shared = a.filter((t) => b.has(t));
  const jaccard = shared.length / (new Set([...a, ...Array.from(b)]).size);
  if (jaccard <= 0) return null;
  return {
    signal: "text",
    score: Math.min(1, jaccard * 1.6), // Jaccard alone is strict — boost
    details: { shared_tokens: Array.from(new Set(shared)).slice(0, 12) },
  };
}

export function locationSignal(
  newReport: NewReportFacts,
  old: { latitude: number | null; longitude: number | null }
): DuplicateEvidence | null {
  if (
    newReport.latitude == null || newReport.longitude == null ||
    old.latitude == null || old.longitude == null
  ) return null;
  const meters = haversineMeters(
    newReport.latitude, newReport.longitude, old.latitude, old.longitude
  );
  if (meters > LOCATION_RADIUS_M) return null;
  // linear falloff 1.0 → 0 across the radius
  const score = 1 - meters / LOCATION_RADIUS_M;
  return {
    signal: "location",
    score: Math.max(0, score),
    details: { distance_m: Math.round(meters) },
  };
}

function categorySignal(
  newReport: NewReportFacts,
  old: { categoryId: string | null }
): DuplicateEvidence | null {
  if (!newReport.categoryId || !old.categoryId) return null;
  if (newReport.categoryId !== old.categoryId) return null;
  return { signal: "category", score: 1, details: {} };
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Weighted combination — photo identity dominates, text second.
 *  `ai_image` (browser CLIP embedding similarity) scores like text: strong
 *  corroborating evidence, not proof on its own — two different potholes can
 *  look alike. */
export function combineScore(evidence: DuplicateEvidence[]): number {
  let score = 0;
  for (const e of evidence) {
    switch (e.signal) {
      case "photo": score = Math.max(score, 0.9 * e.score + 0.1); break;
      case "text": score += 0.45 * e.score; break;
      case "ai_image": score += 0.45 * e.score; break;
      case "location": score += 0.2 * e.score; break;
      case "category": score += 0.1 * e.score; break;
    }
  }
  return Math.min(1, score);
}

/* ----------------------------- engine ----------------------------- */

export async function detectDuplicates(
  client: SupabaseClient,
  reportId: string,
  facts: NewReportFacts
): Promise<{ flagged: boolean; top: DuplicateCandidate | null }> {
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

    // Only reports visible to the detection scope: same barangay first,
    // fall back to GPS-radius scan when the report has no barangay yet.
    let query = client
      .from("reports")
      .select(
        `id, title, description, category_id, latitude, longitude,
         barangay_id, status, created_at, report_photos(content_hash)`
      )
      .neq("id", reportId)
      .in("status", ["submitted", "under_review", "verified", "assigned", "in_progress"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);
    if (facts.barangayId) query = query.eq("barangay_id", facts.barangayId);

    const { data: rows } = await query;
    const candidates = (rows as unknown as Array<{
      id: string;
      title: string;
      description: string;
      category_id: string | null;
      latitude: number | null;
      longitude: number | null;
      barangay_id: string | null;
      status: string;
      report_photos: { content_hash: string | null }[] | null;
    }>) ?? [];

    const scored: DuplicateCandidate[] = [];
    for (const c of candidates) {
      const evidence: DuplicateEvidence[] = [];
      const oldHashes = (c.report_photos ?? [])
        .map((p) => p.content_hash)
        .filter((h): h is string => Boolean(h));

      for (const ev of [
        photoSignal(facts.photoHashes, oldHashes),
        textSignal(facts, c),
        locationSignal(facts, c),
        categorySignal(facts, { categoryId: c.category_id }),
      ]) {
        if (ev) evidence.push(ev);
      }

      const score = combineScore(evidence);
      if (score >= DUPLICATE_FLAG_THRESHOLD) {
        scored.push({
          reportId: c.id,
          title: c.title,
          description: c.description,
          categoryId: c.category_id,
          latitude: c.latitude,
          longitude: c.longitude,
          barangayId: c.barangay_id,
          status: c.status,
          photoHashes: oldHashes,
          score,
          evidence,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);

    if (!scored.length) return { flagged: false, top: null };

    // persist evidence rows (unique per report/signal — upsert)
    const evidenceRows = scored.flatMap((cand) =>
      cand.evidence.map((ev) => ({
        report_id: reportId,
        similar_report_id: cand.reportId,
        signal: ev.signal,
        score: ev.score,
        details: ev.details,
      }))
    );
    await client.from("report_duplicates").upsert(evidenceRows, {
      onConflict: "report_id,similar_report_id,signal",
    });

    // soft flag
    await client
      .from("reports")
      .update({ is_possible_duplicate: true })
      .eq("id", reportId);

    // notify admins
    const { data: admins } = await client.from("users").select("id").eq("role", "admin");
    if (admins?.length) {
      await client.from("notifications").insert(
        admins.map((a: { id: string }) => ({
          user_id: a.id,
          report_id: reportId,
          title: "Possible duplicate report",
          body: `Looks similar to "${scored[0].title}" (${Math.round(scored[0].score * 100)}% match) — review before triaging.`,
          type: "duplicate_review",
        }))
      );
    }

    return { flagged: true, top: scored[0] };
  } catch {
    return { flagged: false, top: null }; // advisory only
  }
}
