import { NextResponse } from "next/server";
import { deleteLeads } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { parseIdBatch } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = currentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const batch = parseIdBatch(body);
  if (!batch.ok) return NextResponse.json({ error: batch.error }, { status: 400 });

  const result = await deleteLeads(getDb(), batch.ids);
  return NextResponse.json({ ok: true, ...result });
}
