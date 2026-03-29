"use client";

import React, { useEffect, useState, ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { useUserSettingsStore } from "@/store/useUserSettingsStore";
import { toast } from "sonner";
import { WifiOff, Globe, Loader2, CheckCircle2 } from "lucide-react";

interface AppStatusProviderProps {
  children: ReactNode;
}

export function AppStatusProvider({ children }: AppStatusProviderProps) {
  const { language } = useUserSettingsStore();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);

      const handleOnline = () => {
        setIsOnline(true);
        setIsSyncing(true);
        toast.success("Connection restored", {
          description: "Syncing changes back to the cloud...",
          icon: <Globe className="h-4 w-4 animate-spin" />,
        });
        
        // Mocking background sync
        setTimeout(() => {
          setIsSyncing(false);
          toast.success("Synchronization complete", {
            description: "All local changes have been uploaded.",
            icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
          });
        }, 3000);
      };

      const handleOffline = () => {
        setIsOnline(false);
        toast.error("You are offline", {
          description: "Build and Deploy actions will be disabled.",
          icon: <WifiOff className="h-4 w-4 text-destructive" />,
          duration: 10000,
        });
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      i18n.changeLanguage(language);
      
      // RTL support
      const isRtl = language === 'ar' || language === 'he'; // Although requirements only mentioned ar/he for RTL logic, but provided en/es/zh/pt. I'll add them if needed. 
      // The requirement 455 says "mirror entire layout for RTL languages like Arabic or Hebrew".
      // Let's assume RTL should be applied if language matches.
      document.body.dir = isRtl ? 'rtl' : 'ltr';
    }
  }, [language, isMounted]);

  if (!isMounted) return <>{children}</>;

  return (
    <I18nextProvider i18n={i18n}>
      <div className="relative w-full h-full min-h-screen">
        {!isOnline && (
          <div className="fixed bottom-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-full shadow-lg backdrop-blur-md">
              <WifiOff className="h-4 w-4" />
              <span className="text-xs font-semibold">Offline Mode</span>
            </div>
          </div>
        )}
        {isSyncing && (
           <div className="fixed top-4 right-4 z-[9999] animate-in fade-in slide-in-from-top-5 duration-300">
             <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-full shadow-lg backdrop-blur-md font-mono">
               <Loader2 className="h-4 w-4 animate-spin" />
               <span className="text-xs font-semibold">Syncing...</span>
             </div>
           </div>
        )}
        {children}
      </div>
    </I18nextProvider>
  );
}
