import { requireProfile } from "@/lib/data";
import { getBranding } from "@/lib/branding";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const [profile, branding] = await Promise.all([
    requireProfile(),
    getBranding(),
  ]);
  return <ProfileClient profile={profile} branding={branding} />;
}
