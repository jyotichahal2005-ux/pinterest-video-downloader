import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useDownloadPinterestVideo } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type DownloadResult = {
  title: string;
  thumbnail: string | null;
  videos: { url: string; label: string }[];
};

type ApiError = {
  message?: string;
  data?: { error?: string };
};

function getErrorMessage(error: unknown) {
  const apiError = error as ApiError | undefined;
  return apiError?.data?.error || apiError?.message || 'We could not read that pin. Check the link and try again.';
}

function PinterestMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-pinsaver">
      <span className={`${compact ? 'size-8 text-lg' : 'size-9 text-xl'} brand-mark`} aria-hidden="true">p</span>
      {!compact && (
        <span className="font-display text-[1.15rem] font-bold tracking-[-0.055em] text-white">
          Pin<span className="gradient-text">Saver</span>
        </span>
      )}
    </div>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="relative z-20 border-b border-white/[0.07] bg-[#090910]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="focus-ring" onClick={closeMenu} data-testid="link-brand">
          <PinterestMark />
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {[
            ['Downloader', '#top'],
            ['Features', '#features'],
            ['How It Works', '#how-it-works'],
            ['FAQ', '#faq'],
          ].map(([label, href], index) => (
            <a
              key={label}
              href={href}
              className={`focus-ring rounded-xl px-4 py-2.5 text-[0.78rem] font-semibold transition-colors ${index === 0 ? 'bg-white/[0.075] text-white' : 'text-[#9795a8] hover:bg-white/[0.05] hover:text-white'}`}
              data-testid={`link-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="focus-ring grid size-10 place-items-center rounded-xl border border-white/10 text-[#d8d4e1] md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          data-testid="button-mobile-menu"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {menuOpen && (
        <nav className="mx-5 mb-4 grid gap-1 rounded-2xl border border-white/10 bg-[#12121d] p-2 md:hidden" aria-label="Mobile navigation">
          {[
            ['Downloader', '#top'],
            ['Features', '#features'],
            ['How It Works', '#how-it-works'],
            ['FAQ', '#faq'],
          ].map(([label, href]) => (
            <a key={label} href={href} onClick={closeMenu} className="focus-ring rounded-xl px-4 py-3 text-sm font-semibold text-[#b8b5c7] hover:bg-white/[0.06] hover:text-white" data-testid={`link-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}>
              {label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

function LoadingResult() {
  return (
    <section className="result-panel animate-rise-in p-5 sm:p-7" aria-live="polite" data-testid="status-loading">
      <div className="flex items-center gap-3.5">
        <div className="grid size-11 place-items-center rounded-full bg-[#ef2b57]/15 text-[#ff4777]">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-white">Reading your pin</p>
          <p className="mt-1 text-sm text-[#8c899c]">Finding the best available video files...</p>
        </div>
      </div>
      <div className="mt-7 space-y-3" aria-hidden="true">
        <div className="h-3 w-2/3 animate-soft-pulse rounded-full bg-white/[0.08]" />
        <div className="h-3 w-full animate-soft-pulse rounded-full bg-white/[0.08]" />
        <div className="h-3 w-5/6 animate-soft-pulse rounded-full bg-white/[0.08]" />
      </div>
    </section>
  );
}

function EmptyResult() {
  return (
    <section className="result-panel relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14" data-testid="status-empty">
      <div className="empty-orbit absolute -right-16 -top-28 size-64 rounded-full border border-[#e82961]/20" aria-hidden="true" />
      <div className="empty-orbit absolute -right-2 -top-14 size-40 rounded-full border border-[#9c46d6]/15" aria-hidden="true" />
      <div className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-[#ff3d70]/20 bg-[#ef2b57]/10 text-[#ff4777]">
        <Link2 className="size-6" strokeWidth={1.7} />
      </div>
      <p className="relative mt-5 font-display text-lg font-semibold tracking-[-0.03em] text-white">Your download will appear here</p>
      <p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-[#878497]">Paste a Pinterest pin link above and we&apos;ll show the title, preview, and available video qualities.</p>
    </section>
  );
}

function ErrorResult({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="result-panel animate-rise-in border-[#e82961]/30 bg-[#2a101e]/80 p-5 sm:p-7" role="alert" data-testid="status-error">
      <div className="flex items-start gap-3.5">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ef2b57]/15 text-[#ff5c82]">
          <XCircle className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-white">That pin didn&apos;t come through</p>
          <p className="mt-1 text-sm leading-6 text-[#c08b9e]" data-testid="text-error-message">{message}</p>
          <button type="button" onClick={onRetry} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ef2b57] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" data-testid="button-retry">
            <RefreshCcw className="size-3.5" />
            Try another link
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultCard({ result, onReset }: { result: DownloadResult; onReset: () => void }) {
  const availableVideos = useMemo(() => result.videos ?? [], [result.videos]);
  return (
    <section className="result-panel animate-rise-in overflow-hidden" data-testid="status-success">
      <div className="grid md:grid-cols-[minmax(230px,0.82fr)_1.18fr]">
        <div className="relative min-h-64 overflow-hidden bg-[#230c1c] md:min-h-[340px]">
          {result.thumbnail ? (
            <img src={result.thumbnail} alt="" className="absolute inset-0 size-full object-cover opacity-90" data-testid="img-pin-thumbnail" />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_35%_25%,#c33561,#3c102a_65%)]"><PinterestMark compact /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#100811] via-transparent to-[#180916]/20" />
          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-white backdrop-blur-md">
            <Check className="size-3.5 text-[#6ff3b0]" /> PIN FOUND
          </div>
          <div className="absolute bottom-5 left-5 right-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#ff7094]">Preview</p>
            <p className="line-clamp-3 font-display text-lg font-semibold leading-snug tracking-[-0.025em] text-white" data-testid="text-pin-title">{result.title}</p>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#ff4777]">Ready to save</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.045em] text-white">Choose a quality</h2>
            </div>
            <div className="hidden size-10 place-items-center rounded-xl bg-[#ef2b57]/10 text-[#ff4777] sm:grid"><ArrowDownToLine className="size-5" /></div>
          </div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#8e8a9e]">Direct video files, ready when you are. Pick the version that fits your screen.</p>
          <div className="mt-6 space-y-2.5">
            {availableVideos.map((video, index) => (
              <a
                key={`${video.url}-${video.label}`}
                href={video.url}
                download={`pinterest-video-${video.label.toLowerCase().replace(/\s+/g, '-')}.mp4`}
                className="focus-ring group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-[#ef2b57]/60 hover:bg-[#ef2b57]/[0.08]"
                data-testid={`link-download-${index}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ef2b57]/15 text-[#ff4777] transition-colors group-hover:bg-[#ef2b57] group-hover:text-white"><Play className="ml-0.5 size-4 fill-current" /></span>
                  <span className="truncate text-sm font-semibold text-[#ddd9e7]">{video.label}</span>
                </span>
                <Download className="size-4 shrink-0 text-[#a690a9] transition-colors group-hover:text-white" />
              </a>
            ))}
          </div>
          {availableVideos.length === 0 && <p className="mt-5 rounded-xl bg-[#4a2b17]/50 px-4 py-3 text-sm text-[#f0b47b]" data-testid="text-no-videos">No downloadable video files were found for this pin.</p>}
          <button type="button" onClick={onReset} className="focus-ring mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[#958fa3] transition-colors hover:text-white" data-testid="button-new-download">
            <RefreshCcw className="size-3.5" /> Check another pin
          </button>
        </div>
      </div>
    </section>
  );
}

const features = [
  { icon: Zap, title: 'One-click simple', text: 'No account, no maze of buttons. Paste a link and get straight to the file.' },
  { icon: ShieldCheck, title: 'Private by default', text: 'Your link is used to fetch the pin and nothing else. No profile, no history.' },
  { icon: ArrowDownToLine, title: 'Quality options', text: 'Choose from the direct MP4 versions available on each pin.' },
];

const faqs = [
  ['Is PinSaver free to use?', 'Yes. PinSaver is free to use and does not require an account or a subscription.'],
  ['What kind of Pinterest links work?', 'Public pin links work best, including standard Pinterest URLs and shared short links. Private or removed pins cannot be fetched.'],
  ['Where are my files saved?', 'Downloads go directly to your browser’s normal download location. We do not keep a copy of the video on our side.'],
  ['Why can’t I find a video quality?', 'The available qualities come from the original pin. If a pin only has one video file, we show just that one.'],
];

function Home() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastSubmittedUrl, setLastSubmittedUrl] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const download = useDownloadPinterestVideo();
  const isBusy = download.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl || isBusy) return;
    setLastSubmittedUrl(cleanUrl);
    download.mutate({ data: { url: cleanUrl } });
    window.setTimeout(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) {
        setUrl(clipboardText.trim());
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setUrl('');
    setLastSubmittedUrl('');
    download.reset();
    window.setTimeout(() => document.getElementById('pinterest-url')?.focus(), 0);
  };

  const hasSuccess = Boolean(download.data);
  const hasError = Boolean(download.error);

  return (
    <main id="top" className="site-shell min-h-[100dvh] overflow-hidden text-white">
      <Header />
      <section className="hero-grid relative isolate">
        <div className="hero-glow pointer-events-none absolute -left-56 top-0 -z-10 h-[38rem] w-[42rem] rounded-full" aria-hidden="true" />
        <div className="hero-glow hero-glow-right pointer-events-none absolute -right-48 top-20 -z-10 size-[34rem] rounded-full" aria-hidden="true" />
        <div className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:pt-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="animate-rise-in mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-[10px] font-semibold tracking-[0.08em] text-[#aaa7b8] shadow-[0_0_30px_rgba(236,36,94,0.12)] sm:text-[11px]">
              <span className="size-1.5 rounded-full bg-[#54dfa0] shadow-[0_0_10px_#54dfa0]" />
              100% FREE <span className="text-white/20">•</span> NO SIGN-UP <span className="text-white/20">•</span> UNLIMITED DOWNLOADS
            </div>
            <h1 className="animate-rise-in mt-8 font-display text-[clamp(3rem,8vw,6.9rem)] font-bold leading-[0.98] tracking-[-0.075em] text-white [animation-delay:80ms]">
              Pinterest Video <span className="gradient-text">Downloader</span>
            </h1>
            <p className="animate-rise-in mx-auto mt-6 max-w-2xl text-base leading-7 text-[#9a97aa] [animation-delay:140ms] sm:text-lg sm:leading-8">
              Download any public Pinterest video in HD MP4 — instantly.{' '}<br className="hidden sm:block" />
              Fast, secure and completely free, right in your browser.
            </p>

            <form onSubmit={handleSubmit} className="download-card animate-rise-in mx-auto mt-10 max-w-2xl p-3 [animation-delay:200ms]" data-testid="form-download">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[#0c0c15]/80 px-4 py-3.5 text-left">
                  <Link2 className="size-[18px] shrink-0 text-[#8d879d]" />
                  <label htmlFor="pinterest-url" className="sr-only">Pinterest video link</label>
                  <input
                    id="pinterest-url"
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="Paste Pinterest video link here..."
                    className="focus-ring min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#777487]"
                    autoComplete="url"
                    data-testid="input-pinterest-url"
                  />
                  <button type="button" onClick={handlePaste} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#aaa4b7] transition-colors hover:bg-white/[0.07] hover:text-white" data-testid="button-paste">
                    {copied ? <Check className="size-3.5 text-[#54dfa0]" /> : <Clipboard className="size-3.5" />}
                    <span>{copied ? 'Pasted' : 'Paste'}</span>
                  </button>
                </div>
                <button type="submit" disabled={isBusy || !url.trim()} className="focus-ring inline-flex min-h-[3.4rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ef2856] via-[#f9356b] to-[#a93fdb] px-6 text-sm font-bold text-white shadow-[0_8px_28px_rgba(239,40,86,0.25)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_12px_34px_rgba(239,40,86,0.38)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0" data-testid="button-download">
                  {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {isBusy ? 'Finding video...' : 'Download'}
                </button>
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#837f91]"><ShieldCheck className="size-3.5 text-[#54dfa0]" /> Paste a link or try an example: <span className="text-[#cf6a89] underline decoration-[#cf6a89]/40 underline-offset-2">pinterest.com/pin/12345</span></p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.08] pt-4 text-[11px] text-[#8a8697]">
                <span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5 text-[#54dfa0]" /> No login required</span>
                <span className="flex items-center gap-1.5"><Check className="size-3.5 text-[#54dfa0]" /> 100% watermark free</span>
                <span className="flex items-center gap-1.5"><Zap className="size-3.5 text-[#e990ff]" /> Fast downloads</span>
              </div>
            </form>
          </div>

          <div id="result" className="mx-auto mt-12 max-w-3xl scroll-mt-8 sm:mt-16">
            {isBusy && <LoadingResult />}
            {!isBusy && !hasSuccess && !hasError && <EmptyResult />}
            {!isBusy && hasError && <ErrorResult message={getErrorMessage(download.error)} onRetry={() => { setUrl(lastSubmittedUrl); download.reset(); }} />}
            {!isBusy && hasSuccess && <ResultCard result={download.data as DownloadResult} onReset={reset} />}
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-white/[0.07] bg-[#0d0d16] py-20 scroll-mt-8 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-xl">
            <p className="section-kicker"><Sparkles className="size-3.5" /> Why PinSaver</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.06em] text-white sm:text-5xl">The shortcut your saved ideas needed.</h2>
            <p className="mt-5 text-base leading-7 text-[#8d899a]">A focused downloader that stays out of your way and keeps the good part — the content.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className={`feature-card ${index === 1 ? 'md:translate-y-8' : ''}`} data-testid={`card-feature-${index}`}>
                <div className="grid size-11 place-items-center rounded-xl border border-[#ef2b57]/25 bg-[#ef2b57]/10 text-[#ff4d78]"><Icon className="size-5" /></div>
                <h3 className="mt-6 font-display text-xl font-semibold tracking-[-0.04em] text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#8d899a]">{text}</p>
                <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-[#b8b3c3]"><span>Built in</span><ArrowRight className="size-3.5 text-[#ef4772]" /></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative overflow-hidden border-t border-white/[0.07] py-20 scroll-mt-8 sm:py-28">
        <div className="section-glow pointer-events-none absolute right-0 top-1/3 -z-10 size-[30rem] rounded-full" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div>
            <p className="section-kicker"><ArrowDown className="size-3.5" /> How it works</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.06em] text-white sm:text-5xl">From pin to file in three moves.</h2>
            <p className="mt-5 max-w-md text-base leading-7 text-[#8d899a]">No unnecessary steps between finding something great and making it yours.</p>
            <a href="#top" className="focus-ring mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-[#ff527d]" data-testid="link-back-to-downloader">
              Start downloading <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="space-y-4">
            {[
              ['01', 'Copy the pin link', 'Open the Pinterest pin you want and copy its URL from the share menu.'],
              ['02', 'Paste it above', 'Drop the link into PinSaver. We’ll read the pin and find its available video files.'],
              ['03', 'Choose and save', 'Select the quality you want and download the direct MP4 file to your device.'],
            ].map(([number, title, text]) => (
              <div key={number} className="step-row" data-testid={`step-${number}`}>
                <span className="step-number">{number}</span>
                <div><h3 className="font-display text-lg font-semibold tracking-[-0.03em] text-white">{title}</h3><p className="mt-1.5 text-sm leading-6 text-[#8d899a]">{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-white/[0.07] bg-[#0d0d16] py-20 scroll-mt-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
          <div>
            <p className="section-kicker"><ExternalLink className="size-3.5" /> Good to know</p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.06em] text-white sm:text-5xl">Questions, answered.</h2>
            <p className="mt-5 text-base leading-7 text-[#8d899a]">Everything you need to know before your first download.</p>
          </div>
          <div className="divide-y divide-white/[0.09] border-y border-white/[0.09]">
            {faqs.map(([question, answer], index) => {
              const isOpen = openFaq === index;
              return (
                <div key={question} data-testid={`faq-item-${index}`}>
                  <button type="button" className="focus-ring flex w-full items-center justify-between gap-6 py-5 text-left" onClick={() => setOpenFaq(isOpen ? null : index)} aria-expanded={isOpen} data-testid={`button-faq-${index}`}>
                    <span className="font-display text-base font-semibold tracking-[-0.025em] text-white">{question}</span>
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full border border-white/10 text-[#aaa4b8] transition-transform ${isOpen ? 'rotate-45 bg-[#ef2b57]/15 text-[#ff547e]' : ''}`}><span className="text-xl font-light leading-none">+</span></span>
                  </button>
                  {isOpen && <p className="max-w-2xl pb-5 pr-12 text-sm leading-6 text-[#918c9d]" data-testid={`text-faq-answer-${index}`}>{answer}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] bg-[#090910]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <PinterestMark />
          <p className="text-xs text-[#6f6b7b]">Built for the links worth keeping.</p>
          <a href="#top" className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-[#9d98aa] transition-colors hover:text-white" data-testid="link-footer-top">Back to top <ArrowDown className="size-3.5 rotate-180" /></a>
        </div>
      </footer>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;