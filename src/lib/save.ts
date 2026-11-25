// Salvar o resultado: no celular, a folha de compartilhamento (vai para a galeria
// ou direto para o WhatsApp); no resto, download comum.

export type SaveOutcome = "shared" | "downloaded" | "aborted";

export async function saveFile(blob: Blob, name: string): Promise<SaveOutcome> {
  const file = new File([blob], name, { type: blob.type });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "aborted";
      // NotAllowedError etc.: cai para o download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
