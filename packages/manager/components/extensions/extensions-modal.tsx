'use client'

import type { ReactNode } from 'react'
import type { ExtensionsLibrary, McpServerDefinition, SkillDefinition, SubagentDefinition } from '@/config/types'
import { Blocks, Edit, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/lib/use-toast'
import { McpServerFormModal } from './mcp-server-form-modal'
import { SkillFormModal } from './skill-form-modal'
import { SubagentFormModal } from './subagent-form-modal'

interface ExtensionsModalProps {
  open: boolean
  onClose: () => void
  initialLibrary?: ExtensionsLibrary
  onSave: (library: ExtensionsLibrary) => Promise<void>
}

export function ExtensionsModal({
  open,
  onClose,
  initialLibrary,
  onSave,
}: ExtensionsModalProps): ReactNode {
  const t = useTranslations('extensions')

  const [library, setLibrary] = useState<ExtensionsLibrary>(
    initialLibrary || {
      mcpServers: {},
      skills: {},
      subagents: {},
    },
  )

  const [activeTab, setActiveTab] = useState<string>('mcp')
  const [saving, setSaving] = useState(false)

  // Sync library state when initialLibrary prop changes or modal opens
  useEffect(() => {
    if (open && initialLibrary) {
      setLibrary(initialLibrary)
    }
  }, [open, initialLibrary])

  // Form modal states
  const [mcpFormOpen, setMcpFormOpen] = useState(false)
  const [skillFormOpen, setSkillFormOpen] = useState(false)
  const [subagentFormOpen, setSubagentFormOpen] = useState(false)

  // Edit data states
  const [editingMcp, setEditingMcp] = useState<McpServerDefinition | undefined>()
  const [editingSkill, setEditingSkill] = useState<SkillDefinition | undefined>()
  const [editingSubagent, setEditingSubagent] = useState<SubagentDefinition | undefined>()

  // Delete confirmation states
  const [deletingItem, setDeletingItem] = useState<{ type: 'mcp' | 'skill' | 'subagent', id: string, name: string } | null>(null)

  const { toast } = useToast()

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true)
      await onSave(library)
      toast({
        title: t('saveSuccess'),
        description: t('saveSuccessDescription'),
      })
      onClose()
    }
    catch (error) {
      console.error('Failed to save extensions library:', error)
      toast({
        title: t('saveError'),
        description: t('saveErrorDescription'),
        variant: 'destructive',
      })
    }
    finally {
      setSaving(false)
    }
  }

  const handleSaveClick = (): void => {
    void handleSave()
  }

  const handleAddMcpServer = (): void => {
    setEditingMcp(undefined)
    setMcpFormOpen(true)
  }

  const handleAddSkill = (): void => {
    setEditingSkill(undefined)
    setSkillFormOpen(true)
  }

  const handleAddSubagent = (): void => {
    setEditingSubagent(undefined)
    setSubagentFormOpen(true)
  }

  const handleEditMcp = (server: McpServerDefinition): void => {
    setEditingMcp(server)
    setMcpFormOpen(true)
  }

  const handleEditSkill = (skill: SkillDefinition): void => {
    setEditingSkill(skill)
    setSkillFormOpen(true)
  }

  const handleEditSubagent = (subagent: SubagentDefinition): void => {
    setEditingSubagent(subagent)
    setSubagentFormOpen(true)
  }

  const handleDeleteMcp = (id: string, name: string): void => {
    setDeletingItem({ type: 'mcp', id, name })
  }

  const handleDeleteSkill = (id: string, name: string): void => {
    setDeletingItem({ type: 'skill', id, name })
  }

  const handleDeleteSubagent = (id: string, name: string): void => {
    setDeletingItem({ type: 'subagent', id, name })
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deletingItem)
      return

    try {
      const updatedLibrary = { ...library }

      if (deletingItem.type === 'mcp') {
        const { [deletingItem.id]: _, ...rest } = updatedLibrary.mcpServers
        updatedLibrary.mcpServers = rest
      }
      else if (deletingItem.type === 'skill') {
        const { [deletingItem.id]: _, ...rest } = updatedLibrary.skills
        updatedLibrary.skills = rest
      }
      else if (deletingItem.type === 'subagent') {
        const { [deletingItem.id]: _, ...rest } = updatedLibrary.subagents
        updatedLibrary.subagents = rest
      }

      setLibrary(updatedLibrary)
      setDeletingItem(null)

      toast({
        title: t('deleteSuccess'),
        description: t('deleteSuccessDescription'),
      })
    }
    catch (error) {
      console.error('Failed to delete extension:', error)
      toast({
        title: t('deleteError'),
        description: t('deleteErrorDescription'),
        variant: 'destructive',
      })
    }
  }

  const handleConfirmDelete = (): void => {
    void confirmDelete()
  }

  const handleSaveMcp = async (server: McpServerDefinition): Promise<void> => {
    setLibrary({
      ...library,
      mcpServers: {
        ...library.mcpServers,
        [server.id]: server,
      },
    })
    setMcpFormOpen(false)
    setEditingMcp(undefined)
  }

  const handleSaveSkill = async (skill: SkillDefinition): Promise<void> => {
    setLibrary({
      ...library,
      skills: {
        ...library.skills,
        [skill.id]: skill,
      },
    })
    setSkillFormOpen(false)
    setEditingSkill(undefined)
  }

  const handleSaveSubagent = async (subagent: SubagentDefinition): Promise<void> => {
    setLibrary({
      ...library,
      subagents: {
        ...library.subagents,
        [subagent.id]: subagent,
      },
    })
    setSubagentFormOpen(false)
    setEditingSubagent(undefined)
  }

  const mcpServersCount = Object.keys(library.mcpServers).length
  const skillsCount = Object.keys(library.skills).length
  const subagentsCount = Object.keys(library.subagents).length

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-6 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent -mt-6 -mx-6 px-6 pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Blocks className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {t('title')}
              </DialogTitle>
              <DialogDescription className="text-base mt-1.5 text-muted-foreground">
                {t('description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          <div className="px-2">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col space-y-4"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="mcp" className="flex items-center gap-2">
                  {t('tabs.mcp')}
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                    {mcpServersCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="skills" className="flex items-center gap-2">
                  {t('tabs.skills')}
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                    {skillsCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="subagents" className="flex items-center gap-2">
                  {t('tabs.subagents')}
                  <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                    {subagentsCount}
                  </span>
                </TabsTrigger>
              </TabsList>

              {/* MCP Servers Tab */}
              <TabsContent value="mcp" className="mt-0 space-y-4">
                <div className="space-y-4 py-4 px-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{t('mcp.title')}</h3>
                      <p className="text-sm text-muted-foreground">{t('mcp.description')}</p>
                    </div>
                    <Button onClick={handleAddMcpServer} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('mcp.add')}
                    </Button>
                  </div>

                  {mcpServersCount === 0
                    ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="rounded-full bg-muted p-4 mb-4">
                            <Blocks className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{t('mcp.empty')}</p>
                        </div>
                      )
                    : (
                        <div className="space-y-2 px-0.5">
                          {Object.entries(library.mcpServers).map(([id, server]) => (
                            <div
                              key={id}
                              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1">
                                <h4 className="font-medium">{server.name}</h4>
                                {server.description && (
                                  <p className="text-sm text-muted-foreground">{server.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Type:
                                  {' '}
                                  {server.type}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditMcp(server)}
                                  title={t('edit')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteMcp(id, server.name)}
                                  title={t('delete')}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              </TabsContent>

              {/* Skills Tab */}
              <TabsContent value="skills" className="mt-0 space-y-4">
                <div className="space-y-4 py-4 px-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{t('skills.title')}</h3>
                      <p className="text-sm text-muted-foreground">{t('skills.description')}</p>
                    </div>
                    <Button onClick={handleAddSkill} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('skills.add')}
                    </Button>
                  </div>

                  {skillsCount === 0
                    ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="rounded-full bg-muted p-4 mb-4">
                            <Blocks className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{t('skills.empty')}</p>
                        </div>
                      )
                    : (
                        <div className="space-y-2 px-0.5">
                          {Object.entries(library.skills).map(([id, skill]) => (
                            <div
                              key={id}
                              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1">
                                <h4 className="font-medium">{skill.name}</h4>
                                <p className="text-sm text-muted-foreground">{skill.description}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditSkill(skill)}
                                  title={t('edit')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteSkill(id, skill.name)}
                                  title={t('delete')}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              </TabsContent>

              {/* Subagents Tab */}
              <TabsContent value="subagents" className="mt-0 space-y-4">
                <div className="space-y-4 py-4 px-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{t('subagents.title')}</h3>
                      <p className="text-sm text-muted-foreground">{t('subagents.description')}</p>
                    </div>
                    <Button onClick={handleAddSubagent} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('subagents.add')}
                    </Button>
                  </div>

                  {subagentsCount === 0
                    ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="rounded-full bg-muted p-4 mb-4">
                            <Blocks className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">{t('subagents.empty')}</p>
                        </div>
                      )
                    : (
                        <div className="space-y-2 px-0.5">
                          {Object.entries(library.subagents).map(([id, subagent]) => (
                            <div
                              key={id}
                              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1">
                                <h4 className="font-medium">{subagent.name}</h4>
                                <p className="text-sm text-muted-foreground">{subagent.description}</p>
                                {subagent.model && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Model:
                                    {' '}
                                    {subagent.model}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditSubagent(subagent)}
                                  title={t('edit')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteSubagent(id, subagent.name)}
                                  title={t('delete')}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSaveClick} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Form Modals */}
      <McpServerFormModal
        open={mcpFormOpen}
        onClose={() => {
          setMcpFormOpen(false)
          setEditingMcp(undefined)
        }}
        onSave={handleSaveMcp}
        initialData={editingMcp}
        existingIds={Object.keys(library.mcpServers)}
      />

      <SkillFormModal
        open={skillFormOpen}
        onClose={() => {
          setSkillFormOpen(false)
          setEditingSkill(undefined)
        }}
        onSave={handleSaveSkill}
        initialData={editingSkill}
        existingIds={Object.keys(library.skills)}
      />

      <SubagentFormModal
        open={subagentFormOpen}
        onClose={() => {
          setSubagentFormOpen(false)
          setEditingSubagent(undefined)
        }}
        onSave={handleSaveSubagent}
        initialData={editingSubagent}
        existingIds={Object.keys(library.subagents)}
      />

      {/* Delete Confirmation Dialog */}
      {deletingItem && (
        <Dialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
          <DialogContent
            onEscapeKeyDown={(e) => {
              // Prevent ESC from bubbling to parent dialog
              e.stopPropagation()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('confirmDelete.title')}</DialogTitle>
              <DialogDescription>
                {t('confirmDelete.description', { name: deletingItem.name })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingItem(null)}>
                {t('confirmDelete.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                {t('confirmDelete.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
