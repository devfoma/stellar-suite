"use client";
import React from "react";
import { Shield, Edit3, Eye, Check, X } from "lucide-react";
import { OrgRole } from "./types";

interface Permission { label: string; admin: boolean; editor: boolean; viewer: boolean; }

const PERMISSIONS: Permission[] = [
  { label: "View projects",          admin: true,  editor: true,  viewer: true  },
  { label: "Edit project files",     admin: true,  editor: true,  viewer: false },
  { label: "Run & deploy contracts", admin: true,  editor: true,  viewer: false },
  { label: "Invite members",         admin: true,  editor: false, viewer: false },
  { label: "Remove members",         admin: true,  editor: false, viewer: false },
  { label: "Change member roles",    admin: true,  editor: false, viewer: false },
  { label: "Manage billing",         admin: true,  editor: false, viewer: false },
  { label: "Delete organization",    admin: true,  editor: false, viewer: false },
];

const ROLE_META: Record<OrgRole, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  admin:  { label: "Admin",  icon: <Shield className="h-4 w-4" />, color: "text-violet-400", desc: "Full access to all settings and members" },
  editor: { label: "Editor", icon: <Edit3  className="h-4 w-4" />, color: "text-sky-400",    desc: "Can edit projects and run contracts" },
  viewer: { label: "Viewer", icon: <Eye    className="h-4 w-4" />, color: "text-zinc-400",   desc: "Read-only access to projects" },
};

export default function RoleAccessControl() {
  return (
    <div className="w-full rounded-xl border border-white/8 bg-[#111114]">
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Role Permissions</h2>
        <p className="text-xs text-zinc-500">Access levels for each role in your organization</p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-3 gap-3 border-b border-white/8 p-4">
        {(Object.keys(ROLE_META) as OrgRole[]).map((role) => {
          const meta = ROLE_META[role];
          return (
            <div key={role} className="rounded-lg border border-white/8 bg-white/3 p-3">
              <div className={`flex items-center gap-2 mb-1 ${meta.color}`}>
                {meta.icon}
                <span className="text-xs font-semibold">{meta.label}</span>
              </div>
              <p className="text-[11px] text-zinc-500">{meta.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Permission matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/8">
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Permission</th>
              {(Object.keys(ROLE_META) as OrgRole[]).map((role) => (
                <th key={role} className={`px-4 py-3 text-center font-semibold ${ROLE_META[role].color}`}>
                  {ROLE_META[role].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr key={perm.label} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition">
                <td className="px-5 py-2.5 text-zinc-300">{perm.label}</td>
                {(["admin", "editor", "viewer"] as OrgRole[]).map((role) => (
                  <td key={role} className="px-4 py-2.5 text-center">
                    {perm[role]
                      ? <Check className="mx-auto h-3.5 w-3.5 text-emerald-400" />
                      : <X     className="mx-auto h-3.5 w-3.5 text-zinc-700" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
