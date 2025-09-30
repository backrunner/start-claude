import { describe, expect, it } from 'vitest'

describe('UUID-based Config Merging', () => {
  // Helper function to simulate the merge logic
  function mergeConfigsByUuid(
    localConfigs: any[],
    remoteConfigs: any[],
    localMtime: number,
    remoteMtime: number,
  ): any[] {
    const localMap = new Map<string, any>()
    const remoteMap = new Map<string, any>()
    const noIdConfigs: any[] = []

    localConfigs.forEach((config) => {
      if (config.id) {
        localMap.set(config.id, config)
      }
      else {
        noIdConfigs.push({ ...config, source: 'local' })
      }
    })

    remoteConfigs.forEach((config) => {
      if (config.id) {
        remoteMap.set(config.id, config)
      }
      else {
        noIdConfigs.push({ ...config, source: 'remote' })
      }
    })

    const mergedConfigs: any[] = []
    const allUuids = new Set([...localMap.keys(), ...remoteMap.keys()])

    allUuids.forEach((uuid) => {
      const localConfig = localMap.get(uuid)
      const remoteConfig = remoteMap.get(uuid)

      if (localConfig && remoteConfig) {
        if (localMtime > remoteMtime) {
          mergedConfigs.push(localConfig)
        }
        else if (remoteMtime > localMtime) {
          mergedConfigs.push(remoteConfig)
        }
        else {
          mergedConfigs.push(remoteConfig) // Prefer remote on tie
        }
      }
      else if (localConfig) {
        mergedConfigs.push(localConfig)
      }
      else if (remoteConfig) {
        mergedConfigs.push(remoteConfig)
      }
    })

    noIdConfigs.forEach((config) => {
      const { source, ...configWithoutSource } = config
      mergedConfigs.push(configWithoutSource)
    })

    return mergedConfigs
  }

  describe('Same UUID Merging', () => {
    it('should use local config when local file is newer', () => {
      const uuid = 'test-uuid-123'
      const localConfigs = [{
        id: uuid,
        name: 'local-config',
        apiKey: 'local-key',
      }]
      const remoteConfigs = [{
        id: uuid,
        name: 'remote-config',
        apiKey: 'remote-key',
      }]

      const localMtime = Date.now()
      const remoteMtime = localMtime - 10000 // Remote is older

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('local-config')
      expect(merged[0].apiKey).toBe('local-key')
    })

    it('should use remote config when remote file is newer', () => {
      const uuid = 'test-uuid-456'
      const localConfigs = [{
        id: uuid,
        name: 'local-config',
        apiKey: 'local-key',
      }]
      const remoteConfigs = [{
        id: uuid,
        name: 'remote-config',
        apiKey: 'remote-key',
      }]

      const localMtime = Date.now() - 10000 // Local is older
      const remoteMtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('remote-config')
      expect(merged[0].apiKey).toBe('remote-key')
    })

    it('should prefer remote when both files have same modification time', () => {
      const uuid = 'test-uuid-789'
      const localConfigs = [{
        id: uuid,
        name: 'local-config',
        apiKey: 'local-key',
      }]
      const remoteConfigs = [{
        id: uuid,
        name: 'remote-config',
        apiKey: 'remote-key',
      }]

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('remote-config')
      expect(merged[0].apiKey).toBe('remote-key')
    })
  })

  describe('Different UUID Merging', () => {
    it('should keep both configs when they have different UUIDs', () => {
      const localConfigs = [{
        id: 'uuid-local',
        name: 'local-config',
        apiKey: 'local-key',
      }]
      const remoteConfigs = [{
        id: 'uuid-remote',
        name: 'remote-config',
        apiKey: 'remote-key',
      }]

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(2)
      expect(merged.some(c => c.name === 'local-config')).toBe(true)
      expect(merged.some(c => c.name === 'remote-config')).toBe(true)
    })

    it('should handle multiple configs with different UUIDs', () => {
      const localConfigs = [
        { id: 'uuid-1', name: 'local-1', apiKey: 'key-1' },
        { id: 'uuid-2', name: 'local-2', apiKey: 'key-2' },
      ]
      const remoteConfigs = [
        { id: 'uuid-3', name: 'remote-3', apiKey: 'key-3' },
        { id: 'uuid-4', name: 'remote-4', apiKey: 'key-4' },
      ]

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(4)
      expect(merged.map(c => c.name)).toEqual(
        expect.arrayContaining(['local-1', 'local-2', 'remote-3', 'remote-4']),
      )
    })
  })

  describe('Mixed UUID Scenarios', () => {
    it('should handle mix of matching and non-matching UUIDs', () => {
      const sharedUuid = 'shared-uuid'
      const localConfigs = [
        { id: sharedUuid, name: 'shared-local', apiKey: 'local-key' },
        { id: 'local-only-uuid', name: 'local-only', apiKey: 'local-only-key' },
      ]
      const remoteConfigs = [
        { id: sharedUuid, name: 'shared-remote', apiKey: 'remote-key' },
        { id: 'remote-only-uuid', name: 'remote-only', apiKey: 'remote-only-key' },
      ]

      const localMtime = Date.now()
      const remoteMtime = localMtime + 1000 // Remote is newer

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      expect(merged).toHaveLength(3)
      expect(merged.some(c => c.name === 'shared-remote')).toBe(true) // Remote wins
      expect(merged.some(c => c.name === 'local-only')).toBe(true)
      expect(merged.some(c => c.name === 'remote-only')).toBe(true)
    })
  })

  describe('Configs without UUID', () => {
    it('should keep configs without UUIDs from both sources', () => {
      const localConfigs = [
        { name: 'local-no-id', apiKey: 'local-key' },
      ]
      const remoteConfigs = [
        { name: 'remote-no-id', apiKey: 'remote-key' },
      ]

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(2)
      expect(merged.some(c => c.name === 'local-no-id')).toBe(true)
      expect(merged.some(c => c.name === 'remote-no-id')).toBe(true)
    })

    it('should handle mix of configs with and without UUIDs', () => {
      const localConfigs = [
        { id: 'uuid-1', name: 'with-id-local', apiKey: 'key-1' },
        { name: 'no-id-local', apiKey: 'key-2' },
      ]
      const remoteConfigs = [
        { id: 'uuid-1', name: 'with-id-remote', apiKey: 'key-3' },
        { name: 'no-id-remote', apiKey: 'key-4' },
      ]

      const localMtime = Date.now() + 1000 // Local is newer
      const remoteMtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      expect(merged).toHaveLength(3)
      expect(merged.some(c => c.name === 'with-id-local')).toBe(true) // Local wins for same UUID
      expect(merged.some(c => c.name === 'no-id-local')).toBe(true)
      expect(merged.some(c => c.name === 'no-id-remote')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty local configs', () => {
      const localConfigs: any[] = []
      const remoteConfigs = [
        { id: 'uuid-1', name: 'remote-1', apiKey: 'key-1' },
      ]

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('remote-1')
    })

    it('should handle empty remote configs', () => {
      const localConfigs = [
        { id: 'uuid-1', name: 'local-1', apiKey: 'key-1' },
      ]
      const remoteConfigs: any[] = []

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('local-1')
    })

    it('should handle both empty', () => {
      const localConfigs: any[] = []
      const remoteConfigs: any[] = []

      const mtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, mtime, mtime)

      expect(merged).toHaveLength(0)
    })

    it('should handle multiple configs with same UUID', () => {
      // This shouldn't happen in practice, but test robustness
      const sharedUuid = 'duplicate-uuid'
      const localConfigs = [
        { id: sharedUuid, name: 'duplicate-1', apiKey: 'key-1' },
      ]
      const remoteConfigs = [
        { id: sharedUuid, name: 'duplicate-2', apiKey: 'key-2' },
      ]

      const localMtime = Date.now()
      const remoteMtime = localMtime + 1000

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      // Should only keep one (the remote one since it's newer)
      expect(merged).toHaveLength(1)
      expect(merged[0].name).toBe('duplicate-2')
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle typical multi-device sync scenario', () => {
      // Computer A adds two configs
      const localConfigs = [
        { id: 'config-a-1', name: 'Computer A - Config 1', apiKey: 'key-a1' },
        { id: 'config-a-2', name: 'Computer A - Config 2', apiKey: 'key-a2' },
      ]

      // Computer B also adds two configs and modifies config-a-1
      const remoteConfigs = [
        { id: 'config-a-1', name: 'Computer A - Config 1 (modified)', apiKey: 'key-a1-modified' },
        { id: 'config-b-1', name: 'Computer B - Config 1', apiKey: 'key-b1' },
        { id: 'config-b-2', name: 'Computer B - Config 2', apiKey: 'key-b2' },
      ]

      // Remote was modified more recently
      const localMtime = Date.now() - 60000
      const remoteMtime = Date.now()

      const merged = mergeConfigsByUuid(localConfigs, remoteConfigs, localMtime, remoteMtime)

      expect(merged).toHaveLength(4)
      // config-a-1 should be the remote version (modified)
      const configA1 = merged.find(c => c.id === 'config-a-1')
      expect(configA1?.name).toContain('modified')
      // Should have all unique configs
      expect(merged.some(c => c.id === 'config-a-2')).toBe(true)
      expect(merged.some(c => c.id === 'config-b-1')).toBe(true)
      expect(merged.some(c => c.id === 'config-b-2')).toBe(true)
    })
  })
})
