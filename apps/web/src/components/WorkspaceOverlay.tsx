"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function WorkspaceOverlay({ children, className, label, onClose }: { children: ReactNode; className: string; label: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function close() {
    if (!dialog.current?.querySelector('[aria-busy="true"]')) onClose();
  }
  return <dialog ref={dialog} className={className} aria-label={label} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>{children}</dialog>;
}
