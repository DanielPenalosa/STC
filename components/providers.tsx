"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { navKeyForNotification } from "@/lib/notification-nav";

type RealtimeCtx = {
  notifications: Notification[];
  unreadCount: number;
  /** unread count per dashboard nav href (see navKeyForNotification) */
  badges: Record<string, number>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<RealtimeCtx>({
  notifications: [],
  unreadCount: 0,
  badges: {},
  refresh: async () => {},
});

export function useNotifications() {
  return useContext(Ctx);
}

export function RealtimeProvider({
  userId,
  role,
  initialNotifications,
  children,
}: {
  userId: string;
  role: string;
  initialNotifications: Notification[];
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState(initialNotifications);

  const refresh = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setNotifications((data as unknown as Notification[]) ?? []);
  };

  // the provider used to start empty and only fill on a live event — the
  // bell and the nav badges had nothing to show until something happened.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // per-menu badges: unread notifications grouped by their target page
  const badges: Record<string, number> = {};
  for (const n of notifications) {
    if (n.is_read) continue;
    const key = navKeyForNotification(n, role);
    if (key) badges[key] = (badges[key] ?? 0) + 1;
  }

  return (
    <Ctx.Provider value={{ notifications, unreadCount, badges, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
