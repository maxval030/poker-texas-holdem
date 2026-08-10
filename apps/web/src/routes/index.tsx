import { createFileRoute, Link } from '@tanstack/react-router'
import { LanguageSwitch, useLocale } from '../i18n/locale.tsx'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { t } = useLocale()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div
        className="absolute right-4 top-4"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <LanguageSwitch />
      </div>
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-brass-300">{t('brand')}</h1>
        <p className="mt-2 text-sm text-cream/70">{t('home.tagline')}</p>
      </header>

      <nav className="flex flex-col gap-3">
        <Link
          to="/play/solo"
          className="rounded-xl bg-felt-600 px-5 py-4 text-center font-semibold text-cream shadow-md active:scale-[0.99]"
        >
          {t('home.solo')}
        </Link>
        <Link
          to="/room/create"
          className="rounded-xl bg-rail-700 px-5 py-4 text-center font-semibold text-cream shadow-md active:scale-[0.99]"
        >
          {t('home.create')}
        </Link>
        <Link
          to="/room/join"
          className="rounded-xl border border-brass-400/40 px-5 py-4 text-center font-semibold text-brass-300 active:scale-[0.99]"
        >
          {t('home.join')}
        </Link>
        <Link to="/table/demo" className="rounded-xl px-5 py-3 text-center text-sm text-cream/50">
          {t('home.demo')}
        </Link>
      </nav>
    </main>
  )
}
