"use client";
import React, { useState } from "react";
import OrganizationSwitcher from "./OrganizationSwitcher";
import MemberManagement from "./MemberManagement";
import RoleAccessControl from "./RoleAccessControl";
import { Building2 } from "lucide-react";

export default function OrganizationPage() {
  const [tab, setTab] = useState<"members" | "roles">("members");

  return (
    <div className="min-h-screen bg-[#0a0a0c] px-6 py-8 text-sm text-white">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-400" />
            <h1 className="text-base font-semibold">Organization Settings</h1>
          </div>
          <OrganizationSwitcher />
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl border border-white/8 bg-white/3 p-1 w-fit">
          {(["members", "roles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium capitalize transition ${
                tab === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "members" ? "Members" : "Role Permissions"}
            </button>
          ))}
        </div>

        {tab === "members" && <MemberManagement />}
        {tab === "roles"   && <RoleAccessControl />}
      </div>
    </div>
  );
}
