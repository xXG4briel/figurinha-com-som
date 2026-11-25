# CLAUDE.md

Guia para trabalhar neste repositório. Leia antes de mudar qualquer coisa.
Veja também `AGENTS.md` (regras do Next.js 16, mantido pelo próprio Next).

## Produto

**Figurinha com som**: site gratuito, em pt-BR, que prepara **clipes curtos para virar figurinha
com som no WhatsApp**. O usuário envia um vídeo ou áudio, escolhe o trecho, enquadra em 1:1 e
baixa o arquivo pronto. Objetivo: utilidade, hype e portfólio. **Sem anúncios, sem login, sem
backend.** Métrica de sucesso é uso (figurinhas exportadas), não receita.

O escopo é **o básico bem feito**: um fluxo, uma tela, rápido no celular. Nada de editor de vídeo,
desenho, texto, filtros ou galeria até o fluxo principal estar sólido.

### Fluxo principal (v1)

1. **Entrada**: arquivo de vídeo (MP4, MOV, WebM) ou áudio (MP3, M4A, WAV, OGG, AAC); depois,
   imagem + áudio (PNG, JPG, WebP, GIF). Escolher arquivo é o caminho principal no celular;
   colar e arrastar são extras.
2. **Recorte de tempo**: forma de onda + timeline com alças de início/fim, arrastáveis com o dedo.
   Duração máxima por preset `5s | 10s` (padrão 10s), mínimo 0,1s. Botão para ouvir só o trecho.
3. **Enquadramento 1:1**: recorte quadrado centrado, arrastável com o dedo. Fundo sólido quando a
   origem tem transparência (MP4 não tem alfa).
4. **Exportar e baixar**, localmente:
   - **MP4 quadrado** (H.264 + AAC, 512×512, ≤ preset): para "Criar figurinha" a partir de um
     vídeo da galeria no WhatsApp.
   - **Áudio do trecho** (M4A/AAC; Ogg Opus se o navegador codificar): para anexar som a uma
     figurinha estática no editor do WhatsApp.
   - No celular, preferir `navigator.share({ files })` quando disponível (salva direto na
     galeria/compartilha), com download como fallback.
5. **Tela de sucesso** com instruções curtas de como usar no WhatsApp.

### Fora do escopo (decidido)

- **Link do YouTube**: exigiria servidor (CORS, URLs assinadas, bloqueio de IPs de datacenter) e
  viola os Termos do YouTube. Não implementar. Manter a entrada como adapter (`lib/sources/`) para
  que uma fonte por URL possa entrar no futuro sem mexer no editor.
- **AdSense/anúncios**: descartado. Não adicionar scripts de anúncio nem banner de consentimento.
- Protocolo privado do WhatsApp, automação de WhatsApp Web, WebP "com áudio embutido".

## Regras do WhatsApp (o que sabemos e o que não sabemos)

- Figurinha oficial: WebP 512×512, estática ≤ 100 KB, animada ≤ 500 KB e ≤ 10s. Sem áudio.
- Figurinha com som (nov/2026, rollout gradual): o app do WhatsApp cria a figurinha a partir de um
  vídeo da galeria ou de um áudio anexado a uma figurinha. **Não existe formato de arquivo público.**
  Relatos: ~10s para áudio em figurinha estática, ~5s quando a origem é vídeo. O WhatsApp
  reconverte o arquivo e decide duração e áudio.
- Consequência: entregamos **o melhor insumo possível** (clipe quadrado, curto, leve, áudio limpo)
  e explicamos o passo no WhatsApp. **Nunca** prometer "figurinha nativa com som" nem dizer que o
  MP4 "é" uma figurinha. Colar o MP4 no chat envia um vídeo.
- Quando os limites mudarem, atualize `src/lib/limits.ts` e esta seção.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript strict**. Esta versão tem mudanças
  grandes em relação ao que você conhece: consulte `node_modules/next/dist/docs/` antes de usar
  APIs do Next.
- **Tailwind CSS 4** (config no CSS, `src/app/globals.css`; não existe `tailwind.config`).
- **shadcn/ui**, estilo `base-nova`, cor base `neutral`, ícones `lucide-react`.
  - Os componentes usam **Base UI** (`@base-ui/react`), não Radix: composição é pela prop
    `render`, não `asChild`. `ToggleGroup` trabalha com `value` em array.
  - `cn` vem do pacote `cn` (substituto oficial de `clsx` + `tailwind-merge`), reexportado em
    `src/lib/utils.ts`.
  - Adicionar componentes com `pnpm dlx shadcn@latest add <nome>`. Não editar `components/ui/`
    à mão, salvo ajuste pequeno e comentado.
- **next-themes** para tema claro/escuro/sistema (`attribute="class"`, padrão `system`).
- Gerenciador: **pnpm**. Node 22.

## Hospedagem: GitHub Pages

- `next.config.ts` usa `output: "export"`, `trailingSlash: true` e `images.unoptimized`.
  O build gera `out/`.
- O site fica em `https://<usuario>.github.io/<repo>/`. O `basePath` vem de
  `NEXT_PUBLIC_BASE_PATH`, injetado pelo workflow (`actions/configure-pages`). Em dev fica vazio.
  - Links internos: sempre `next/link` (aplica o basePath sozinho).
  - Assets de `public/` referenciados à mão (`<img>`, `fetch`, worker, wasm) precisam do prefixo
    `process.env.NEXT_PUBLIC_BASE_PATH`.
- `public/.nojekyll` é obrigatório (senão o Pages ignora `_next/`).
- Deploy: `.github/workflows/deploy.yml`, a cada push em `main`. Em Settings → Pages, a fonte
  deve ser "GitHub Actions".
