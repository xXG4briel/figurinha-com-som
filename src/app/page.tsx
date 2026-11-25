import { ShieldCheckIcon } from "lucide-react";
import { EditorLoader } from "@/components/editor/editor-loader";
import { ThemeToggle } from "@/components/theme-toggle";
import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
        <span className="text-base font-semibold tracking-tight">{t.site.name}</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col gap-6 pt-4">
        <section className="space-y-2">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {t.site.tagline}
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheckIcon className="size-4 shrink-0" />
            {t.site.privacy}
          </p>
        </section>

        <EditorLoader />

        <ol className="space-y-3 text-sm text-muted-foreground">
          {t.steps.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-foreground">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
