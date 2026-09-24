import { FileQuestion } from 'lucide-react';
import { Link } from 'wouter';
import { PageFrame } from '@/components/site-chrome';

export default function NotFound() {
  return (
    <PageFrame>
      <main>
        <section className="content-hero border-b border-white/[0.07] px-5 pb-20 pt-24 sm:px-8 sm:pb-28 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#ef2b57]/25 bg-[#ef2b57]/10 text-[#ff4d78]">
              <FileQuestion className="size-7" strokeWidth={1.7} />
            </div>
            <p className="content-kicker mt-8">Page not found</p>
            <h1 className="mt-4 font-display text-[clamp(3rem,8vw,6rem)] font-bold leading-[0.98] tracking-[-0.075em] text-white">
              That pin is <span className="gradient-text">missing.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[#a09bab] sm:text-lg">
              The page you're looking for doesn't exist or has moved. Head back to the downloader and keep saving what you found.
            </p>
            <Link href="/" className="focus-ring mt-9 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ef2856] via-[#f9356b] to-[#a93fdb] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(239,40,86,0.25)] transition-transform hover:-translate-y-0.5">
              Back to the downloader
            </Link>
          </div>
        </section>
      </main>
    </PageFrame>
  );
}
