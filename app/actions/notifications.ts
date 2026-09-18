"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/data";
import type { Notification } from "@/lib/types";

export async function getMyNotifications(): Promise<Notification[]> {
  const supabase = await createClient();
  const profile = await requireProfile();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as unknown as Notification[]) ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const profile = await requireProfile();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);
  revalidatePath("/dashboard/notifications");
}

export async function deleteNotification(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/notifications");
}

export async function deleteAllMyNotifications(): Promise<void> {
  const supabase = await createClient();
  const profile = await requireProfile();
  await supabase
    .from("notifications")
    .delete()
    .eq("user_id", profile.id);
  revalidatePath("/dashboard/notifications");
}
