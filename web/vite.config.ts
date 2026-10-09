import { createHash } from 'node:crypto'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Politique de sécurité du contenu (CSP), posée en balise <meta> dans index.html :
 * le navigateur refuse tout script qui ne vient pas de l'application elle-même, et n'échange
 * qu'avec Supabase, le registre GLEIF et les données de langue de l'OCR.
 * Les scripts intégrés à la page (préambule de React en mode développement) sont autorisés
 * un par un, par leur empreinte.
 */
function csp(supabaseUrl: string): Plugin {
  const supa = new URL(supabaseUrl)
  return {
    name: 'sfcr-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const dev = !!ctx.server
        const hashes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
        const policy = [
          "default-src 'self'",
          `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`,
          "worker-src 'self' blob:",
          `connect-src 'self' ${supa.origin} wss://${supa.host} https://api.gleif.org https://cdn.jsdelivr.net${dev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
          "img-src 'self' data: blob:",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          `frame-src ${supa.origin} blob:`,
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; ')
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }]
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  // En-têtes de sécurité, en développement comme en prévisualisation
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
  }
  return {
    plugins: [react(), csp(env.VITE_SUPABASE_URL)],
    server: { headers },
    preview: { headers },
  }
})
