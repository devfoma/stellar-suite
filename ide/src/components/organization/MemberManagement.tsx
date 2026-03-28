"use client";
import React, { useState } from "react";
import { Mail, UserPlus, Trash2, Shield, Eye, Edit3 } from "lucide-react";
import { OrgMember, OrgRole, MOCK_MEMBERS } from "./types";

const ROLE_STYLES: Record<OrgRole, string> = {
  admin:  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  editor: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

const ROLE_ICONS: Record<OrgRole, React.ReactNode> = {
  admin:  <Shield className="h-3 w-3" />,
  editor: <Edit3 className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
};

export default function MemberManagement() {
  const [members, setMembers] = useState<OrgMember[]>(MOCK_MEMBERS);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("viewer");
  const [error, setError] = useState("");

  const handleInvite = () => {
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    if (members.find((m) => m.email === email)) { setError("Member already exists."); return; }
    const initials = email.slice(0, 2).toUpperCase();
    setMembers((prev) => [...prev, {
      id: `m_${Date.now()}`, name: email.split("@")[0], email,
      role, joinedAt: new Date().toISOString(), avatarInitials: initials,
    }]);
    setEmail(""); setError("");
  };

  const handleRemove = (id: string) => setMembers((prev) => prev.filter((m) => m.id !== id));

  const handleRoleChange = (id: string, newRole: OrgRole) =>
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, role: newRole } : m));

  return (
    <div className="w-full rounded-xl border border-white/8 bg-[#111114]">
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Members</h2>
        <p className="text-xs text-zinc-500">{members.length} members in this organization</p>
      </div>

      {/* Invite form */}
      <div className="border-b border-white/8 px-5 py-4">
        <p className="mb-3 text-xs font-medium text-zinc-400">Invite by Email</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="colleague@example.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            onClick={handleInvite}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </button>
        </div>
        {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
      </div>

      {/* Member list */}
      <div>
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs font-bold text-violet-400">
              {member.avatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{member.name}</p>
              <p className="truncate text-[11px] text-zinc-500">{member.email}</p>
            </div>
            <select
              value={member.role}
              onChange={(e) => handleRoleChange(member.id, e.target.value as OrgRole)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium focus:outline-none ${ROLE_STYLES[member.role]} bg-transparent`}
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={() => handleRemove(member.id)}
              className="rounded p-1 text-zinc-600 transition hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