- Proibido: Route Handlers, Server Actions, middleware/proxy, `cookies()`, `headers()`, ISR,
  `next/image` otimizado, ou qualquer coisa que exija runtime de servidor.
- **O GitHub Pages não permite headers customizados.** Logo, não há COOP/COEP nem
  `SharedArrayBuffer`. Não depender disso (sem `@ffmpeg/core-mt`, sem hacks de service worker).

## Arquitetura

**100% client-side.** Nenhum arquivo do usuário sai do navegador. É argumento de produto
(privacidade) e não deve ser quebrado.

- Páginas são Server Components estáticos. O editor é Client Component; nada de API de mídia
  fora do cliente.
- **Processamento de mídia**:
  1. Caminho principal: **WebCodecs** via [Mediabunny](https://mediabunny.dev) (demux, decode,
     encode, mux MP4, trim) + `OffscreenCanvas` para o crop.
  2. Fallback: **ffmpeg.wasm single-thread** (`@ffmpeg/core`), carregado sob demanda só se
     WebCodecs falhar ou o formato não for suportado (ex.: alguns MOV/HEVC). Nunca no bundle inicial.
  3. Forma de onda: `AudioContext.decodeAudioData` → picos min/max em ~1024 barras.
- Processamento pesado em **Web Worker** quando possível; a UI nunca trava.
- Estado do editor local ao componente ou em um store simples; sem persistência de mídia.
  `localStorage` só para preferências (preset, cor de fundo), sempre com try/catch.

### Estrutura de pastas

```text
src/
  app/                    rotas; / (editor), depois /como-usar e /privacidade
  components/
    editor/               Editor, Timeline, Waveform, CropBox, ExportPanel
    ui/                   shadcn (gerado)
    theme-provider.tsx, theme-toggle.tsx
  lib/
    i18n.ts               todos os textos da interface (pt-BR)
    limits.ts             TODAS as constantes de limite
    utils.ts              cn
    media/                probe, waveform, crop (puro), export-webcodecs, export-ffmpeg (lazy), export
    sources/              adapters de entrada (arquivo hoje; URL no futuro)
    errors.ts             erros tipados (unsupported-video, too-large, encode-failed, ...)
  workers/
public/
```

Regra: componentes React **não** contêm lógica de mídia. Chamam `lib/media`, que é pura ou
isolada e testável sem DOM sempre que der.

## Limites e validação de entrada

Fonte da verdade: `src/lib/limits.ts`. Valores atuais: vídeo 200 MB, áudio 25 MB, imagem 20 MB;
origem até 10 min; trecho de 0,1s até o preset (5s/10s); saída 512×512, 30 fps, áudio 48 kHz;
imagem até 8000 px por lado e 40 MP.

- Identificar o tipo pelos **bytes**, não pela extensão.
- Checar tamanho antes de decodificar. Falhar com erro tipado e mensagem amigável em pt-BR.
- Revogar todo `URL.createObjectURL` e fechar `VideoFrame`/`AudioData`.

## Design: minimalista, 100% mobile

- **Projetado só para celular.** Coluna única, `max-w-md` centralizada; no desktop é a mesma
  coluna, sem layout alternativo. Testar sempre em 360–430px de largura.
- Minimalista: tons neutros do shadcn, sem cor de destaque além de `primary`, sem gradientes,
  sem sombras pesadas, sem ilustrações. Hierarquia por tipografia e espaço. Fonte Geist.
- Tema claro e escuro com o mesmo peso visual; usar só tokens (`bg-background`,
  `text-muted-foreground`, etc.), nunca cores fixas. Conferir os dois temas em toda mudança.
- Toque: alvos ≥ 44px (`size-11`/`h-11`), ações principais na metade de baixo da tela, sem
  depender de hover. Respeitar `env(safe-area-inset-*)`. Usar `dvh`, não `vh`.
- Feedback: barra de progresso e botão de cancelar na exportação; toasts (sonner) no topo.
- Navegadores-alvo: Chrome Android e Safari iOS (WebCodecs parcial e restrições de autoplay
  no iOS: sempre ter fallback e testar).
- Acessível: controles com label, contraste AA, timeline operável por teclado.
- Performance: editor pesado e ffmpeg fora do bundle inicial.

## Comandos

```bash
pnpm dev          # desenvolvimento (http://localhost:3000)
pnpm build        # build estático em out/
pnpm lint         # eslint (inclui regras do React Compiler, ex.: sem setState em effect)
pnpm typecheck    # next typegen && tsc --noEmit
```

Para testar o build como no Pages: `NEXT_PUBLIC_BASE_PATH=/<repo> pnpm build` e servir `out/`.
Antes de dizer que algo está pronto: `pnpm typecheck && pnpm lint && pnpm build`.

A adicionar quando houver lógica de mídia: `pnpm test` (Vitest para `lib/`) e `pnpm test:e2e`
(Playwright em viewport de celular: upload → recorte → download, com fixtures geradas por nós).

## Convenções

- TypeScript strict, sem `any`. Erros de mídia sempre tipados.
- Textos da interface só em `src/lib/i18n.ts`.
- Dependências com versão fixa. Registrar licença ao adicionar codec/encoder (ffmpeg.wasm é LGPL;
  manter carregamento dinâmico e citar em `/licencas`).
  - `mediabunny` (MPL-2.0): demux/decode/encode/mux no worker.
  - `@mediabunny/aac-encoder` (MPL-2.0, baseado em libavcodec/LGPL): carregado por `import()`
    só quando o navegador não tem AAC nativo (ex.: Chrome no Linux). Citar em `/licencas`.
- Fixtures de teste pequenas e geradas por nós (sem mídia de terceiros no repositório).
- Commits pequenos, no imperativo.
