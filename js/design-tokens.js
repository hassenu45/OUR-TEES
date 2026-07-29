/* Design Tokens Loader - يطبق أكواد التصميم من الإعدادات مباشرة */
(function applyDesignTokens() {
  try {
    const settings = DB.getSettings();
    if (!settings || !settings.designTokens) return;

    const dt = settings.designTokens;
    const root = document.documentElement;

    root.style.setProperty('--color-primary', dt.primary || '#1C1917');
    root.style.setProperty('--color-accent', dt.accent || '#A16207');
    root.style.setProperty('--color-background', dt.background || '#FAFAF9');
    root.style.setProperty('--font-heading-family', `'${dt.fontHeading || 'Cormorant'}', serif`);
    root.style.setProperty('--font-body-family', `'${dt.fontBody || 'Montserrat'}', sans-serif`);

    document.body.style.fontFamily = `'${dt.fontBody || 'Montserrat'}', sans-serif`;

    const fontLink = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    if (fontLink) {
      const heading = dt.fontHeading || 'Cormorant';
      const body = dt.fontBody || 'Montserrat';
      fontLink.href = `https://fonts.googleapis.com/css2?family=${heading.replace(/ /g, '+')}:wght@400;500;600;700&family=${body.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`;
    }
  } catch (e) {
    console.warn('Design tokens apply failed:', e.message);
  }
})();
