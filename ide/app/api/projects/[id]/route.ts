import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/lib/auth/authOptions";
import { buildHashMap } from "@/lib/cloud/fileHash";
import type { WorkspaceTextFile } from "@/lib/cloud/cloudSyncService";

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

// ── GET /api/projects/[id] — fetch a single project ──────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      network: data.network,
      files: data.files,
      fileHashes: data.file_hashes ?? {},
      updatedAt: data.updated_at,
      fileCount: Array.isArray(data.files) ? (data.files as unknown[]).length : 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PUT /api/projects/[id] — update a project ────────────────────────────────
//
// Performs optimistic concurrency control: if the cloud copy has been updated
// after the client's lastKnownUpdatedAt, returns 409 Conflict with the cloud
// data so the client can show a resolution modal.

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: {
    name?: string;
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

  try {
    const supabase = getSupabase();

    // Fetch current cloud version to check for conflicts
    const { data: current, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Conflict detection
    if (
      lastKnownUpdatedAt &&
      new Date(current.updated_at as string) > new Date(lastKnownUpdatedAt)
    ) {
      return NextResponse.json(
        {
          cloudData: {
            id: current.id,
            name: current.name,
            network: current.network,
            files: current.files,
            fileHashes: current.file_hashes ?? {},
            updatedAt: current.updated_at,
            fileCount: Array.isArray(current.files)
              ? (current.files as unknown[]).length
              : 0,
          },
        },
        { status: 409 },
      );
    }

    const fileHashes = buildHashMap(files);
    const updatePayload: Record<string, unknown> = {
      files,
      file_hashes: fileHashes,
      network,
    };
    if (name) updatePayload.name = name;

    const { data: updated, error: updateError } = await supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", id)
      .select("id, updated_at")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      id: updated.id,
      updatedAt: updated.updated_at,
      fileHashes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
