import { requireProfile } from "@/lib/data";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const profile = await requireProfile();
  return <ProfileClient profile={profile} />;
}
