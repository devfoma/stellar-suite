import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Props {
  content: string;
  onFileClick: (path: string) => void; // Callback to open files in the IDE
}

export const MarkdownPreview = ({ content, onFileClick }: Props) => {
  return (
    // Add "prose" for automatic styling, or standard Tailwind for headers
    <div className="markdown-preview-container p-8 prose prose-slate max-w-none dark:prose-invert max-h-screen overflow-y-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          input: ({ node, ...props }) => {
            if (props.type === "checkbox") {
              return (
                <input
                  {...props}
                  disabled={false}
                  className="w-4 h-4 mr-2 cursor-pointer accent-blue-600"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    // You can add logic here to update the source text later!
                    console.log("Checkbox toggled:", e.target.checked);
                  }}
                />
              );
            }
            return <input {...props} />;
          },
          // Customizing headers so they don't look like plain text
          h1: ({ children }) => (
            <h1 className="text-3xl font-bold border-b pb-2 mb-4">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-2xl font-semibold mt-6 mb-4">{children}</h2>
          ),
          // Custom Link Logic
          a: ({ node, ...props }) => {
            const isLocal =
              props.href?.startsWith("./") || props.href?.startsWith("../");
            return (
              <a
                {...props}
                onClick={(e) => {
                  if (isLocal && props.href) {
                    e.preventDefault();
                    onFileClick(props.href);
                  }
                }}
                className="text-blue-600 hover:underline cursor-pointer"
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
