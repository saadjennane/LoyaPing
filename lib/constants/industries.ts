export type Industry = { value: string; label: string; emoji: string }

export const INDUSTRIES: Industry[] = [
  { value: 'coiffure',        label: 'Coiffure',               emoji: '✂️' },
  { value: 'barbier',         label: 'Barbier',                emoji: '💈' },
  { value: 'esthetique',      label: 'Esthétique & Spa',       emoji: '💅' },
  { value: 'restaurant',      label: 'Restaurant & Café',      emoji: '🍽️' },
  { value: 'boulangerie',     label: 'Boulangerie & Pâtisserie', emoji: '🥐' },
  { value: 'alimentation',    label: 'Épicerie & Alimentation', emoji: '🛒' },
  { value: 'pharmacie',       label: 'Pharmacie & Parapharmacie', emoji: '💊' },
  { value: 'mode',            label: 'Mode & Habillement',     emoji: '👗' },
  { value: 'sport',           label: 'Sport & Bien-être',      emoji: '🏋️' },
  { value: 'auto',            label: 'Auto & Moto',            emoji: '🚗' },
  { value: 'electronique',    label: 'Électronique & High-tech', emoji: '📱' },
  { value: 'opticien',        label: 'Optique',                emoji: '👓' },
  { value: 'bijouterie',      label: 'Bijouterie',             emoji: '💍' },
  { value: 'librairie',       label: 'Librairie & Papeterie',  emoji: '📚' },
  { value: 'pressing',        label: 'Pressing & Blanchisserie', emoji: '👔' },
  { value: 'autre',           label: 'Autre',                  emoji: '🏪' },
]
