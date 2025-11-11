import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

export default getRequestConfig(async () => {
  // First, check if user has explicitly set a locale preference via cookie
  const cookieStore = await cookies()
  const userLocale = cookieStore.get('start-claude-locale')?.value

  // If user has set a preference, use it
  if (userLocale && ['en-US', 'zh-CN', 'ja-JP', 'zh-Hant'].includes(userLocale)) {
    return {
      locale: userLocale,
      messages: (await import(`../messages/${userLocale}.json`)).default,
    }
  }

  // Otherwise, get the locale from the Accept-Language header or default to en-US
  const headersList = await headers()
  const acceptLanguage = headersList.get('accept-language') || ''

  // Parse the Accept-Language header to determine the best locale
  let locale = 'en-US'

  if (acceptLanguage) {
    const languages = acceptLanguage
      .split(',')
      .map((lang) => {
        const [code, q = 'q=1'] = lang.trim().split(';')
        return { code: code.trim(), priority: Number.parseFloat(q.split('=')[1] || '1') }
      })
      .sort((a, b) => b.priority - a.priority)

    for (const lang of languages) {
      const langCode = lang.code.toLowerCase()
      const [language, region] = langCode.split('-')

      // Check for exact match
      if (langCode === 'en-us' || langCode === 'en')
        locale = 'en-US'
      else if (langCode === 'zh-cn' || (language === 'zh' && region !== 'tw' && region !== 'hk' && region !== 'mo'))
        locale = 'zh-CN'
      else if (langCode === 'zh-tw' || langCode === 'zh-hk' || langCode === 'zh-hant' || (language === 'zh' && (region === 'tw' || region === 'hk' || region === 'mo')))
        locale = 'zh-Hant'
      else if (langCode === 'ja-jp' || langCode === 'ja')
        locale = 'ja-JP'

      if (locale !== 'en-US')
        break
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
