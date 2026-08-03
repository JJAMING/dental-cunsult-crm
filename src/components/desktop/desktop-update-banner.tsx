"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { DesktopUpdateStatus } from "@/lib/local-api-client";

export function DesktopUpdateBanner() {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const desktopBridge = window.dentalConsultDesktop;

    if (!desktopBridge) {
      return;
    }

    let isMounted = true;
    void desktopBridge.getUpdateStatus().then((nextStatus) => {
      if (isMounted) {
        setStatus(nextStatus);
      }
    });

    const unsubscribe = desktopBridge.subscribeToUpdateStatus((nextStatus) => {
      if (isMounted) {
        setStatus(nextStatus);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (!status || !["available", "downloading", "downloaded"].includes(status.state)) {
    return null;
  }

  const isDownloaded = status.state === "downloaded";

  async function handleInstall() {
    if (!window.dentalConsultDesktop || isInstalling) {
      return;
    }

    setIsInstalling(true);
    await window.dentalConsultDesktop.installUpdate();
  }

  return (
    <aside className="fixed bottom-5 right-5 z-[100] w-[min(24rem,calc(100vw-2.5rem))] border border-indigo-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3">
        {isDownloaded ? (
          <Download className="mt-0.5 size-5 text-indigo-600" aria-hidden="true" />
        ) : (
          <LoaderCircle className="mt-0.5 size-5 animate-spin text-indigo-600" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {isDownloaded ? `새 버전 ${status.availableVersion} 준비 완료` : "새 버전을 내려받는 중입니다"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {isDownloaded ? "업데이트 후 다시 시작하면 적용됩니다." : `${status.progress}% 다운로드됨`}
          </p>
        </div>
      </div>
      {isDownloaded ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={isInstalling}
          className="mt-4 w-full bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isInstalling ? "업데이트 적용 중..." : "업데이트 후 다시 시작"}
        </button>
      ) : null}
    </aside>
  );
}
