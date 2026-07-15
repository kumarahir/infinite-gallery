"use client";

import { useEffect, useState } from "react";
import ProfileAvatar from "./ProfileAvatar";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function ProfileIdentityHeader({
  userId,
  displayName,
  email,
  initialAvatarPath,
}: {
  userId: string;
  displayName: string | null;
  email: string;
  initialAvatarPath: string | null;
}) {
  // The server doesn't know the visitor's local timezone, so this starts
  // null and fills in after mount — that way the first render always
  // matches the server-rendered markup (no greeting) instead of risking a
  // hydration mismatch from guessing a timezone.
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  const name = displayName || email;

  return (
    <div className="flex items-center gap-4">
      <ProfileAvatar userId={userId} initialAvatarPath={initialAvatarPath} seed={userId} size={64} />
      <div className="flex flex-col min-w-0">
        <p className="text-lg font-semibold truncate">{greeting ? `${greeting} ${name}` : name}</p>
        <p className="text-sm text-black/60 dark:text-white/60 truncate">{email}</p>
      </div>
    </div>
  );
}
