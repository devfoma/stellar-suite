"use client";
import React, { useState } from "react";
import { ChevronDown, Plus, Check, Building2 } from "lucide-react";
import { Organization, MOCK_ORGS } from "./types";

interface Props {
  currentOrgId?: string;
  onSwitch?: (org: Organization) => void;
}

export default function OrganizationSwitcher({ currentOrgId = "org_1", onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(currentOrgId);
  const active = MOCK_ORGS.find((o) => o.id === activeId) ?? MOCK_ORGS[0];

  const handleSwitch = (org: Organization) => {
    setActiveId(org.id);
    onSwitch?.(org);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-sm text-white transition hover:bg-white/5"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-[10px] font-bold">
          {active.avatarInitials}
        </span>
        <span className="max-w-[120px] truncate font-medium">{active.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-white/10 bg-[#111114] shadow-2xl">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500">Organizations</p>
          {MOCK_ORGS.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSwitch(org)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-violet-600/80 text-[11px] font-bold text-white">
                {org.avatarInitials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">{org.name}</p>
                <p className="text-[10px] text-zinc-500 capitalize">{org.plan} · {org.memberCount} members</p>
              </div>
              {org.id === activeId && <Check className="h-3.5 w-3.5 shrink-0 text-violet-400" />}
            </button>
          ))}
          <div className="border-t border-white/8 p-2">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white">
              <Plus className="h-3.5 w-3.5" /> Create Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
