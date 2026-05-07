import Link from "next/link";
import { PrivacyPromise } from "@/components/PrivacyPromise";
import { HomeStatusCards } from "@/components/HomeStatusCards";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-16 pb-20">
      <div className="space-y-6">
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-ink text-balance">
          Your coding agent is working.
          <br />
          You do not have to stare at the terminal.
        </h1>
        <p className="text-lg text-muted text-balance max-w-xl">
          A lounge for the minutes between Claude&apos;s turns. The browser pings you back when Claude needs you.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/lounge" className="btn-primary">
            Open the lounge
          </Link>
          <Link href="/settings" className="btn-secondary">
            Install the hook
          </Link>
        </div>
      </div>

      <div className="mt-16">
        <HomeStatusCards />
      </div>

      <div className="mt-12">
        <PrivacyPromise />
      </div>
    </div>
  );
}
