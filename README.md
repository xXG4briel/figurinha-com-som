# Figurinha com som

Transforme um vídeo ou áudio em um clipe curto, quadrado e leve, pronto para virar
**figurinha com som no WhatsApp**. Tudo acontece no seu celular: nenhum arquivo é enviado
para servidor nenhum.

> **Status:** em desenvolvimento. A interface base está pronta; recorte, enquadramento e
> exportação estão sendo implementados.

## Como funciona

1. **Escolha** um vídeo (MP4, MOV, WebM) ou áudio (MP3, M4A, WAV, OGG).
2. **Recorte** o trecho: até 5s ou 10s.
3. **Enquadre** o vídeo em formato quadrado (1:1).
4. **Baixe** o resultado:
   - **MP4 quadrado** (512×512, H.264 + AAC), para criar a figurinha a partir de um vídeo da galeria;
   - **áudio do trecho**, para anexar som a uma figurinha estática.
5. No WhatsApp, crie a figurinha usando o arquivo baixado.

### Sobre o WhatsApp

A figurinha com som está chegando aos poucos aos usuários, e o WhatsApp **não publicou um formato
de arquivo** para ela: o próprio app converte o vídeo ou áudio e decide a duração final. Este site
prepara o melhor arquivo de entrada possível, mas o MP4 baixado **não é** uma figurinha por si só.
Se você colar o MP4 direto no chat, ele é enviado como vídeo.

## Privacidade

- Sem backend, sem login, sem anúncios, sem rastreamento de arquivos.
- Vídeo e áudio são processados no navegador (WebCodecs, com ffmpeg.wasm como alternativa).
- O site é estático e hospedado no GitHub Pages.

## Desenvolvimento

Requisitos: **Node 22** e **pnpm**.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck    # tipos de rota + tsc
pnpm lint
pnpm build        # gera o site estático em out/
```

Para testar o build como ele roda no GitHub Pages (servido em `/<repo>/`):

```bash
NEXT_PUBLIC_BASE_PATH=/<repo> pnpm build
pnpm dlx serve out
```

### Stack

- [Next.js 16](https://nextjs.org) (App Router, export estático) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (Base UI)
- [next-themes](https://github.com/pacocoursey/next-themes) para tema claro/escuro
- [Mediabunny](https://mediabunny.dev) e [ffmpeg.wasm](https://ffmpegwasm.netlify.app) para mídia (em implementação)

### Estrutura

```text
src/
  app/              páginas
  components/
    editor/         editor (seleção, recorte, enquadramento, exportação)
    ui/             componentes shadcn
  lib/
    i18n.ts         textos da interface
    limits.ts       limites de duração, tamanho e saída
```

Regras de arquitetura, design e convenções estão no [`CLAUDE.md`](CLAUDE.md).

## Deploy

O deploy é automático a cada push na `main` pelo workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Na primeira vez, em **Settings → Pages**, selecione **GitHub Actions** como fonte.
