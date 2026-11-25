"use client";

import { DownloadIcon, MusicIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import type { ExportedFile, ExportResult } from "@/lib/media/protocol";
import { saveFile } from "@/lib/save";

type Props = {
  result: ExportResult;
  previewUrl: string | null;
  stamp: string;
  onBack: () => void;
  onAgain: () => void;
};

async function save(file: ExportedFile, name: string) {
  try {
    await saveFile(file.blob, name);
  } catch {
    toast.error(t.errors["encode-failed"]);
  }
}

export function DonePanel({ result, previewUrl, stamp, onBack, onAgain }: Props) {
  const { video, audio } = result;
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold tracking-tight">{t.done.title}</h2>

        {previewUrl && (
          <video
            src={previewUrl}
            autoPlay
            loop
            muted
            playsInline
            className="aspect-square w-full rounded-lg bg-muted object-cover"
          />
        )}

        <div className="flex flex-col gap-2">
          {video && (
            <Button className="h-11 w-full" onClick={() => save(video, `figurinha-${stamp}.${video.ext}`)}>
              <DownloadIcon />
              {t.done.saveVideo}
            </Button>
          )}
          {audio && (
            <Button
              variant={video ? "outline" : "default"}
              className="h-11 w-full"
              onClick={() => save(audio, `som-${stamp}.${audio.ext}`)}
            >
              <MusicIcon />
              {t.done.saveAudio(audio.ext)}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-4 text-sm">
          {video && <HowTo title={t.done.howVideoTitle} steps={t.done.howVideo} />}
          {audio && <HowTo title={t.done.howAudioTitle} steps={t.done.howAudio} />}
          <p className="text-xs text-muted-foreground">{t.done.note}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={onBack}>
            {t.done.back}
          </Button>
          <Button variant="ghost" className="h-11" onClick={onAgain}>
            {t.done.again}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HowTo({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  );
}
