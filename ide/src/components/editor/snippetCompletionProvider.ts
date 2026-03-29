/**
 * snippetCompletionProvider.ts
 *
 * Registers a Monaco CompletionItemProvider that surfaces user snippets
 * from snippetStore as autocomplete suggestions in the IDE editor.
 *
 * Usage:
 *   import { registerSnippetCompletionProvider } from './snippetCompletionProvider';
 *   // Call once after Monaco is initialized:
 *   const disposable = registerSnippetCompletionProvider(monaco);
 *   // To clean up: disposable.dispose();
 */

import type * as Monaco from "monaco-editor";
import snippetStore from "../../store/snippetStore";

type MonacoInstance = typeof Monaco;

/**
 * Converts a Monaco snippet body string into a Monaco SnippetString.
 * The body format already matches Monaco's snippet syntax ($1, ${1:label}, $0).
 */
function bodyToSnippetString(body: string): Monaco.languages.SnippetString {
  return { value: body };
}

/**
 * Registers snippet completions for all languages (can be narrowed).
 * Returns a Disposable so the caller can unregister when needed.
 */
export function registerSnippetCompletionProvider(
  monaco: MonacoInstance,
  languages: string[] = ["rust", "typescript", "javascript", "plaintext"]
): Monaco.IDisposable {
  const disposables: Monaco.IDisposable[] = [];

  for (const lang of languages) {
    const disposable = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [],

      provideCompletionItems(
        model: Monaco.editor.ITextModel,
        position: Monaco.Position
      ): Monaco.languages.CompletionList {
        const wordInfo = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn,
        };

        const snippets = snippetStore.getAll();
        const suggestions: Monaco.languages.CompletionItem[] = snippets.map(
          (snippet) => ({
            label: {
              label: snippet.prefix,
              description: snippet.name,
              detail: ` — ${snippet.description || snippet.category}`,
            },
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.body,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: {
              value: [
                `**${snippet.name}**`,
                snippet.description ? `\n${snippet.description}` : "",
                "\n\n```rust",
                snippet.body,
                "```",
              ]
                .filter(Boolean)
                .join(""),
              isTrusted: true,
            },
            range,
            sortText: `0_${snippet.prefix}`, // float to top
            detail: `Snippet · ${snippet.category}`,
          })
        );

        return { suggestions };
      },
    });

    disposables.push(disposable);
  }

  return {
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}