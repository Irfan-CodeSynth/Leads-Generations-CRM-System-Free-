import { NextResponse } from "next/server";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { wakeWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 20;

function cleanList(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const items = input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  if (items.length === 0 || items.length > MAX_ITEMS) return null;
  return items;
}

export async function POST(req: Request) {
  const uid = currentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { keywords?: unknown; locations?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const keywords = cleanList(body.keywords);
  const locations = cleanList(body.locations);
  if (!keywords) {
    return NextResponse.json({ error: `keywords must have 1-${MAX_ITEMS} entries` }, { status: 400 });
  }
  if (!locations) {
    return NextResponse.json({ error: `locations must have 1-${MAX_ITEMS} entries` }, { status: 400 });
  }

  const [created] = await getDb()
    .insert(jobs)
    .values({ keywords, locations, status: "pending", createdBy: uid })
    .returning({ id: jobs.id });

  wakeWorker();
  return NextResponse.json({ id: created.id }, { status: 201 });
}
