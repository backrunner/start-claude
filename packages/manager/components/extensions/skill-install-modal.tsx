'use client'

import type { ReactNode } from 'react'
import type { ExtensionsLibrary } from '@/config/types'
import { Download, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/use-toast'

interface SkillInstallModalProps {
  open: boolean
  onClose: () => void
  beforeInstall: () => Promise<void>
  onInstalled: (library: ExtensionsLibrary) => Promise<void>
}

interface InstallResponse {
  error?: string
  library?: ExtensionsLibrary
}

export function SkillInstallModal({
  open,
  onClose,
  beforeInstall,
  onInstalled,
}: SkillInstallModalProps): ReactNode {
  const t = useTranslations('extensions.skills.install')
  const { toast } = useToast()
  const [source, setSource] = useState('')
  const [skillNames, setSkillNames] = useState('')
  const [repo, setRepo] = useState(false)
  const [force, setForce] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [sourceError, setSourceError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setSource('')
    setSkillNames('')
    setRepo(false)
    setForce(false)
    setSourceError('')
  }, [open])

  const handleInstall = async (): Promise<void> => {
    if (!source.trim()) {
      setSourceError(t('sourceRequired'))
      return
    }

    try {
      setInstalling(true)
      setSourceError('')
      await beforeInstall()

      const skills = skillNames
        .split(',')
        .map(name => name.trim())
        .filter(Boolean)
      const response = await fetch('/api/extensions/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: source.trim(),
          repo,
          force,
          skills: skills.length > 0 ? skills : undefined,
        }),
      })
      const data = await response.json() as InstallResponse
      if (!response.ok || !data.library) {
        throw new Error(data.error || t('failedDescription'))
      }

      await onInstalled(data.library)
      toast({
        title: t('success'),
        description: t('successDescription'),
        variant: 'success',
      })
      onClose()
    }
    catch (error) {
      console.error('Failed to install skill from SkillsCat:', error)
      toast({
        title: t('failed'),
        description: error instanceof Error ? error.message : t('failedDescription'),
        variant: 'destructive',
      })
    }
    finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={event => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="skillscat-source">{t('source')}</Label>
            <Input
              id="skillscat-source"
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setSourceError('')
              }}
              placeholder={t('sourcePlaceholder')}
              disabled={installing}
              className={sourceError ? 'border-destructive' : ''}
            />
            {sourceError && <p className="text-sm text-destructive">{sourceError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="skillscat-skills">{t('skills')}</Label>
            <Input
              id="skillscat-skills"
              value={skillNames}
              onChange={event => setSkillNames(event.target.value)}
              placeholder={t('skillsPlaceholder')}
              disabled={installing}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="skillscat-repo"
                checked={repo}
                onCheckedChange={checked => setRepo(checked === true)}
                disabled={installing}
              />
              <Label htmlFor="skillscat-repo" className="cursor-pointer font-normal">
                {t('repo')}
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="skillscat-force"
                checked={force}
                onCheckedChange={checked => setForce(checked === true)}
                disabled={installing}
              />
              <Label htmlFor="skillscat-force" className="cursor-pointer font-normal">
                {t('force')}
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={installing}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleInstall()} disabled={installing}>
            {installing
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            {installing ? t('installing') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
