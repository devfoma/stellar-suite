/**
 * snippetStore.ts
 * User snippet persistence layer with localStorage + in-memory cache.
 * Exposes reactive helpers compatible with Zustand-style or direct import.
 */

export interface UserSnippet {
    id: string;
    name: string;
    prefix: string;
    description: string;
    body: string; // Monaco snippet string with $1, ${1:placeholder}, etc.
    category: "basic" | "advanced" | "custom";
    createdAt: number;
    updatedAt: number;
  }
  
  const STORAGE_KEY = "stellar_suite_snippets_v1";
  
  // ─── Default snippets ────────────────────────────────────────────────────────
  
  export const DEFAULT_SNIPPETS: UserSnippet[] = [
    {
      id: "default_contract",
      name: "Basic Soroban Contract",
      prefix: "soroban_contract",
      description: "Scaffold a minimal Soroban smart contract",
      category: "basic",
      createdAt: 0,
      updatedAt: 0,
      body: `#![no_std]
  use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};
  
  #[contract]
  pub struct \${1:MyContract};
  
  #[contractimpl]
  impl \${1:MyContract} {
      pub fn \${2:hello}(env: Env, to: Symbol) -> Symbol {
          symbol_short!("\${3:hello}")
      }
  }`,
    },
    {
      id: "default_storage",
      name: "Contract Storage Pattern",
      prefix: "soroban_storage",
      description: "Instance and persistent storage read/write helpers",
      category: "basic",
      createdAt: 0,
      updatedAt: 0,
      body: `// Persistent storage
  env.storage().persistent().set(&\${1:DataKey::Key}, &\${2:value});
  let \${3:val} = env.storage().persistent().get::<_, \${4:Type}>(&\${1:DataKey::Key})
      .unwrap_or(\${5:default});
  
  // Instance storage
  env.storage().instance().set(&\${6:InstanceKey::Key}, &\${7:value});`,
    },
    {
      id: "default_event",
      name: "Emit Soroban Event",
      prefix: "soroban_event",
      description: "Publish a contract event with topics and data",
      category: "basic",
      createdAt: 0,
      updatedAt: 0,
      body: `env.events().publish(
      (symbol_short!("\${1:topic}"), \${2:env.current_contract_address()}),
      \${3:data},
  );`,
    },
    {
      id: "default_upgradeable",
      name: "Upgradeable Contract Pattern",
      prefix: "soroban_upgradeable",
      description:
        "Full upgradeable contract with admin auth and WASM hash update",
      category: "advanced",
      createdAt: 0,
      updatedAt: 0,
      body: `#![no_std]
  use soroban_sdk::{
      contract, contractimpl, contracttype,
      Address, BytesN, Env,
  };
  
  #[contracttype]
  pub enum DataKey {
      Admin,
  }
  
  #[contract]
  pub struct \${1:UpgradeableContract};
  
  #[contractimpl]
  impl \${1:UpgradeableContract} {
      pub fn init(env: Env, admin: Address) {
          env.storage().instance().set(&DataKey::Admin, &admin);
      }
  
      pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
          let admin: Address = env
              .storage()
              .instance()
              .get(&DataKey::Admin)
              .unwrap();
          admin.require_auth();
          env.deployer().update_current_contract_wasm(new_wasm_hash);
      }
  
      pub fn version() -> u32 {
          \${2:1}
      }
  }`,
    },
    {
      id: "default_token_interface",
      name: "SEP-41 Token Interface",
      prefix: "soroban_token",
      description: "Implement the standard Soroban token interface stubs",
      category: "advanced",
      createdAt: 0,
      updatedAt: 0,
      body: `use soroban_sdk::{Address, Env, String};
  
  pub trait TokenInterface {
      fn allowance(e: Env, from: Address, spender: Address) -> i128;
      fn approve(e: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);
      fn balance(e: Env, id: Address) -> i128;
      fn transfer(e: Env, from: Address, to: Address, amount: i128);
      fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128);
      fn burn(e: Env, from: Address, amount: i128);
      fn burn_from(e: Env, spender: Address, from: Address, amount: i128);
      fn decimals(e: Env) -> u32;
      fn name(e: Env) -> String;
      fn symbol(e: Env) -> String;
  }`,
    },
    {
      id: "default_error_enum",
      name: "Contract Error Enum",
      prefix: "soroban_errors",
      description: "Typed contract error codes with contracterror macro",
      category: "advanced",
      createdAt: 0,
      updatedAt: 0,
      body: `use soroban_sdk::contracterror;
  
  #[contracterror]
  #[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
  #[repr(u32)]
  pub enum \${1:ContractError} {
      \${2:NotInitialized} = 1,
      \${3:Unauthorized}   = 2,
      \${4:InvalidInput}   = 3,
      \${5:Overflow}       = 4,
  }`,
    },
  ];
  
  // ─── Store class ─────────────────────────────────────────────────────────────
  
  class SnippetStore {
    private _snippets: Map<string, UserSnippet> = new Map();
    private _listeners: Set<() => void> = new Set();
  
    constructor() {
      this._load();
    }
  
    // ── Persistence ──────────────────────────────────────────────────────────
  
    private _load(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved: UserSnippet[] = raw ? JSON.parse(raw) : [];
        const savedIds = new Set(saved.map((s) => s.id));
  
        // Always keep defaults, merge with saved custom snippets
        for (const s of DEFAULT_SNIPPETS) {
          this._snippets.set(s.id, s);
        }
        for (const s of saved) {
          if (!s.id.startsWith("default_")) {
            this._snippets.set(s.id, s);
          } else {
            // Allow overriding defaults if user edited them
            this._snippets.set(s.id, s);
          }
        }
      } catch {
        for (const s of DEFAULT_SNIPPETS) {
          this._snippets.set(s.id, s);
        }
      }
    }
  
    private _persist(): void {
      try {
        const all = Array.from(this._snippets.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch (e) {
        console.warn("[SnippetStore] Failed to persist snippets:", e);
      }
    }
  
    private _notify(): void {
      this._listeners.forEach((cb) => cb());
    }
  
    // ── Public API ───────────────────────────────────────────────────────────
  
    getAll(): UserSnippet[] {
      return Array.from(this._snippets.values()).sort(
        (a, b) => a.name.localeCompare(b.name)
      );
    }
  
    getById(id: string): UserSnippet | undefined {
      return this._snippets.get(id);
    }
  
    getByPrefix(prefix: string): UserSnippet | undefined {
      return Array.from(this._snippets.values()).find(
        (s) => s.prefix === prefix
      );
    }
  
    upsert(snippet: Omit<UserSnippet, "createdAt" | "updatedAt"> & { createdAt?: number; updatedAt?: number }): UserSnippet {
      const now = Date.now();
      const existing = this._snippets.get(snippet.id);
      const next: UserSnippet = {
        ...snippet,
        createdAt: existing?.createdAt ?? snippet.createdAt ?? now,
        updatedAt: now,
      };
      this._snippets.set(next.id, next);
      this._persist();
      this._notify();
      return next;
    }
  
    delete(id: string): boolean {
      if (id.startsWith("default_")) return false; // protect defaults
      const deleted = this._snippets.delete(id);
      if (deleted) {
        this._persist();
        this._notify();
      }
      return deleted;
    }
  
    subscribe(cb: () => void): () => void {
      this._listeners.add(cb);
      return () => this._listeners.delete(cb);
    }
  
    generateId(): string {
      return `snippet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
  
    resetToDefaults(): void {
      // Remove all custom snippets, restore defaults
      for (const key of this._snippets.keys()) {
        if (!key.startsWith("default_")) {
          this._snippets.delete(key);
        }
      }
      for (const s of DEFAULT_SNIPPETS) {
        this._snippets.set(s.id, s);
      }
      this._persist();
      this._notify();
    }
  }
  
  // Singleton export
  export const snippetStore = new SnippetStore();
  export default snippetStore;