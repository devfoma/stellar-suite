import { NextRequest, NextResponse } from "next/server";

import type { RustWorkspacePayload } from "../../_lib/rustTooling";
import { createSorobanFuzzTemplate } from "@/lib/fuzzing/templateGenerator";

export const runtime = "nodejs";

interface InitFuzzPayload extends RustWorkspacePayload {
  targetName?: string;
}

export async function POST(request: NextRequest) {
  let payload: InitFuzzPayload;

  try {
    payload = (await request.json()) as InitFuzzPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload.contractName?.trim()) {
    return NextResponse.json({ error: "contractName is required." }, { status: 400 });
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return NextResponse.json({ error: "files[] payload is required." }, { status: 400 });
  }

  const template = createSorobanFuzzTemplate({
    contractName: payload.contractName,
    files: payload.files,
    targetName: payload.targetName,
  });

  return NextResponse.json({
    targetName: template.targetName,
    crateName: template.crateName,
    contractStructName: template.contractStructName,
    files: template.files,
  });
}
