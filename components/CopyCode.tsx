'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

/** Monospace code with a small copy-to-clipboard button. */
export default function CopyCode({ code, className = '' }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(`Code ${code} copié`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copie impossible')
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] pl-1.5 pr-1 py-0.5 rounded bg-muted text-muted-foreground ${className}`}>
      {code}
      <button
        type="button"
        onClick={copy}
        title="Copier le code"
        aria-label={`Copier le code ${code}`}
        className="p-0.5 rounded hover:bg-background hover:text-foreground transition-colors"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  )
}
