import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clipboard,
  Download,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useDownloadPinterestVideo } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from 'wouter';

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
  if (apiError?.data?.error) {
    return apiError.data.error;
  }
  return 'We could not read that pin. Check the link and try again.';
}

function PinterestMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-pinterest">
      <div className={`${compact ? 'size-8' : 'size-9'} grid place-items-center rounded-full bg-[#E60023] text-white shadow-[0_5px_16px_hsl(348_100%_45%_/_0.23)]`}>
        <span className={`${compact ? 'text-lg' : 'text-xl'} font-bold leading-none`} aria-hidden="true">p</span>
      </div>
      {!compact && (
        <span className="font-display text-[1.1rem] font-bold tracking-[-0.04em] text-[#5f1729]">
          pin<span className="text-[#E60023]">save</span>
        </span>
      )}
    </div>
  );
}

function LoadingResult() {
  return (
    <section className="animate-rise-in rounded-[1.65rem] border border-[#f2d9df] bg-white/90 p-5 shadow-[0_22px_70px_hsl(348_38%_36%_/_0.08)] sm:p-7" aria-live="polite" data-testid="status-loading">
      <div className="flex items-center gap-3">
        <div className="relative grid size-11 place-items-center rounded-full bg-[#fff0f2]">
          <LoaderCircle className="size-5 animate-spin text-[#E60023]" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-[#5f1729]">Reading your pin</p>
          <p className="mt-0.5 text-sm text-[#9c7580]">Finding the best available video files…</p>
        </div>
      </div>
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-3 w-2/3 animate-soft-pulse rounded-full bg-[#f9e7ea]" />
        <div className="h-3 w-full animate-soft-pulse rounded-full bg-[#f9e7ea]" />
        <div className="h-3 w-5/6 animate-soft-pulse rounded-full bg-[#f9e7ea]" />
      </div>
    </section>
  );
}

function EmptyResult() {
  return (
    <section className="relative overflow-hidden rounded-[1.65rem] border border-[#f2d9df] bg-[#fffafb]/90 px-6 py-10 text-center shadow-[0_22px_70px_hsl(348_38%_36%_/_0.06)] sm:px-10 sm:py-14" data-testid="status-empty">
      <div className="absolute -right-20 -top-24 size-56 rounded-full border-[26px] border-[#fff0f2]" aria-hidden="true" />
      <div className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff0f2] text-[#E60023]">
        <Link2 className="size-6" strokeWidth={1.8} />
      </div>
      <p className="relative mt-5 font-display text-lg font-semibold tracking-[-0.025em] text-[#5f1729]">Your download will appear here</p>
      <p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-[#9c7580]">Paste a Pinterest pin link above and we’ll show the title, preview, and available video qualities.</p>
    </section>
  );
}

function ErrorResult({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="animate-rise-in rounded-[1.65rem] border border-[#f2c7cf] bg-[#fff7f8] p-5 shadow-[0_22px_70px_hsl(348_38%_36%_/_0.07)] sm:p-7" role="alert" data-testid="status-error">
      <div className="flex items-start gap-3.5">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ffe4e8] text-[#C80020]">
          <XCircle className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-[#7f182b]">That pin didn’t come through</p>
          <p className="mt-1 text-sm leading-6 text-[#9c5564]" data-testid="text-error-message">{message}</p>
          <button type="button" onClick={onRetry} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-full bg-[#E60023] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0" data-testid="button-retry">
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
    <section className="animate-rise-in overflow-hidden rounded-[1.65rem] border border-[#f2d9df] bg-white shadow-[0_22px_70px_hsl(348_38%_36%_/_0.1)]" data-testid="status-success">
      <div className="grid md:grid-cols-[minmax(220px,0.82fr)_1.18fr]">
        <div className="relative min-h-56 overflow-hidden bg-[#68182f] md:min-h-[330px]">
          {result.thumbnail ? (
            <img src={result.thumbnail} alt="" className="absolute inset-0 size-full object-cover opacity-90" data-testid="img-pin-thumbnail" />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_35%_25%,#b93254,#68182f_63%)]">
              <PinterestMark compact />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#3d0c1c]/85 via-transparent to-[#3d0c1c]/10" />
          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-white backdrop-blur-md">
            <Check className="size-3.5" />
            PIN FOUND
          </div>
          <div className="absolute bottom-5 left-5 right-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#ffc9d2]">Preview</p>
            <p className="line-clamp-3 font-display text-lg font-semibold leading-snug tracking-[-0.025em] text-white" data-testid="text-pin-title">{result.title}</p>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E60023]">Ready to save</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.045em] text-[#5f1729]">Choose a quality</h2>
            </div>
            <div className="hidden size-10 place-items-center rounded-xl bg-[#fff0f2] text-[#E60023] sm:grid">
              <ArrowDownToLine className="size-5" />
            </div>
          </div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#9c7580]">Direct video files, ready when you are. Pick the version that fits your screen.</p>
          <div className="mt-6 space-y-2.5">
            {availableVideos.map((video, index) => (
              <a
                key={`${video.url}-${video.label}`}
                href={video.url}
                download={`pinterest-video-${video.label.toLowerCase().replace(/\s+/g, '-')}.mp4`}
                className="focus-ring group flex items-center justify-between gap-4 rounded-2xl border border-[#f2d9df] bg-[#fffafb] px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-[#e8aab6] hover:bg-[#fff4f5] hover:shadow-[0_8px_24px_hsl(348_38%_36%_/_0.08)]"
                data-testid={`link-download-${index}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ffe9ed] text-[#E60023] transition-colors group-hover:bg-[#E60023] group-hover:text-white">
                    <Play className="ml-0.5 size-4 fill-current" />
                  </span>
                  <span className="truncate text-sm font-semibold text-[#691b31]">{video.label}</span>
                </span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full text-[#bc6a7a] transition-colors group-hover:bg-[#E60023] group-hover:text-white">
                  <Download className="size-4" />
                </span>
              </a>
            ))}
          </div>
          {availableVideos.length === 0 && (
            <p className="mt-5 rounded-xl bg-[#fff4e7] px-4 py-3 text-sm text-[#9a5c2b]" data-testid="text-no-videos">No downloadable video files were found for this pin.</p>
          )}
          <button type="button" onClick={onReset} className="focus-ring mt-6 inline-flex items-center gap-2 text-xs font-semibold text-[#a26370] transition-colors hover:text-[#E60023]" data-testid="button-new-download">
            <RefreshCcw className="size-3.5" />
            Check another pin
          </button>
        </div>
      </div>
    </section>
  );
}

function Home() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastSubmittedUrl, setLastSubmittedUrl] = useState('');
  const download = useDownloadPinterestVideo();
  const isBusy = download.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl || isBusy) return;
    setLastSubmittedUrl(cleanUrl);
    download.mutate({ data: { url: cleanUrl } });
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
      setUrl((current) => current);
    }
  };

  const reset = () => {
    setUrl('');
    setLastSubmittedUrl('');
    download.reset();
  };

  const hasSuccess = Boolean(download.data);
  const hasError = Boolean(download.error);

  return (
    <main className="paper-noise min-h-[100dvh] text-[#5f1729]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <PinterestMark />
        <div className="hidden items-center gap-2 text-xs font-medium text-[#9c7580] sm:flex">
          <LockKeyhole className="size-3.5 text-[#b96877]" />
          <span>Simple. Private. No sign-in.</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#f1d7dc] bg-white/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a26370] sm:hidden">
          <ShieldCheck className="size-3.5 text-[#E60023]" />
          private
        </div>
      </header>

      <div className="relative isolate overflow-hidden">
        <div className="fine-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[590px]" />
        <div className="pointer-events-none absolute -right-32 top-12 -z-10 size-80 rounded-full bg-[#ffe8ec] blur-3xl" />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:pb-24 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
            <div className="animate-rise-in">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#f0ccd4] bg-white/75 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9c5363] shadow-sm">
                <Sparkles className="size-3.5 text-[#E60023]" />
                Pinterest video, minus the maze
              </div>
              <h1 className="max-w-2xl font-display text-[clamp(3.25rem,8vw,6.4rem)] font-bold leading-[0.91] tracking-[-0.075em] text-[#5f1729]">
                Save the
                <span className="relative mx-2 inline-block text-[#E60023]">
                  moment.
                  <span className="absolute -bottom-1 left-1 right-0 h-2 rounded-full bg-[#ffbdc8]/70" aria-hidden="true" />
                </span>
              </h1>
              <p className="mt-7 max-w-lg text-base leading-7 text-[#8e6470] sm:text-lg sm:leading-8">
                A tiny, trustworthy tool for turning a Pinterest pin into a video file you can keep. No pop-ups. No detours. Just the link and the result.
              </p>

              <form onSubmit={handleSubmit} className="mt-9 max-w-xl" data-testid="form-download">
                <label htmlFor="pinterest-url" className="mb-2.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[#7e3e50]">Pinterest pin link</label>
                <div className="group flex flex-col gap-2 rounded-[1.35rem] border border-[#e8cbd1] bg-white p-2 shadow-[0_18px_48px_hsl(348_38%_36%_/_0.1)] transition-shadow focus-within:border-[#e8a4b1] focus-within:shadow-[0_18px_48px_hsl(348_38%_36%_/_0.16)] sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-3 sm:px-3.5">
                    <Link2 className="size-5 shrink-0 text-[#d08b98]" />
                    <input
                      id="pinterest-url"
                      type="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://www.pinterest.com/pin/…"
                      className="focus-ring min-w-0 flex-1 bg-transparent py-3 text-sm text-[#5f1729] outline-none placeholder:text-[#c39ca5]"
                      autoComplete="url"
                      data-testid="input-pinterest-url"
                    />
                    <button type="button" onClick={handlePaste} className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#a26370] transition-colors hover:bg-[#fff0f2] hover:text-[#E60023]" data-testid="button-paste">
                      {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                      <span className="hidden xs:inline">{copied ? 'Pasted' : 'Paste'}</span>
                    </button>
                  </div>
                  <button type="submit" disabled={isBusy || !url.trim()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-[1rem] bg-[#E60023] px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_hsl(348_100%_45%_/_0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#c9001f] hover:shadow-[0_10px_24px_hsl(348_100%_45%_/_0.3)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0" data-testid="button-download">
                    {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
                    {isBusy ? 'Finding video…' : 'Find my video'}
                  </button>
                </div>
                <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-[#ae818b]">
                  <ShieldCheck className="size-3.5 text-[#c57282]" />
                  We only use your link to fetch this pin. Nothing is stored.
                </p>
              </form>
            </div>

            <div className="relative hidden min-h-[390px] lg:block" aria-hidden="true">
              <div className="absolute right-5 top-8 h-72 w-56 rotate-[8deg] rounded-[2rem] border border-white/80 bg-[#ffced7]/75 shadow-[0_28px_60px_hsl(348_38%_36%_/_0.11)]" />
              <div className="absolute right-16 top-0 h-72 w-56 rotate-[-7deg] rounded-[2rem] border border-white bg-white/85 p-3 shadow-[0_28px_60px_hsl(348_38%_36%_/_0.14)]">
                <div className="flex h-full flex-col overflow-hidden rounded-[1.45rem] bg-[#fce7eb]">
                  <div className="h-2/3 bg-[linear-gradient(145deg,#ed6680_0%,#9d294a_58%,#5d152c_100%)]">
                    <div className="mx-auto mt-11 grid size-16 place-items-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur-md">
                      <Play className="ml-1 size-7 fill-current" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="h-2 w-20 rounded-full bg-[#d695a3]" />
                      <div className="mt-2 h-2 w-32 rounded-full bg-[#e7b9c2]" />
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm">
                      <span className="font-mono text-[10px] font-medium text-[#9c5363]">MP4 · HD</span>
                      <ArrowDownToLine className="size-4 text-[#E60023]" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/75 bg-white/80 px-4 py-3 shadow-[0_16px_40px_hsl(348_38%_36%_/_0.12)] backdrop-blur-md">
                <span className="grid size-9 place-items-center rounded-xl bg-[#E60023] text-white"><Check className="size-4" /></span>
                <span><span className="block font-display text-xs font-bold text-[#5f1729]">Ready to save</span><span className="mt-0.5 block text-[10px] text-[#a26370]">One clear result</span></span>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-3xl lg:mt-20" id="result">
            {isBusy && <LoadingResult />}
            {!isBusy && !hasSuccess && !hasError && <EmptyResult />}
            {!isBusy && hasError && <ErrorResult message={getErrorMessage(download.error)} onRetry={() => { setUrl(lastSubmittedUrl); download.reset(); }} />}
            {!isBusy && hasSuccess && <ResultCard result={download.data as DownloadResult} onReset={reset} />}
          </div>

          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-between gap-4 border-t border-[#efdce0] pt-6 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-[#b28791]">Built for the links worth keeping.</p>
            <div className="flex items-center gap-5 text-xs text-[#b28791]">
              <span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5" /> No account needed</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Direct files</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
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
