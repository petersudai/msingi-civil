import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { isCloudConfigured } from "@/lib/cloud/config";
import { getSql } from "@/lib/db";

/**
 * Cloud backup of saved calculations. Every query is scoped to the signed-in
 * user's id, so there is no way to read or change another user's rows, and the
 * upsert refuses to overwrite a row id that belongs to someone else.
 */

export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

const itemSchema = z.object({
  id: z.uuid(),
  toolSlug: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  inputs: z
    .record(z.string().max(64), z.string().max(500))
    .refine((r) => Object.keys(r).length <= 100, "Too many input fields."),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

const bodySchema = z.object({ items: z.array(itemSchema).max(MAX_ITEMS) });

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireUser() {
  if (!isCloudConfigured()) {
    return { response: json({ error: "Accounts aren't configured in this build." }, 503) };
  }
  const user = await getCurrentUser();
  if (!user) return { response: json({ error: "Sign in to use cloud backup." }, 401) };
  return { user };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const sql = getSql();
  const rows = await sql`
    select id, tool_slug, title, inputs, created_at, updated_at
    from public.saved_calculations
    where user_id = ${user.id}
    order by created_at desc
    limit ${MAX_ITEMS}`;

  return json({
    items: rows.map((r) => ({
      id: r.id as string,
      toolSlug: r.tool_slug as string,
      title: r.title as string,
      inputs: r.inputs as Record<string, string>,
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  // Requiring JSON means a cross-site form post can't trigger a backup.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Send JSON." }, 415);
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "That request wasn't valid JSON." }, 400);
  }
  if (!parsed.success) {
    return json(
      { error: `Couldn't read those calculations (at most ${MAX_ITEMS} per backup).` },
      400,
    );
  }
  if (parsed.data.items.length === 0) return json({ saved: 0 });

  const records = parsed.data.items.map((i) => ({
    id: i.id,
    tool_slug: i.toolSlug,
    title: i.title,
    inputs: i.inputs,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }));

  const sql = getSql();
  const saved = await sql`
    insert into public.saved_calculations (id, user_id, tool_slug, title, inputs, created_at, updated_at)
    select r.id, ${user.id}::uuid, r.tool_slug, r.title, r.inputs, r.created_at, r.updated_at
    from jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
      as r(id uuid, tool_slug text, title text, inputs jsonb, created_at timestamptz, updated_at timestamptz)
    on conflict (id) do update
      set tool_slug = excluded.tool_slug,
          title = excluded.title,
          inputs = excluded.inputs,
          updated_at = excluded.updated_at
      where public.saved_calculations.user_id = excluded.user_id
    returning id`;

  return json({ saved: saved.length });
}
