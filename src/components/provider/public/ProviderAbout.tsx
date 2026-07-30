/** About / bio card. */
import { Sparkles } from "lucide-react";
import type { PublicProviderProfile } from "./types";

export function ProviderAbout({ profile }: { profile: PublicProviderProfile }) {
  if (!profile.public_bio && !profile.headline) return null;
  return (
    <section
      data-testid="provider-about"
      className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-[hsl(222_60%_92%)] xl:gap-4 xl:p-6"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[hsl(222_88%_42%/0.08)]">
        <Sparkles className="h-5 w-5 text-[hsl(222_88%_42%)]" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        {profile.headline && (
          <h2 className="break-words text-lg font-bold text-[hsl(224_72%_18%)]">{profile.headline}</h2>
        )}
        {profile.public_bio && (
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-[hsl(224_45%_25%)]">
            {profile.public_bio}
          </p>
        )}
      </div>
    </section>
  );
}

export default ProviderAbout;
