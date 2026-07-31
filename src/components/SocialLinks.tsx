"use client";

import type { PublicProfile } from "@/lib/profiles";

export default function SocialLinks({ profile }: { profile: PublicProfile }) {
  const links: { href: string; label: string; content: React.ReactNode }[] = [];

  if (profile.website_url) {
    links.push({
      href: profile.website_url,
      label: "Website",
      content: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    });
  }
  if (profile.instagram_handle) {
    links.push({
      href: `https://instagram.com/${profile.instagram_handle}`,
      label: "Instagram",
      content: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
    });
  }
  if (profile.twitter_handle) {
    links.push({
      href: `https://x.com/${profile.twitter_handle}`,
      label: "X / Twitter",
      content: <span className="text-[11px] font-bold leading-none">X</span>,
    });
  }

  if (links.length === 0) return null;

  return (
    <span className="flex items-center gap-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:opacity-70"
        >
          {link.content}
        </a>
      ))}
    </span>
  );
}
