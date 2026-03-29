/**
 * SnippetEditor.tsx
 * Settings modal panel – Snippets library editor.
 *
 * Features:
 *  - List / create / edit / delete user snippets
 *  - Monaco snippet string format (tab-stops, placeholders)
 *  - Category filter (basic | advanced | custom)
 *  - Live preview of the snippet body
 *  - Persists via snippetStore (localStorage)
 */

import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
    FC,
  } from "react";
  import snippetStore, {
    UserSnippet,
    DEFAULT_SNIPPETS,
  } from "../../store/snippetStore";
  
  // ─── Types ───────────────────────────────────────────────────────────────────
  
  type Category = "all" | "basic" | "advanced" | "custom";
  
  interface FormState {
    id: string;
    name: string;
    prefix: string;
    description: string;
    body: string;
    category: "basic" | "advanced" | "custom";
  }
  
  const EMPTY_FORM: FormState = {
    id: "",
    name: "",
    prefix: "",
    description: "",
    body: "",
    category: "custom",
  };
  
  // ─── Helpers ─────────────────────────────────────────────────────────────────
  
  function snippetToForm(s: UserSnippet): FormState {
    return {
      id: s.id,
      name: s.name,
      prefix: s.prefix,
      description: s.description,
      body: s.body,
      category: s.category,
    };
  }
  
  function isDefaultSnippet(id: string): boolean {
    return id.startsWith("default_");
  }
  
  // ─── Sub-components ──────────────────────────────────────────────────────────
  
  interface CategoryBadgeProps {
    category: UserSnippet["category"];
  }
  
  const CategoryBadge: FC<CategoryBadgeProps> = ({ category }) => {
    const styles: Record<string, React.CSSProperties> = {
      basic: { background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" },
      advanced: { background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)" },
      custom: { background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" },
    };
    return (
      <span style={{
        ...styles[category],
        fontSize: "10px",
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: "4px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        flexShrink: 0,
      }}>
        {category}
      </span>
    );
  };
  
  // ─── Main Component ───────────────────────────────────────────────────────────
  
  interface SnippetEditorProps {
    /** Optional: called when user triggers a snippet to test it */
    onInsertToEditor?: (body: string) => void;
  }
  
  const SnippetEditor: FC<SnippetEditorProps> = ({ onInsertToEditor }) => {
    const [snippets, setSnippets] = useState<UserSnippet[]>(snippetStore.getAll());
    const [filter, setFilter] = useState<Category>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [isEditing, setIsEditing] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
  
    // Subscribe to store changes
    useEffect(() => {
      const unsub = snippetStore.subscribe(() => {
        setSnippets(snippetStore.getAll());
      });
      return unsub;
    }, []);
  
    // Toast auto-dismiss
    useEffect(() => {
      if (!toastMsg) return;
      const t = setTimeout(() => setToastMsg(null), 2500);
      return () => clearTimeout(t);
    }, [toastMsg]);
  
    const showToast = (msg: string) => setToastMsg(msg);
  
    // ── Filtering ─────────────────────────────────────────────────────────────
  
    const filteredSnippets = snippets.filter((s) => {
      const matchCat = filter === "all" || s.category === filter;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.prefix.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  
    // ── Selection ─────────────────────────────────────────────────────────────
  
    const selectSnippet = (id: string) => {
      if (isDirty) {
        const ok = window.confirm("Discard unsaved changes?");
        if (!ok) return;
      }
      setSelected(id);
      const s = snippetStore.getById(id);
      if (s) {
        setForm(snippetToForm(s));
        setIsEditing(false);
        setIsDirty(false);
        setErrors({});
      }
    };
  
    const newSnippet = () => {
      if (isDirty) {
        const ok = window.confirm("Discard unsaved changes?");
        if (!ok) return;
      }
      const id = snippetStore.generateId();
      setSelected(null);
      setForm({ ...EMPTY_FORM, id });
      setIsEditing(true);
      setIsDirty(false);
      setErrors({});
    };
  
    // ── Form handling ─────────────────────────────────────────────────────────
  
    const handleChange = <K extends keyof FormState>(key: K, val: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setIsDirty(true);
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };
  
    const validate = (): boolean => {
      const e: Partial<Record<keyof FormState, string>> = {};
      if (!form.name.trim()) e.name = "Name is required";
      if (!form.prefix.trim()) e.prefix = "Prefix is required";
      else if (!/^[a-z0-9_]+$/i.test(form.prefix))
        e.prefix = "Only letters, numbers, underscores";
      if (!form.body.trim()) e.body = "Snippet body cannot be empty";
      // Check prefix uniqueness
      const existing = snippetStore.getByPrefix(form.prefix.trim());
      if (existing && existing.id !== form.id)
        e.prefix = `Prefix "${form.prefix}" is already used by "${existing.name}"`;
      setErrors(e);
      return Object.keys(e).length === 0;
    };
  
    const handleSave = () => {
      if (!validate()) return;
      snippetStore.upsert({
        ...form,
        name: form.name.trim(),
        prefix: form.prefix.trim(),
        description: form.description.trim(),
      });
      setSelected(form.id);
      setIsEditing(false);
      setIsDirty(false);
      showToast("Snippet saved ✓");
    };
  
    const handleCancel = () => {
      if (selected) {
        const s = snippetStore.getById(selected);
        if (s) setForm(snippetToForm(s));
      } else {
        setForm(EMPTY_FORM);
        setSelected(null);
      }
      setIsEditing(false);
      setIsDirty(false);
      setErrors({});
    };
  
    const handleDelete = (id: string) => {
      setConfirmDelete(id);
    };
  
    const confirmDeleteSnippet = () => {
      if (!confirmDelete) return;
      snippetStore.delete(confirmDelete);
      if (selected === confirmDelete) {
        setSelected(null);
        setForm(EMPTY_FORM);
        setIsEditing(false);
      }
      setConfirmDelete(null);
      showToast("Snippet deleted");
    };
  
    const handleEdit = () => setIsEditing(true);
  
    const handleReset = () => {
      const ok = window.confirm(
        "This will remove all custom snippets and restore defaults. Continue?"
      );
      if (ok) {
        snippetStore.resetToDefaults();
        setSelected(null);
        setForm(EMPTY_FORM);
        setIsEditing(false);
        showToast("Snippets reset to defaults");
      }
    };
  
    const insertTabStop = (text: string) => {
      const ta = bodyRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = form.body.substring(0, start);
      const after = form.body.substring(end);
      const newBody = before + text + after;
      handleChange("body", newBody);
      // Re-focus and position cursor
      setTimeout(() => {
        ta.focus();
        const pos = start + text.length;
        ta.setSelectionRange(pos, pos);
      }, 0);
    };
  
    // ─── Styles ───────────────────────────────────────────────────────────────
  
    const s = {
      root: {
        display: "flex",
        height: "100%",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "13px",
        color: "#e2e8f0",
        background: "transparent",
      } as React.CSSProperties,
  
      // LEFT PANEL
      list: {
        width: "260px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column" as const,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      },
      listHeader: {
        padding: "12px 12px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column" as const,
        gap: "8px",
      },
      searchInput: {
        width: "100%",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "6px",
        padding: "6px 10px",
        color: "#e2e8f0",
        fontSize: "12px",
        outline: "none",
        boxSizing: "border-box" as const,
      },
      filterBar: {
        display: "flex",
        gap: "4px",
      },
      filterBtn: (active: boolean): React.CSSProperties => ({
        padding: "3px 8px",
        borderRadius: "4px",
        border: "1px solid",
        fontSize: "11px",
        cursor: "pointer",
        fontWeight: 500,
        transition: "all 0.15s",
        background: active ? "rgba(245,158,11,0.2)" : "transparent",
        borderColor: active ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.12)",
        color: active ? "#fbbf24" : "#94a3b8",
      }),
      newBtn: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "5px 10px",
        background: "rgba(245,158,11,0.15)",
        border: "1px solid rgba(245,158,11,0.4)",
        borderRadius: "6px",
        color: "#fbbf24",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: 600,
        width: "100%",
        justifyContent: "center",
      } as React.CSSProperties,
      listItems: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "6px",
      },
      listItem: (active: boolean, isDefault: boolean): React.CSSProperties => ({
        padding: "8px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        marginBottom: "2px",
        background: active ? "rgba(245,158,11,0.1)" : "transparent",
        border: `1px solid ${active ? "rgba(245,158,11,0.35)" : "transparent"}`,
        transition: "all 0.12s",
      }),
      itemName: {
        fontWeight: 600,
        fontSize: "12px",
        color: "#f1f5f9",
        marginBottom: "2px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      } as React.CSSProperties,
      itemPrefix: {
        fontSize: "11px",
        color: "#64748b",
        fontFamily: "monospace",
      },
  
      // RIGHT PANEL
      detail: {
        flex: 1,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
      },
      detailHeader: {
        padding: "12px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
      detailTitle: {
        fontWeight: 700,
        fontSize: "14px",
        color: "#f8fafc",
      },
      detailActions: {
        display: "flex",
        gap: "6px",
      },
      btn: (variant: "primary" | "ghost" | "danger" | "subtle"): React.CSSProperties => {
        const map = {
          primary: { bg: "rgba(245,158,11,0.2)", border: "rgba(245,158,11,0.5)", color: "#fbbf24" },
          ghost: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: "#94a3b8" },
          danger: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)", color: "#f87171" },
          subtle: { bg: "transparent", border: "rgba(255,255,255,0.1)", color: "#64748b" },
        }[variant];
        return {
          padding: "4px 12px",
          borderRadius: "5px",
          border: `1px solid ${map.border}`,
          background: map.bg,
          color: map.color,
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 500,
        };
      },
      detailBody: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "12px",
      },
      field: {
        display: "flex",
        flexDirection: "column" as const,
        gap: "4px",
      },
      label: {
        fontSize: "11px",
        fontWeight: 600,
        color: "#64748b",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
      },
      input: (hasError: boolean): React.CSSProperties => ({
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: "6px",
        padding: "7px 10px",
        color: "#e2e8f0",
        fontSize: "13px",
        outline: "none",
        fontFamily: "inherit",
      }),
      textarea: (hasError: boolean): React.CSSProperties => ({
        background: "rgba(0,0,0,0.3)",
        border: `1px solid ${hasError ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: "6px",
        padding: "10px",
        color: "#a5f3fc",
        fontSize: "12px",
        outline: "none",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        resize: "vertical" as const,
        minHeight: "140px",
        lineHeight: 1.6,
      }),
      errorText: {
        fontSize: "11px",
        color: "#f87171",
        marginTop: "2px",
      },
      codePreview: {
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "6px",
        padding: "12px",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: "12px",
        color: "#a5f3fc",
        whiteSpace: "pre-wrap" as const,
        overflowX: "auto" as const,
        maxHeight: "200px",
        overflowY: "auto" as const,
      },
      tabStopBar: {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap" as const,
        marginTop: "4px",
      },
      chipBtn: {
        padding: "2px 8px",
        background: "rgba(168,85,247,0.1)",
        border: "1px solid rgba(168,85,247,0.3)",
        borderRadius: "4px",
        color: "#c084fc",
        cursor: "pointer",
        fontSize: "11px",
        fontFamily: "monospace",
      } as React.CSSProperties,
      empty: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column" as const,
        gap: "8px",
        color: "#475569",
      },
      emptyIcon: {
        fontSize: "32px",
        marginBottom: "4px",
      },
      readonlyRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        background: "rgba(255,255,255,0.03)",
        borderRadius: "5px",
        fontSize: "12px",
      } as React.CSSProperties,
      readonlyLabel: {
        color: "#64748b",
        width: "80px",
        flexShrink: 0,
      },
      readonlyValue: {
        color: "#cbd5e1",
        fontFamily: "monospace",
      },
  
      // Toast
      toast: {
        position: "absolute" as const,
        bottom: "16px",
        right: "16px",
        background: "rgba(34,197,94,0.15)",
        border: "1px solid rgba(34,197,94,0.4)",
        color: "#4ade80",
        padding: "7px 14px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: 600,
        pointerEvents: "none" as const,
        zIndex: 100,
      },
  
      // Footer
      footer: {
        padding: "8px 16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      },
      footerHint: {
        fontSize: "11px",
        color: "#334155",
      },
    };
  
    // ─── Render ───────────────────────────────────────────────────────────────
  
    const selectedSnippet = selected ? snippetStore.getById(selected) : null;
    const canDelete = selected && !isDefaultSnippet(selected);
  
    return (
      <div style={{ ...s.root, position: "relative" }}>
        {/* ── LEFT LIST ── */}
        <div style={s.list}>
          <div style={s.listHeader}>
            <input
              style={s.searchInput}
              placeholder="Search snippets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={s.filterBar}>
              {(["all", "basic", "advanced", "custom"] as Category[]).map((c) => (
                <button
                  key={c}
                  style={s.filterBtn(filter === c)}
                  onClick={() => setFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <button style={s.newBtn} onClick={newSnippet}>
              <span style={{ fontSize: "14px" }}>＋</span> New Snippet
            </button>
          </div>
  
          <div style={s.listItems}>
            {filteredSnippets.length === 0 && (
              <div style={{ color: "#475569", padding: "12px", fontSize: "12px", textAlign: "center" }}>
                No snippets found
              </div>
            )}
            {filteredSnippets.map((sn) => (
              <div
                key={sn.id}
                style={s.listItem(selected === sn.id, isDefaultSnippet(sn.id))}
                onClick={() => selectSnippet(sn.id)}
              >
                <div style={s.itemName}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sn.name}
                  </span>
                  <CategoryBadge category={sn.category} />
                </div>
                <div style={s.itemPrefix}>⌨ {sn.prefix}</div>
              </div>
            ))}
          </div>
        </div>
  
        {/* ── RIGHT DETAIL / FORM ── */}
        <div style={s.detail}>
          {/* Header */}
          <div style={s.detailHeader}>
            <div style={s.detailTitle}>
              {isEditing
                ? selected
                  ? "Edit Snippet"
                  : "New Snippet"
                : selectedSnippet
                ? selectedSnippet.name
                : "Snippets"}
            </div>
            <div style={s.detailActions}>
              {!isEditing && selectedSnippet && (
                <>
                  {onInsertToEditor && (
                    <button
                      style={s.btn("subtle")}
                      title="Insert into active editor"
                      onClick={() => onInsertToEditor(selectedSnippet.body)}
                    >
                      ↗ Insert
                    </button>
                  )}
                  <button style={s.btn("ghost")} onClick={handleEdit}>
                    ✎ Edit
                  </button>
                  {canDelete && (
                    <button
                      style={s.btn("danger")}
                      onClick={() => handleDelete(selected!)}
                    >
                      ✕ Delete
                    </button>
                  )}
                </>
              )}
              {isEditing && (
                <>
                  <button style={s.btn("ghost")} onClick={handleCancel}>
                    Cancel
                  </button>
                  <button style={s.btn("primary")} onClick={handleSave}>
                    Save Snippet
                  </button>
                </>
              )}
            </div>
          </div>
  
          {/* Body */}
          <div style={s.detailBody}>
            {/* ── EMPTY STATE ── */}
            {!isEditing && !selectedSnippet && (
              <div style={s.empty}>
                <div style={s.emptyIcon}>⟨/⟩</div>
                <div style={{ fontWeight: 600, color: "#334155" }}>No snippet selected</div>
                <div style={{ fontSize: "12px" }}>
                  Choose from the list or create a new one
                </div>
              </div>
            )}
  
            {/* ── EDIT / CREATE FORM ── */}
            {isEditing && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={s.field}>
                    <label style={s.label}>Name *</label>
                    <input
                      style={s.input(!!errors.name)}
                      placeholder="Upgradeable Contract"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                    />
                    {errors.name && <span style={s.errorText}>{errors.name}</span>}
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Prefix * (trigger word)</label>
                    <input
                      style={s.input(!!errors.prefix)}
                      placeholder="soroban_upgrade"
                      value={form.prefix}
                      onChange={(e) => handleChange("prefix", e.target.value.toLowerCase())}
                    />
                    {errors.prefix && <span style={s.errorText}>{errors.prefix}</span>}
                  </div>
                </div>
  
                <div style={s.field}>
                  <label style={s.label}>Description</label>
                  <input
                    style={s.input(false)}
                    placeholder="Short description shown in autocomplete"
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                  />
                </div>
  
                <div style={s.field}>
                  <label style={s.label}>Category</label>
                  <select
                    style={{ ...s.input(false), cursor: "pointer" }}
                    value={form.category}
                    onChange={(e) =>
                      handleChange("category", e.target.value as FormState["category"])
                    }
                  >
                    <option value="basic">Basic</option>
                    <option value="advanced">Advanced</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
  
                <div style={s.field}>
                  <label style={{ ...s.label, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Snippet Body * (Monaco format)</span>
                    <div style={s.tabStopBar}>
                      <button style={s.chipBtn} onClick={() => insertTabStop("$0")}>$0</button>
                      <button style={s.chipBtn} onClick={() => insertTabStop("$1")}>$1</button>
                      <button style={s.chipBtn} onClick={() => insertTabStop("${1:name}")}>${"{1:name}"}</button>
                      <button style={s.chipBtn} onClick={() => insertTabStop("${2:value}")}>${"{2:val}"}</button>
                      <button style={s.chipBtn} onClick={() => insertTabStop("${TM_SELECTED_TEXT}")}>${"{TM_SEL}"}</button>
                    </div>
                  </label>
                  <textarea
                    ref={bodyRef}
                    style={s.textarea(!!errors.body)}
                    placeholder={`pub fn \${1:function_name}(env: Env) -> \${2:ReturnType} {\n    \$0\n}`}
                    value={form.body}
                    onChange={(e) => handleChange("body", e.target.value)}
                    rows={10}
                    spellCheck={false}
                  />
                  {errors.body && <span style={s.errorText}>{errors.body}</span>}
                  <div style={{ fontSize: "11px", color: "#334155", marginTop: "2px" }}>
                    Use <code style={{ color: "#7dd3fc" }}>$1</code>, <code style={{ color: "#7dd3fc" }}>${"{1:placeholder}"}</code> for tab-stops. <code style={{ color: "#7dd3fc" }}>$0</code> = final cursor.
                  </div>
                </div>
              </>
            )}
  
            {/* ── READ-ONLY VIEW ── */}
            {!isEditing && selectedSnippet && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {[
                    ["Prefix", selectedSnippet.prefix],
                    ["Category", selectedSnippet.category],
                    ["Description", selectedSnippet.description || "—"],
                  ].map(([label, value]) => (
                    <div key={label} style={s.readonlyRow}>
                      <span style={s.readonlyLabel}>{label}</span>
                      <span style={s.readonlyValue}>{value}</span>
                    </div>
                  ))}
                </div>
  
                <div style={s.field}>
                  <label style={s.label}>Snippet Body</label>
                  <pre style={s.codePreview}>{selectedSnippet.body}</pre>
                </div>
  
                {isDefaultSnippet(selectedSnippet.id) && (
                  <div style={{
                    fontSize: "11px",
                    color: "#64748b",
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "5px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    🔒 This is a built-in snippet. You can edit a copy of it.
                  </div>
                )}
              </>
            )}
          </div>
  
          {/* Footer */}
          <div style={s.footer}>
            <span style={s.footerHint}>
              {snippets.length} snippet{snippets.length !== 1 ? "s" : ""} •{" "}
              {snippets.filter((x) => !isDefaultSnippet(x.id)).length} custom
            </span>
            <button style={s.btn("subtle")} onClick={handleReset}>
              Reset to defaults
            </button>
          </div>
        </div>
  
        {/* Delete confirmation overlay */}
        {confirmDelete && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50,
            borderRadius: "8px",
          }}>
            <div style={{
              background: "#1e2535",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              padding: "20px 24px",
              width: "320px",
              display: "flex", flexDirection: "column", gap: "14px",
            }}>
              <div style={{ fontWeight: 700, color: "#f1f5f9" }}>Delete Snippet?</div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                "{snippetStore.getById(confirmDelete)?.name}" will be permanently removed.
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button style={s.btn("ghost")} onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button style={s.btn("danger")} onClick={confirmDeleteSnippet}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* Toast */}
        {toastMsg && <div style={s.toast}>{toastMsg}</div>}
      </div>
    );
  };
  
  export default SnippetEditor;