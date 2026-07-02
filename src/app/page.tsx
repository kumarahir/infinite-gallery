import { createClient } from "@/lib/supabase/server";
import InfiniteGrid from "@/components/InfiniteGrid";
import AuthButton from "@/components/AuthButton";
import AuthErrorBanner from "@/components/AuthErrorBanner";
import AboutButton from "@/components/AboutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="h-dvh">
      <InfiniteGrid initialUser={user} />
      <AuthButton initialUser={user} />
      <AuthErrorBanner />
      <AboutButton />
    </div>
  );
}
