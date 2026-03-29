import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";

interface HotkeysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShortcutCategory = "Navigation" | "Editor" | "Git" | "Build";

interface Shortcut {
  keys: {
    mac: string[];
    other: string[];
  };
  description: string;
  category: ShortcutCategory;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: { mac: ["⌘", "P"], other: ["Ctrl", "P"] }, description: "Open file finder", category: "Navigation" },
  { keys: { mac: ["⌘", "⇧", "F"], other: ["Ctrl", "Shift", "F"] }, description: "Search in files", category: "Navigation" },
  { keys: { mac: ["⌘", "K"], other: ["Ctrl", "K"] }, description: "Toggle command palette", category: "Navigation" },
  
  // Editor
  { keys: { mac: ["⌘", "S"], other: ["Ctrl", "S"] }, description: "Save current file", category: "Editor" },
  { keys: { mac: ["⌘", "/"], other: ["Ctrl", "/"] }, description: "Show keyboard shortcuts", category: "Editor" },
  { keys: { mac: ["?"], other: ["?"] }, description: "Show keyboard shortcuts (Alternative)", category: "Editor" },
  { keys: { mac: ["Esc"], other: ["Esc"] }, description: "Close modal/palette", category: "Editor" },
  
  // Build
  { keys: { mac: ["⌘", "B"], other: ["Ctrl", "B"] }, description: "Build project", category: "Build" },
  
  // Git
  { keys: { mac: ["⌘", "↵"], other: ["Ctrl", "Enter"] }, description: "Commit changes", category: "Git" },
  { keys: { mac: ["⌘", "⇧", "G"], other: ["Ctrl", "Shift", "G"] }, description: "Open source control", category: "Git" },
];

const KeyCombo = ({ keys }: { keys: string[] }) => {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <div key={index} className="flex items-center">
          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">
            {key}
          </span>
          {index < keys.length - 1 && (
            <span className="mx-1 text-gray-500">+</span>
          )}
        </div>
      ))}
    </div>
  );
};

export const HotkeysModal = ({ open, onOpenChange }: HotkeysModalProps) => {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Basic OS detection
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));
    
    const handleOpenHotkeys = () => onOpenChange(true);
    window.addEventListener('ide:open-hotkeys', handleOpenHotkeys);
    return () => window.removeEventListener('ide:open-hotkeys', handleOpenHotkeys);
  }, [onOpenChange]);

  const categories: ShortcutCategory[] = ["Navigation", "Editor", "Git", "Build"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Common keyboard shortcuts to navigate the IDE faster
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-2">
          {categories.map(category => {
            const categoryShortcuts = shortcuts.filter(s => s.category === category);
            if (categoryShortcuts.length === 0) return null;
            
            return (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">
                  {category}
                </h4>
                <div className="space-y-1">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <KeyCombo keys={isMac ? shortcut.keys.mac : shortcut.keys.other} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
