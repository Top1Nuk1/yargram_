import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Features, Highlights, Limits, Reasons } from './components/Sections';
import { Releases } from './components/Releases';
import { CallToAction, Footer } from './components/Cta';
import { useLandingTheme } from './lib/useLandingTheme';
import { LanguageProvider } from './lib/useLandingLanguage';

/**
 * Сайт о Yargram: название, описание, значки, фотографии и кнопка перехода
 * в веб-версию. Отдельный статический сайт — приложение живёт по другому
 * адресу, и лендинг не знает о нём ничего, кроме ссылки.
 */
export default function App() {
  const { theme, toggle } = useLandingTheme();

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-page text-ink">
        <Header theme={theme} onToggleTheme={toggle} />
        <main>
        <Hero />
        <Highlights />
        <Features />
        <Releases />
        <Reasons />
        <Limits />
        <CallToAction />
      </main>
      <Footer />
      </div>
    </LanguageProvider>
  );
}
