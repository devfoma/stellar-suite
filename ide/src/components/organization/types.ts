export type OrgRole = "admin" | "editor" | "viewer";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
  avatarInitials: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  avatarInitials: string;
  memberCount: number;
  plan: "free" | "pro" | "enterprise";
  createdAt: string;
}

export const MOCK_ORGS: Organization[] = [
  { id: "org_1", name: "Stellar Labs", slug: "stellar-labs", avatarInitials: "SL", memberCount: 8, plan: "pro", createdAt: "2026-01-10T08:00:00Z" },
  { id: "org_2", name: "BernardOnuh", slug: "bernardonuh", avatarInitials: "BO", memberCount: 1, plan: "free", createdAt: "2026-02-01T10:00:00Z" },
  { id: "org_3", name: "0xVida Team", slug: "0xvida", avatarInitials: "0V", memberCount: 5, plan: "enterprise", createdAt: "2025-11-15T09:00:00Z" },
];

export const MOCK_MEMBERS: OrgMember[] = [
  { id: "m1", name: "Bernard Onuh", email: "bernard@stellar.io", role: "admin", joinedAt: "2026-01-10T08:00:00Z", avatarInitials: "BO" },
  { id: "m2", name: "Vida Osei", email: "vida@stellar.io", role: "editor", joinedAt: "2026-01-15T09:00:00Z", avatarInitials: "VO" },
  { id: "m3", name: "Akanimoh I.", email: "aki@stellar.io", role: "viewer", joinedAt: "2026-02-01T11:00:00Z", avatarInitials: "AI" },
  { id: "m4", name: "Othman Imam", email: "othman@stellar.io", role: "editor", joinedAt: "2026-02-20T14:00:00Z", avatarInitials: "OI" },
];
