import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth/authOptions";
import { buildHashMap } from "@/lib/cloud/fileHash";
import type { WorkspaceTextFile } from "@/lib/cloud/cloudSyncService";

// ── Supabase server client ────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key);
}

// ── GET /api/projects — list user's projects ──────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, network, updated_at, files")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const projects = (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      network: row.network as string,
      updatedAt: row.updated_at as string,
      fileCount: Array.isArray(row.files) ? (row.files as unknown[]).length : 0,
    }));

    return NextResponse.json(projects);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST /api/projects — create a new project ─────────────────────────────────

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name: string;
    network: string;
    files: WorkspaceTextFile[];
    fileHashes?: Record<string, string>;
    lastKnownUpdatedAt?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, network, files, lastKnownUpdatedAt } = body;
  if (!name || !files) {
    return NextResponse.json(
      { error: "name and files are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabase();
    const fileHashes = buildHashMap(files);

    // Check if a project with this name already exists for the user (idempotent
    // creation so the UI can POST on first save without managing IDs up front).
    const { data: existing } = await supabase
      .from("projects")
      .select("id, updated_at")
      .eq("user_id", session.user.id)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      // Treat POST as an upsert when a matching name already exists
      if (
        lastKnownUpdatedAt &&
        new Date(existing.updated_at as string) > new Date(lastKnownUpdatedAt)
      ) {
        // Conflict — cloud version is newer
        const { data: cloudRow } = await supabase
          .from("projects")
          .select("*")
          .eq("id", existing.id)
          .single();

        return NextResponse.json(
          {
            cloudData: {
              id: cloudRow.id,
              name: cloudRow.name,
              network: cloudRow.network,
              files: cloudRow.files,
              fileHashes: cloudRow.file_hashes ?? {},
              updatedAt: cloudRow.updated_at,
              fileCount: Array.isArray(cloudRow.files)
                ? (cloudRow.files as unknown[]).length
                : 0,
            },
          },
          { status: 409 },
        );
      }

      const { data: updated, error } = await supabase
        .from("projects")
        .update({ files, file_hashes: fileHashes, network })
        .eq("id", existing.id)
        .select("id, updated_at")
        .single();

      if (error) throw error;
      return NextResponse.json({
        id: updated.id,
        updatedAt: updated.updated_at,
        fileHashes,
      });
    }

    const { data: created, error } = await supabase
      .from("projects")
      .insert({
        user_id: session.user.id,
        name,
        network,
        files,
        file_hashes: fileHashes,
      })
      .select("id, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json(
      { id: created.id, updatedAt: created.updated_at, fileHashes },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
