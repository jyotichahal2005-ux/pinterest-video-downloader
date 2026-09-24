import { ArrowDown, ArrowRight, ChevronUp, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { resolveMeta } from '@/pages/site-pages';

const SITE_URL = 'https://pinsaver.app';

export function Seo() {
  const [location] = useLocation();
  useEffect(() => {
    const meta = resolveMeta(location);
    const path = location.startsWith('/') ? location : `/${location}`;
    const canonicalUrl = `${SITE_URL}${path === '/' ? '/' : path}`;

    document.title = meta.title;
    setMeta('description', meta.description);
    setMeta('og:title', meta.title);
    setMeta('og:description', meta.description);
    setMeta('og:type', meta.type ?? 'website');
    setMeta('og:url', canonicalUrl);
    setLink('canonical', canonicalUrl);
  }, [location]);
  return null;
}

function setMeta(property: string, content: string) {
  const selector = property.startsWith('og:')
    ? `meta[property="${property}"]`
    : `meta[name="${property}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    if (property.startsWith('og:')) el.setAttribute('property', property);
    else el.setAttribute('name', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function PinterestMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-pinsaver">
      <span className={`${compact ? 'size-8 text-lg' : 'size-9 text-xl'} brand-mark`} aria-hidden="true">p</span>
      {!compact && <span className="font-display text-[1.15rem] font-bold tracking-[-0.055em] text-white">Pin<span className="gradient-text">Saver</span></span>}
    </div>
  );
}

const navItems = [
  ['Downloader', '/'],
  ['Features', '/features'],
  ['How It Works', '/how-it-works'],
  ['Blog', '/blog'],
  ['About', '/about'],
  ['FAQ', '/faq'],
  ['Contact', '/contact'],
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="relative z-20 border-b border-white/[0.07] bg-[#090910]/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="focus-ring" onClick={closeMenu} data-testid="link-brand"><PinterestMark /></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {navItems.map(([label, href]) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return <Link key={label} href={href} className={`focus-ring rounded-xl px-3 py-2.5 text-[0.76rem] font-semibold transition-colors ${active ? 'bg-white/[0.075] text-white' : 'text-[#9795a8] hover:bg-white/[0.05] hover:text-white'}`} data-testid={`link-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</Link>;
          })}
        </nav>
        <button type="button" className="focus-ring grid size-10 place-items-center rounded-xl border border-white/10 text-[#d8d4e1] lg:hidden" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} data-testid="button-mobile-menu">
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {menuOpen && <nav className="mx-5 mb-4 grid gap-1 rounded-2xl border border-white/10 bg-[#12121d] p-2 lg:hidden" aria-label="Mobile navigation">
        {navItems.map(([label, href]) => <Link key={label} href={href} onClick={closeMenu} className="focus-ring rounded-xl px-4 py-3 text-sm font-semibold text-[#b8b5c7] hover:bg-white/[0.06] hover:text-white" data-testid={`link-mobile-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</Link>)}
      </nav>}
    </header>
  );
}

export function SiteFooter() {
  return <footer className="border-t border-white/[0.07] bg-[#090910]">
    <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
      <Link href="/" data-testid="link-footer-brand"><PinterestMark /></Link>
      <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-[#858091]">
        <Link href="/privacy" className="hover:text-white" data-testid="link-footer-privacy">Privacy</Link>
        <Link href="/terms" className="hover:text-white" data-testid="link-footer-terms">Terms</Link>
        <Link href="/contact" className="hover:text-white" data-testid="link-footer-contact">Contact</Link>
      </div>
      <Link href="/" className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-[#9d98aa] transition-colors hover:text-white" data-testid="link-footer-top">Back to downloader <ArrowRight className="size-3.5" /></Link>
    </div>
  </footer>;
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="content-shell text-white"><SiteHeader />{children}<SiteFooter /></div>;
}

export function BackToTop() {
  return <Link href="#top" className="focus-ring fixed bottom-5 right-5 z-10 grid size-10 place-items-center rounded-full border border-white/10 bg-[#181522]/90 text-[#d9d2df] shadow-xl backdrop-blur-md hover:text-white" data-testid="link-back-to-top" aria-label="Back to top"><ChevronUp className="size-4" /></Link>;
}

export function CtaBand({ title = 'Ready to keep a pin?', text = 'Paste a public Pinterest link and get to the file without the fuss.' }: { title?: string; text?: string }) {
  return <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
    <div className="relative overflow-hidden rounded-2xl border border-[#ef4772]/25 bg-gradient-to-br from-[#3a1326] via-[#1c1428] to-[#22142c] px-6 py-10 sm:px-12 sm:py-14">
      <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-[#9e3cbb]/20 blur-3xl" />
      <div className="relative max-w-2xl"><p className="content-kicker">No account needed</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.06em] sm:text-4xl">{title}</h2><p className="mt-4 max-w-lg text-sm leading-7 text-[#b1aabd]">{text}</p><Link href="/" className="focus-ring mt-7 inline-flex items-center gap-2 rounded-xl bg-[#ef2856] px-5 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" data-testid="link-cta-downloader">Open the downloader <ArrowRight className="size-4" /></Link></div>
    </div>
  </section>;
}