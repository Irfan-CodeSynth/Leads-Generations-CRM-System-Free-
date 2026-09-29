import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getLeadsForJob } from "@/lib/queries";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Name",
  "Phone",
  "Email(s)",
  "Address",
  "Website",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Twitter",
  "YouTube",
  "Category",
  "Rating",
  "Reviews",
  "Maps URL",
  "Status",
  "Notes",
];

function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const uid = currentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const jobId = Number(url.searchParams.get("jobId"));
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const idsParam = url.searchParams.get("ids");
  const onlyIds = idsParam
    ? idsParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n))
    : undefined;

  const rows = await getLeadsForJob(jobId, onlyIds);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${HEADERS.map(cell).join(",")}\r\n`));
      for (const r of rows) {
        const line = [
          r.name,
          r.phone,
          r.emails ? r.emails.join("; ") : null,
          r.address,
          r.website,
          r.instagram,
          r.facebook,
          r.linkedin,
          r.twitter,
          r.youtube,
          r.category,
          r.rating,
          r.reviewCount,
          r.mapsUrl,
          r.status,
          r.notes,
        ]
          .map(cell)
          .join(",");
        controller.enqueue(encoder.encode(`${line}\r\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${jobId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
