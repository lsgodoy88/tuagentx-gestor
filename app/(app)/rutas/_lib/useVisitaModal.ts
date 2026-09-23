import { useState } from 'react'

export function useVisitaModal() {
  const [visitaModal, setVisitaModal] = useState<any>(null)
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)

  function cerrar() {
    setVisitaModal(null)
    setFirmaUrl(null)
  }

  return { visitaModal, setVisitaModal, firmaUrl, setFirmaUrl, cerrar }
}

export type UseVisitaModal = ReturnType<typeof useVisitaModal>
