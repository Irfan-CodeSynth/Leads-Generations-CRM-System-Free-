import { NextResponse } from "next/server";
import { ActiveJobsError, deleteJobs } from "@leads/db";
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

  try {
    const result = await deleteJobs(getDb(), batch.ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // The worker may still be writing, so the batch is left untouched.
    if (err instanceof ActiveJobsError) {
      return NextResponse.json(
        { error: `Stop ${err.ids.join(", ")} before deleting`, ids: err.ids },
        { status: 409 },
      );
    }
    throw err;
  }
}
