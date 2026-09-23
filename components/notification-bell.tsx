"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/components/providers";
import {
  deleteNotification,
  markNotificationRead,
} from "@/app/actions/notifications";
import type { Notification } from "@/lib/types";

export function NotificationBell() {
  const { notifications, unreadCount, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function onItemClick(n: Notification) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      await refresh();
    }
    setOpen(false);
  }

  async function onDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteNotification(id);
    await refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-primary-100 transition hover:bg-white/10 hover:text-white"
        aria-label="Notifications"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[11px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <Link
              href="/dashboard/notifications"
              className="text-xs font-medium text-primary-600 hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No notifications yet.
              </p>
            )}
            {notifications.slice(0, 8).map((n) => (
              <Link
                key={n.id}
                href={n.report_id ? `/dashboard/reports/${n.report_id}` : "#"}
                onClick={() => void onItemClick(n)}
                className={`flex items-start gap-2 border-b px-4 py-3 text-sm last:border-0 hover:bg-slate-50 ${
                  n.is_read ? "" : "bg-primary-50/60"
                }`}
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.title}</span>
                  <span className="block truncate text-slate-500">{n.body}</span>
                </span>
                <button
                  onClick={(e) => void onDelete(e, n.id)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-danger-50 hover:text-danger-500"
                  aria-label="Delete notification"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
