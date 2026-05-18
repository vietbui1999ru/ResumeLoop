// IndexedDB wrapper for FileSystemDirectoryHandle persistence.
// Client-only — never import in server code or test files.

const DB_NAME = 'resumeloop-fs'
const STORE   = 'handles'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function storeHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function loadHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

// queryPermission / requestPermission are not in the TypeScript DOM lib yet — cast to any.
type HandleWithPermission = FileSystemDirectoryHandle & {
  queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>
  requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>
}

export async function checkPermission(handle: FileSystemDirectoryHandle): Promise<'granted' | 'prompt' | 'denied'> {
  return (handle as HandleWithPermission).queryPermission({ mode: 'read' })
}

export async function requestPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const state = await (handle as HandleWithPermission).requestPermission({ mode: 'read' })
  return state === 'granted'
}

// entries() is an async iterator not yet in all TS DOM typings — cast to any.
type IterableHandle = {
  entries(): AsyncIterable<[string, FileSystemHandle]>
}

/** Read all .md files from a directory handle (top-level only). */
export async function readMdFiles(handle: FileSystemDirectoryHandle): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = []
  for await (const [name, entry] of (handle as unknown as IterableHandle).entries()) {
    if (entry.kind === 'file' && name.endsWith('.md')) {
      const file = await (entry as FileSystemFileHandle).getFile()
      const content = await file.text()
      files.push({ name, content })
    }
  }
  return files
}
