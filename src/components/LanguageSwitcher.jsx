import { LANGUAGES, useI18n } from '../i18n'

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLanguage, t } = useI18n()
  return (
    <div className={`language-switcher ${className}`} role="group" aria-label={t('common.language')}>
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          className={`language-switcher__option${lang === language.code ? ' language-switcher__option--active' : ''}`}
          aria-pressed={lang === language.code}
          onClick={() => setLanguage(language.code)}
        >
          {language.label}
        </button>
      ))}
    </div>
  )
}
