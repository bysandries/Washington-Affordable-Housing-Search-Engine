'use client'

import { useEffect } from 'react'
import { Icon, isDarkTheme, setTheme, syncThemeColor } from '@/lib/theme'

/**
 * The appearance toggle (search header and content pages). An icon button
 * whose name states the action: "Switch to dark appearance" in light, "Switch
 * to light appearance" in dark.
 *
 * It holds no state. Both icons and both names are in the markup, and CSS
 * (.theme-when-light / .theme-when-dark in globals.css) shows the pair that
 * matches the html.dark class, which the no-flash script in app/layout.js sets
 * before first paint. So the icon and the accessible name are right in the
 * server HTML, before hydration, and they follow the OS live when no explicit
 * choice is stored, with no subscription here.
 *
 * On mount it re-points the browser's theme-color meta at the appearance
 * shown (syncThemeColor), in case a navigation lost or reset it.
 */
export default function ThemeToggle({ className = '' }) {
  useEffect(() => {
    syncThemeColor()
  }, [])
  return (
    <button
      type="button"
      onClick={() => setTheme(!isDarkTheme())}
      className={`btn-icon ${className}`.trim()}
    >
      <Icon name="moon" size={18} className="theme-when-light" />
      <Icon name="sun" size={18} className="theme-when-dark" />
      <span className="theme-when-light sr-only">Switch to dark appearance</span>
      <span className="theme-when-dark sr-only">Switch to light appearance</span>
    </button>
  )
}
