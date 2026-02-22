'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useClientFieldConfig, type ClientFieldConfig, DEFAULT_CLIENT_FIELD_CONFIG } from '@/lib/context/client-field-config'

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${checked ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 border-b last:border-b-0 ${disabled ? 'opacity-50' : ''}`}>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export default function SettingsClientsPage() {
  const { setFieldConfig } = useClientFieldConfig()
  const [config, setConfig] = useState<ClientFieldConfig>(DEFAULT_CLIENT_FIELD_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/client-fields').then(r => r.json())
      if (res.data) setConfig(res.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const save = useCallback(async (next: ClientFieldConfig) => {
    setSaving(true)
    // Optimistic update in context
    setFieldConfig(next)
    try {
      const res = await fetch('/api/settings/client-fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).then(r => r.json())
      if (res.error) {
        toast.error(res.error)
        // Revert optimistic update
        setFieldConfig(config)
      } else {
        toast.success('Paramètres clients enregistrés')
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde')
      setFieldConfig(config)
    }
    setSaving(false)
  }, [config, setFieldConfig])

  const toggle = useCallback((key: keyof ClientFieldConfig) => {
    const next = { ...config, [key]: !config[key] }
    setConfig(next)
    save(next)
  }, [config, save])

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Clients</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Personnalisez les informations affichées dans la fiche et la liste clients.
        </p>
      </div>

      {/* Section : Fiche client */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold">Informations dans la fiche client</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ces champs sont visibles lorsque vous ouvrez le détail d'un client.
          </p>
        </div>
        <div className="px-4 pb-2">
          <SettingRow
            label="Email"
            description="Affiche l'adresse email du client dans sa fiche."
            checked={config.detail_email}
            onChange={() => toggle('detail_email')}
          />
          <SettingRow
            label="Date d'anniversaire"
            description="Affiche la date d'anniversaire, utile pour des offres personnalisées."
            checked={config.detail_birthday}
            onChange={() => toggle('detail_birthday')}
          />
          <SettingRow
            label="Notes"
            description="Affiche un bloc de notes libres pour chaque client."
            checked={config.detail_notes}
            onChange={() => toggle('detail_notes')}
          />
          <SettingRow
            label="Dernière activité"
            description="Affiche la date de la dernière commande ou rendez-vous du client."
            checked={config.detail_last_activity}
            onChange={() => toggle('detail_last_activity')}
          />
        </div>
      </div>

      {/* Section : Colonnes de la liste */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold">Colonnes de la liste clients</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ces colonnes s'affichent dans le tableau principal. Une colonne est masquée si aucun client ne possède cette donnée.
          </p>
        </div>
        <div className="px-4 pb-2">
          <SettingRow
            label="Email"
            description="Affiche la colonne Email dans la liste."
            checked={config.list_email}
            onChange={() => toggle('list_email')}
            disabled={!config.detail_email}
          />
          <SettingRow
            label="Anniversaire"
            description="Affiche la colonne Anniversaire dans la liste."
            checked={config.list_birthday}
            onChange={() => toggle('list_birthday')}
            disabled={!config.detail_birthday}
          />
          <SettingRow
            label="Dernière activité"
            description="Affiche la date de la dernière interaction (commande ou RDV)."
            checked={config.list_last_activity}
            onChange={() => toggle('list_last_activity')}
            disabled={!config.detail_last_activity}
          />
        </div>
      </div>

      {saving && (
        <p className="text-xs text-muted-foreground text-right">Sauvegarde…</p>
      )}
    </div>
  )
}
