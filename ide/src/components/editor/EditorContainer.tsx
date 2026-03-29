// ide/src/components/editor/EditorContainer.tsx
import { useState } from 'react';
import { MarkdownPreview } from './MarkdownPreview';

export const EditorContainer = ({ fileContent, fileName }: { fileContent: string, fileName: string }) => {
  const [showPreview, setShowPreview] = useState(false);

  const isMarkdown = fileName.endsWith('.md');

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end p-2">
        {isMarkdown && (
          <button 
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1 bg-brand-blue text-white rounded"
          >
            {showPreview ? 'Show Source' : 'Show Preview'}
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* The Source Code Side */}
        <div className={`${showPreview ? 'hidden' : 'block'} w-full`}>
           {/* Your existing Code Editor component here */}
        </div>

        {/* The Rendered Side */}
        {showPreview && (
          <div className="w-full bg-white dark:bg-gray-900">
            <MarkdownPreview 
              content={fileContent} 
              onFileClick={(path) => console.log("Opening:", path)} 
            />
          </div>
        )}
      </div>
    </div>
  );
};