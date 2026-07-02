import { createClient } from "@/lib/supabase/server";
import InfiniteGrid from "@/components/InfiniteGrid";
import AuthButton from "@/components/AuthButton";
import AuthErrorBanner from "@/components/AuthErrorBanner";

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
    </div>
  );
}
