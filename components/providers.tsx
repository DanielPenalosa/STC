"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

type RealtimeCtx = {
  notifications: Notification[];
  unreadCount: number;
  refresh: () => Promise<void>;
};

const Ctx = createContext<RealtimeCtx>({
  notifications: [],
  unreadCount: 0,
  refresh: async () => {},
});

export function useNotifications() {
  return useContext(Ctx);
}

export function RealtimeProvider({
  userId,
  initialNotifications,
  children,
}: {
  userId: string;
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports" },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Ctx.Provider value={{ notifications, unreadCount, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
